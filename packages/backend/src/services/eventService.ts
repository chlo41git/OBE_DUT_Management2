import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { toMovementDTO } from '../lib/mappers';
import { STATION } from '../lib/areaDefs';
import type { Operator } from '../lib/operator';
import type { MovementDTO } from '@obe/shared';

type Tx = Prisma.TransactionClient | typeof prisma;

export interface LogFilter {
  type?: string;
  keyword?: string;
  sn?: string;
  limit?: number;
}

/** POC renderLog()：依事件類型＋S/N 或儲位關鍵字查詢，顯示前 300 筆 */
export async function listMovements(filter: LogFilter): Promise<{ total: number; rows: MovementDTO[] }> {
  const kw = filter.keyword?.trim().toUpperCase();
  const where: Prisma.MovementWhereInput = {
    action: filter.type || undefined,
    sn: filter.sn || undefined,
    OR: kw
      ? [
          { sn: { contains: kw, mode: 'insensitive' } },
          { toSlot: { contains: kw, mode: 'insensitive' } },
          { fromSlot: { contains: kw, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [total, rows] = await Promise.all([
    prisma.movement.count({ where }),
    prisma.movement.findMany({ where, orderBy: [{ ts: 'desc' }, { id: 'desc' }], take: filter.limit ?? 300 }),
  ]);
  return { total, rows: rows.map(toMovementDTO) };
}

export async function listEventTypes(): Promise<string[]> {
  const rows = await prisma.movement.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
  return rows.map((r) => r.action);
}

/** Single write path for the audit trail. */
export function logMovement(
  tx: Tx,
  params: { sn?: string | null; fromSlot?: string | null; toSlot?: string | null; action: string; note?: string },
  operator: Operator,
) {
  return tx.movement.create({
    data: {
      sn: params.sn || '-',
      fromSlot: params.fromSlot ?? null,
      toSlot: params.toSlot ?? null,
      action: params.action,
      note: params.note ?? '',
      empNo: operator.empNo,
      empName: operator.empName,
      station: STATION,
    },
  });
}

/** 刷取覆蓋率計數：每站每日一列（POC SCAN.covered++） */
export async function bumpScan(tx: Tx, kind: 'scanned' | 'missed') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await tx.scanMetric.findFirst({ where: { date: today, station: STATION } });
  if (existing) {
    await tx.scanMetric.update({
      where: { id: existing.id },
      data: kind === 'scanned' ? { scannedCnt: { increment: 1 } } : { missedCnt: { increment: 1 } },
    });
  } else {
    await tx.scanMetric.create({
      data: { date: today, station: STATION, scannedCnt: kind === 'scanned' ? 1 : 0, missedCnt: kind === 'missed' ? 1 : 0 },
    });
  }
}
