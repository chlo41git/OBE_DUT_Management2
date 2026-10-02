import type { CheckOutUnitResult } from '@obe/shared';
import { prisma } from '../db/prisma';
import { formatDateTime, isSlotCode, normSlot, normSn, operatorLabel } from '../lib/logic';
import { badRequest, conflict, notFound } from '../lib/httpError';
import { toSlotDTO, toUnitDTO } from '../lib/mappers';
import { bumpScan, logMovement } from './eventService';
import type { Operator } from '../lib/operator';

/** 刷退指令條碼內容（POC v04-1 CMD_OUT）。前端刷到它才進入刷退模式，不代表任何櫃位。 */
export const CHECKOUT_COMMAND_CODE = 'OBE-OUT';

/**
 * 刷退：刷機台 S/N 即釋放它所在的儲位（無二次確認）。Ported from POC v04-1 handleOut()/releaseUnit().
 * 「刷退模式」只存在前端；後端每次都獨立檢查，並以條件式更新防止重複送出。
 */
export async function checkoutByUnit(raw: string, operator: Operator): Promise<CheckOutUnitResult> {
  const v = normSn(raw);
  const asSlot = normSlot(raw);
  if (isSlotCode(asSlot)) {
    const s = await prisma.slot.findUnique({ where: { code: asSlot }, include: { unit: true } });
    return {
      outcome: 'SLOT_CODE',
      message: s
        ? s.unit
          ? `[${asSlot}] 目前放的是 ${s.unit.sn}，請直接刷機台上的 S/N 條碼。`
          : `[${asSlot}] 系統顯示為空位。`
        : `查無 [${asSlot}] 這個櫃位條碼。`,
    };
  }

  const u = await prisma.unit.findUnique({ where: { sn: v }, include: { issues: true } });
  if (!u) {
    return { outcome: 'UNKNOWN_SN', message: `[${v}] 不在機台主檔。請確認刷到的是機台的 S/N 條碼，不是包裝或治具上的碼。` };
  }
  if (u.state === 'OUT') {
    return {
      outcome: 'ALREADY_OUT',
      message: `[${u.sn}] 由 ${u.loanBy ?? '-'} 於 ${u.loanOutAt ? formatDateTime(u.loanOutAt) : '-'} 取走，目前不在架上，不需重複刷退。`,
      unit: toUnitDTO(u),
    };
  }
  if (u.state === 'LEFT') return { outcome: 'LEFT_UNIT', message: `[${u.sn}] 已出貨或報廢，不在管理範圍。`, unit: toUnitDTO(u) };
  if (u.state !== 'IN' || !u.slotCode) {
    return {
      outcome: 'NO_SLOT',
      message: `[${u.sn}] 系統查不到它在哪一格，可能是上架時沒刷櫃位。請改走「入庫上架」先把它綁到實際位置。`,
      unit: toUnitDTO(u),
    };
  }

  const slotCode = u.slotCode;
  const who = operatorLabel(operator);
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    // 防重複送出：條件式更新搶占。同一台同時被刷兩次時，後到者 count = 0、整筆回滾。
    const moved = await tx.unit.updateMany({
      where: { sn: u.sn, state: 'IN', slotCode },
      data: { state: 'OUT', slotCode: null, lastMoveAt: now, lastMoveBy: who, loanBy: who, loanOutAt: now },
    });
    if (moved.count !== 1) throw conflict('ALREADY_RELEASED', `[${u.sn}] 已經刷退過了，請勿重複刷取`);
    await tx.slot.updateMany({ where: { code: slotCode, status: 'OCCUPIED' }, data: { status: 'EMPTY' } });

    await logMovement(tx, { sn: u.sn, fromSlot: slotCode, action: '取機出庫', note: '刷退條碼 ＋ 刷機台 S/N 釋放' }, operator);
    await bumpScan(tx, 'scanned');

    const updatedUnit = await tx.unit.findUniqueOrThrow({ where: { sn: u.sn }, include: { issues: true } });
    const updatedSlot = await tx.slot.findUniqueOrThrow({ where: { code: slotCode }, include: { rack: true, unit: true } });
    return {
      outcome: 'RELEASED',
      message: `已刷退 ${u.sn}`,
      unit: toUnitDTO(updatedUnit),
      slot: toSlotDTO(updatedSlot),
      releasedAt: now.toISOString(),
    };
  });
}

/**
 * S/N 標籤破損，手動輸入機台 S/N — 只留稽核紀錄（不標記補印），之後前端照常送刷退。
 * Ported from POC v04-1 manualSN().
 */
export async function registerManualSn(snRaw: string, reasonRaw: string, operator: Operator): Promise<{ sn: string }> {
  const sn = normSn(snRaw);
  const reason = reasonRaw.trim();
  const u = await prisma.unit.findUnique({ where: { sn } });
  if (!u) throw notFound('UNIT_NOT_FOUND', '查無此 S/N');
  if (!reason) throw badRequest('REASON_REQUIRED', '請填理由');
  await logMovement(prisma, { sn, action: '手動輸入 S/N', note: `刷退｜理由：${reason}` }, operator);
  return { sn };
}
