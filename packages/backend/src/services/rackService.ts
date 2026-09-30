import type { AreaDTO, RackDTO, SlotDTO } from '@obe/shared';
import { prisma } from '../db/prisma';
import { areaDef, CFG } from '../lib/areaDefs';
import { rackCodeOf, slotCodeOf, operatorLabel } from '../lib/logic';
import { toAreaDTO, toRackDTO, toSlotDTO } from '../lib/mappers';
import { badRequest, conflict, notFound } from '../lib/httpError';
import { logMovement } from './eventService';
import type { Operator } from '../lib/operator';

export async function listAreas(): Promise<AreaDTO[]> {
  const areas = await prisma.area.findMany({ orderBy: { sortOrder: 'asc' }, include: { racks: { select: { code: true } } } });
  return areas.map(toAreaDTO);
}

export async function listRacks(): Promise<RackDTO[]> {
  const racks = await prisma.rack.findMany({ orderBy: [{ area: { sortOrder: 'asc' } }, { no: 'asc' }] });
  return racks.map(toRackDTO);
}

/** 各區可用空位數（不含停用儲位、不含停用台車）— 入庫待機畫面提示。POC freeByArea() */
export async function freeCountByArea(): Promise<Record<string, number>> {
  const rows = await prisma.slot.groupBy({
    by: ['rackCode'],
    where: { status: 'EMPTY', rack: { isActive: true } },
    _count: { _all: true },
  });
  const racks = await prisma.rack.findMany({ select: { code: true, areaCode: true } });
  const areaOf = new Map(racks.map((r) => [r.code, r.areaCode]));
  const out: Record<string, number> = {};
  (await prisma.area.findMany({ orderBy: { sortOrder: 'asc' } })).forEach((a) => (out[a.code] = 0));
  rows.forEach((r) => {
    const a = areaOf.get(r.rackCode);
    if (a) out[a] = (out[a] ?? 0) + r._count._all;
  });
  return out;
}

/** 新增台車：台車號自動接續該區最後一號，並長出 levels x positions 個儲位。POC v0.4 newRack() */
export async function createRack(areaCode: string, operator: Operator): Promise<RackDTO> {
  const area = await prisma.area.findUnique({ where: { code: areaCode } });
  if (!area) throw badRequest('AREA_NOT_FOUND', `查無此區域：${areaCode}`);

  return prisma.$transaction(async (tx) => {
    const last = await tx.rack.aggregate({ where: { areaCode }, _max: { no: true } });
    const no = (last._max.no ?? 0) + 1;
    if (no > 99) throw badRequest('RACK_NO_OVERFLOW', `${areaCode} 台車號已達 99，條碼只有 2 碼`);
    const code = rackCodeOf(areaCode, no);
    if (await tx.rack.findUnique({ where: { code } })) throw conflict('RACK_EXISTS', `該區已有 ${code}`);

    const rack = await tx.rack.create({ data: { code, areaCode, no, isActive: true } });
    const slots: { code: string; rackCode: string; level: number; pos: number }[] = [];
    for (let L = 1; L <= CFG.levels; L++) {
      for (let P = 1; P <= CFG.positions; P++) slots.push({ code: slotCodeOf(code, L, P), rackCode: code, level: L, pos: P });
    }
    await tx.slot.createMany({ data: slots });
    await logMovement(
      tx,
      { sn: code, action: '新增台車', note: `${areaCode} ${areaDef(areaCode).name}，新增 ${slots.length} 個機位，待補印條碼` },
      operator,
    );
    return toRackDTO(rack);
  });
}

/** 停用／啟用台車；停用前必須先清空車上機台。POC toggleRack() */
export async function toggleRack(code: string, operator: Operator): Promise<RackDTO> {
  const rack = await prisma.rack.findUnique({ where: { code } });
  if (!rack) throw notFound('RACK_NOT_FOUND', `查無此台車：${code}`);
  if (rack.isActive) {
    const used = await prisma.slot.count({ where: { rackCode: code, status: 'OCCUPIED' } });
    if (used > 0) {
      throw conflict('RACK_NOT_EMPTY', `${code} 上還有 ${used} 台機台`, { used, hint: '請先把機台移到其他台車再停用。' });
    }
  }
  const updated = await prisma.rack.update({ where: { code }, data: { isActive: !rack.isActive } });
  await logMovement(
    prisma,
    { sn: code, action: updated.isActive ? '台車啟用' : '台車停用', note: updated.isActive ? '恢復可用' : '不再可放置' },
    operator,
  );
  return toRackDTO(updated);
}

/** 標記儲位停用（治具盤／破損）。POC slotClick() → block branch */
export async function blockSlot(code: string, reasonRaw: string, operator: Operator): Promise<SlotDTO> {
  const reason = reasonRaw.trim();
  const slot = await prisma.slot.findUnique({ where: { code }, include: { unit: true } });
  if (!slot) throw notFound('SLOT_NOT_FOUND', `查無此儲位：${code}`);
  if (slot.unit) throw conflict('SLOT_OCCUPIED', `${code} 上有機台，無法停用`);
  if (!reason) throw badRequest('REASON_REQUIRED', '請選擇停用原因');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.slot.update({
      where: { code },
      data: { status: 'BLOCKED', blockReason: reason, blockBy: operatorLabel(operator), blockAt: new Date() },
      include: { rack: true, unit: true },
    });
    await logMovement(tx, { toSlot: code, action: '儲位停用', note: reason }, operator);
    return toSlotDTO(updated);
  });
}

/** 解除儲位停用。POC slotClick() → unblock branch */
export async function unblockSlot(code: string, operator: Operator): Promise<SlotDTO> {
  const slot = await prisma.slot.findUnique({ where: { code } });
  if (!slot) throw notFound('SLOT_NOT_FOUND', `查無此儲位：${code}`);
  if (slot.status !== 'BLOCKED') throw badRequest('SLOT_NOT_BLOCKED', `${code} 並未停用`);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.slot.update({
      where: { code },
      data: { status: 'EMPTY', blockReason: null, blockBy: null, blockAt: null },
      include: { rack: true, unit: true },
    });
    await logMovement(tx, { toSlot: code, action: '儲位解除停用', note: '恢復可用' }, operator);
    return toSlotDTO(updated);
  });
}
