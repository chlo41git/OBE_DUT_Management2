import { prisma } from '../db/prisma';
import { normSlot, operatorLabel } from '../lib/logic';
import { notFound, badRequest } from '../lib/httpError';
import { toSlotDTO } from '../lib/mappers';
import { logMovement } from './eventService';
import type { Operator } from '../lib/operator';

/**
 * 標籤破損，手動輸入儲位 — 標記「標籤待補印」並留稽核紀錄，之後前端照常走入庫流程。
 * （v04-1 起出庫改刷機台 S/N，出庫端改用 checkoutService.registerManualSn。）
 * Ported from POC v0.4 manualSlot().
 */
export async function registerManualSlot(codeRaw: string, reasonRaw: string, operator: Operator) {
  const code = normSlot(codeRaw);
  const reason = reasonRaw.trim();
  const slot = await prisma.slot.findUnique({ where: { code } });
  if (!slot) throw notFound('SLOT_NOT_FOUND', '查無此櫃位條碼');
  if (!reason) throw badRequest('REASON_REQUIRED', '請填理由');

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.slot.update({
      where: { code },
      data: { labelBroken: true, labelBrokenReason: reason, labelBrokenBy: operatorLabel(operator), labelBrokenAt: new Date() },
      include: { rack: true, unit: true },
    });
    await logMovement(
      tx,
      { toSlot: code, action: '手動輸入儲位', note: `理由：${reason}（標籤待補印）` },
      operator,
    );
    return s;
  });
  return toSlotDTO(updated);
}
