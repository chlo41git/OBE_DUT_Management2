import type {
  CheckInCommitRequest,
  CheckInCommitResult,
  CheckInSlotResult,
  CheckInUnitResult,
} from '@obe/shared';
import { prisma } from '../db/prisma';
import { daysSince, isSlotCode, normSlot, operatorLabel, SLOT_FORMAT_HINT, slotLoc, suggestArea } from '../lib/logic';
import { areaDef } from '../lib/areaDefs';
import { badRequest } from '../lib/httpError';
import { toSlotDTO, toUnitDTO } from '../lib/mappers';
import { bumpScan, logMovement } from './eventService';
import type { Operator } from '../lib/operator';

/** Step 1 — 刷櫃位條碼。純讀取，不寫入。Ported from POC v0.4 inSlotScan(). */
export async function scanSlot(raw: string): Promise<CheckInSlotResult> {
  const code = normSlot(raw);
  if (!isSlotCode(code)) {
    const asUnit = await prisma.unit.findUnique({ where: { sn: code } });
    if (asUnit) {
      return { outcome: 'WRONG_ORDER', message: '請先刷你要放的那一格櫃位條碼，系統確認可放置後再刷機台 S/N。' };
    }
    return { outcome: 'INVALID_FORMAT', message: `櫃位條碼格式為 ${SLOT_FORMAT_HINT}；標籤破損請按「手動輸入儲位」。` };
  }
  const slot = await prisma.slot.findUnique({ where: { code }, include: { rack: true, unit: true } });
  if (!slot) return { outcome: 'NOT_FOUND', message: `系統無 [${code}]，可能是別區或尚未建檔的台車，請通知管理員。` };
  const dto = toSlotDTO(slot);
  if (!slot.rack.isActive) return { outcome: 'INACTIVE', message: `[${slot.rack.code}] 不可放置，請改用其他台車。`, slot: dto };
  if (slot.status === 'BLOCKED') return { outcome: 'BLOCKED', message: `[${slot.code}] ${slot.blockReason ?? ''}。請改刷其他空位。`, slot: dto };
  if (slot.unit) return { outcome: 'OCCUPIED', message: `[${slot.code}] 已被佔用，不能放。`, slot: dto };
  return { outcome: 'OK', message: `[${slot.code}] 為空位，可放置。若要改放別格，直接刷另一格的櫃位條碼即可更換目標。`, slot: dto };
}

async function assertSlotPlaceable(tx: Pick<typeof prisma, 'slot'>, slotCode: string) {
  const slot = await tx.slot.findUnique({ where: { code: slotCode }, include: { rack: true, unit: true } });
  if (!slot) throw badRequest('SLOT_NOT_FOUND', `查無此櫃位條碼：${slotCode}`);
  if (!slot.rack.isActive) throw badRequest('RACK_INACTIVE', `[${slot.rack.code}] 此台車已停用`);
  if (slot.status === 'BLOCKED') throw badRequest('SLOT_BLOCKED', `[${slotCode}] 停用中`);
  if (slot.unit) throw badRequest('SLOT_OCCUPIED', `[${slotCode}] 已被佔用，請重新刷櫃位`);
  return slot;
}

/** Step 2 — 刷機台 S/N（dry-run，判斷是否需要人員決策）。Ported from POC v0.4 inUnitScan(). */
export async function scanUnit(slotCodeRaw: string, snRaw: string): Promise<CheckInUnitResult> {
  const slotCode = normSlot(slotCodeRaw);
  const sn = normSlot(snRaw);

  if (isSlotCode(sn)) {
    return { outcome: 'SLOT_RESCAN', message: `原目標 ${slotCode} → 新目標將重新檢查。` };
  }
  await assertSlotPlaceable(prisma, slotCode);

  const unit = await prisma.unit.findUnique({ where: { sn }, include: { issues: true } });
  if (!unit) {
    return { outcome: 'UNKNOWN_SN', message: '可能是打字錯誤、他廠機台或未建 MO 的樣機。' };
  }
  const dto = toUnitDTO(unit);
  if (unit.state === 'LEFT') {
    return { outcome: 'LEFT_UNIT', message: '要重新入庫必須先「重新啟用」，並留下理由。', unit: dto };
  }
  if (unit.state === 'IN' && unit.slotCode && unit.slotCode !== slotCode) {
    return {
      outcome: 'NEED_MOVE_CONFIRM',
      message: '若是移位，系統會自動釋放原位；若原位那台其實是別台，請先到「找機台與儲位地圖」確認。',
      unit: dto,
      currentSlot: slotLoc(unit.slotCode),
    };
  }
  if (unit.state === 'IN' && unit.slotCode === slotCode) {
    return { outcome: 'ALREADY_HERE', message: `[${unit.sn}] 已經綁在 ${slotCode}，不需重複作業。`, unit: dto };
  }
  if (unit.state === 'OUT') return { outcome: 'RETURN', message: '歸還入庫', unit: dto };
  return { outcome: 'OK', message: '可直接完成綁定。', unit: dto };
}

