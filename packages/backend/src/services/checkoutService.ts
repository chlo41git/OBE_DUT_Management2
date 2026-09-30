import type { CheckOutConfirmResult, CheckOutSlotResult } from '@obe/shared';
import { prisma } from '../db/prisma';
import { isSlotCode, normSlot, operatorLabel, SLOT_FORMAT_HINT } from '../lib/logic';
import { badRequest } from '../lib/httpError';
import { toSlotDTO, toUnitDTO } from '../lib/mappers';
import { bumpScan, logMovement } from './eventService';
import type { Operator } from '../lib/operator';

/** Step 1 — 刷櫃位條碼，回傳待二次確認的資訊（唯讀）。Ported from POC v0.4 handleOut(). */
export async function scanOutSlot(raw: string): Promise<CheckOutSlotResult> {
  const code = normSlot(raw);
  if (!isSlotCode(code)) {
    const u = await prisma.unit.findUnique({ where: { sn: code } });
    if (u) {
      const message =
        u.state === 'IN' && u.slotCode
          ? `[${u.sn}] 目前在 ${u.slotCode}，請到現場刷該格的櫃位條碼即可釋放。`
          : `[${u.sn}] 目前狀態為${u.state === 'OUT' ? '已取出' : u.state === 'LEFT' ? '已離場' : '待入庫'}，不在架上。`;
      return { outcome: 'WRONG_ORDER', message, unit: toUnitDTO(u) };
    }
    return { outcome: 'INVALID_FORMAT', message: `櫃位條碼格式為 ${SLOT_FORMAT_HINT}；標籤破損請按「手動輸入儲位」。` };
  }
  const slot = await prisma.slot.findUnique({ where: { code }, include: { rack: true, unit: { include: { issues: true } } } });
  if (!slot) return { outcome: 'NOT_FOUND', message: `系統無 [${code}]。` };
  if (slot.status === 'BLOCKED') {
    return { outcome: 'BLOCKED', message: `[${slot.code}] ${slot.blockReason ?? ''}，本來就不會有機台。`, slot: toSlotDTO(slot) };
  }
  if (!slot.unit) {
    return {
      outcome: 'EMPTY',
      message: `[${slot.code}] 沒有綁定任何機台。若現場實際有機台，請改走「入庫上架」把它綁上去。`,
      slot: toSlotDTO(slot),
    };
  }
  return { outcome: 'OK', message: '請二次確認後取出。', slot: toSlotDTO(slot), unit: toUnitDTO(slot.unit) };
}

/** Step 2 — 二次確認後釋放。Ported from POC v0.4 releaseSlot(). */
export async function confirmCheckOut(slotCodeRaw: string, operator: Operator): Promise<CheckOutConfirmResult> {
  const slotCode = normSlot(slotCodeRaw);
  const who = operatorLabel(operator);

  return prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { code: slotCode }, include: { unit: true } });
    if (!slot) throw badRequest('SLOT_NOT_FOUND', `查無此櫃位條碼：${slotCode}`);
    if (!slot.unit) throw badRequest('SLOT_EMPTY', `[${slotCode}] 沒有綁定任何機台`);

    const now = new Date();
    const updatedUnit = await tx.unit.update({
      where: { sn: slot.unit.sn },
      data: { state: 'OUT', slotCode: null, lastMoveAt: now, lastMoveBy: who, loanBy: who, loanOutAt: now },
      include: { issues: true },
    });
    const updatedSlot = await tx.slot.update({
      where: { code: slotCode },
      data: { status: 'EMPTY' },
      include: { rack: true, unit: true },
    });
    await logMovement(tx, { sn: updatedUnit.sn, fromSlot: slotCode, action: '取機出庫', note: '刷櫃位條碼並二次確認後釋放' }, operator);
    await bumpScan(tx, 'scanned');

    return {
      unit: toUnitDTO(updatedUnit),
      slot: toSlotDTO(updatedSlot),
      releasedAt: now.toISOString(),
      message: `已釋放 ${slotCode}`,
    };
  });
}