/** Commit the binding inside a transaction. Ported from POC v0.4 commitIn(). */
export async function commitCheckIn(params: CheckInCommitRequest, operator: Operator): Promise<CheckInCommitResult> {
  const slotCode = normSlot(params.slotCode);
  const sn = normSlot(params.sn);
  if (isSlotCode(sn)) throw badRequest('SN_IS_SLOT', '刷入的是櫃位條碼，不是機台 S/N');
  const who = operatorLabel(operator);

  return prisma.$transaction(async (tx) => {
    const slot = await assertSlotPlaceable(tx, slotCode);
    let unit = await tx.unit.findUnique({ where: { sn }, include: { issues: true } });
    let how = '';

    if (!unit) {
      if (params.decision !== 'TEMP_CREATE') {
        throw badRequest('DECISION_REQUIRED', `${sn} 未建檔，須選擇「拒收退回」或「臨時建檔並上架」`);
      }
      unit = await tx.unit.create({
        data: { sn, project: '待補', model: '待補', phase: '待補', owner: '待補', dutStatus: '待測 EQM1', state: 'NEW', isTemp: true },
        include: { issues: true },
      });
      await logMovement(tx, { sn, toSlot: slotCode, action: '臨時建檔', note: '待補主檔資料' }, operator);
      how = '臨時建檔（待 JQE 於 SL2.0 補齊主檔）';
    } else if (unit.state === 'LEFT') {
      const reason = params.reason?.trim();
      if (params.decision !== 'REACTIVATE' || !reason) {
        throw badRequest('DECISION_REQUIRED', '已離場機台需選擇「重新啟用並上架」並填理由');
      }
      await logMovement(tx, { sn, toSlot: slotCode, action: '重新啟用', note: reason }, operator);
      how = '已離場機台重新啟用';
    } else if (unit.state === 'IN' && unit.slotCode && unit.slotCode !== slotCode) {
      if (params.decision !== 'CONFIRM_MOVE') {
        throw badRequest('DECISION_REQUIRED', '機台已在架上，需「確認移位到此格」');
      }
      await tx.slot.update({ where: { code: unit.slotCode }, data: { status: 'EMPTY' } });
      how = `移位（原位 ${unit.slotCode} 自動釋放）`;
    } else if (unit.state === 'IN' && unit.slotCode === slotCode) {
      throw badRequest('ALREADY_HERE', `[${unit.sn}] 已經綁在 ${slotCode}，不需重複作業`);
    } else if (unit.state === 'OUT') {
      how = `歸還入庫（離架 ${daysSince(unit.loanOutAt)} 天）`;
    }

    const now = new Date();
    const fromSlot = unit.state === 'IN' && unit.slotCode !== slotCode ? unit.slotCode : null;
    // 先解除原位綁定，避免 slotCode unique 與新位互撞
    if (fromSlot) await tx.unit.update({ where: { sn }, data: { slotCode: null } });
    const updatedUnit = await tx.unit.update({
      where: { sn },
      data: {
        slotCode,
        state: 'IN',
        inAt: unit.inAt ?? now,
        lastMoveAt: now,
        lastMoveBy: who,
        loanBy: null,
        loanOutAt: null,
      },
      include: { issues: true },
    });
    const updatedSlot = await tx.slot.update({
      where: { code: slotCode },
      data: { status: 'OCCUPIED' },
      include: { rack: true, unit: true },
    });

    const want = suggestArea(updatedUnit.dutStatus);
    const got = slot.rack.areaCode;
    const crossArea = want !== got;

    await logMovement(
      tx,
      {
        sn,
        fromSlot,
        toSlot: slotCode,
        action: '入庫上架',
        note: [how, '人員自選櫃位', crossArea ? `跨區擺放（建議 ${want}）` : ''].filter(Boolean).join('｜'),
      },
      operator,
    );
    await bumpScan(tx, 'scanned');

    return {
      unit: toUnitDTO(updatedUnit),
      slot: toSlotDTO(updatedSlot),
      crossArea,
      message: crossArea
        ? `此機台狀態為「${updatedUnit.dutStatus}」，建議放在 ${want} ${areaDef(want).name}。`
        : `綁定完成 [${sn}] → ${slotCode}`,
    };
  });
}

/** 拒收退回：未建檔 S/N 選擇不臨時建檔時，僅留稽核紀錄，不動 slot/unit。 */
export async function rejectCheckIn(slotCodeRaw: string, snRaw: string, operator: Operator): Promise<{ message: string }> {
  await logMovement(prisma, { sn: normSlot(snRaw), toSlot: normSlot(slotCodeRaw), action: '入庫拒收', note: '未建檔 S/N' }, operator);
  return { message: '已記錄拒收' };
}

/** 擋下，不收：已離場機台未重新啟用，僅留稽核紀錄。 */
export async function blockLeftCheckIn(slotCodeRaw: string, snRaw: string, operator: Operator): Promise<{ message: string }> {
  await logMovement(
    prisma,
    { sn: normSlot(snRaw), toSlot: normSlot(slotCodeRaw), action: '入庫擋下', note: '已離場機台，未重新啟用' },
    operator,
  );
  return { message: '已記錄擋下' };
}
