import type { MapFindHit, MapSlotCell, UnitDTO } from '@obe/shared';
import { prisma } from '../db/prisma';
import { notFound } from '../lib/httpError';
import { normSn, slotLoc } from '../lib/logic';
import { toSlotDTO, toUnitDTO } from '../lib/mappers';

export async function listSlotsForMap(rackCode?: string): Promise<MapSlotCell[]> {
  const slots = await prisma.slot.findMany({
    where: rackCode ? { rackCode } : undefined,
    include: { rack: true, unit: { select: { sn: true, project: true, dutStatus: true } } },
    orderBy: [{ rackCode: 'asc' }, { level: 'asc' }, { pos: 'asc' }],
  });
  return slots.map((s) => ({
    ...toSlotDTO(s),
    project: s.unit?.project ?? null,
    dutStatus: s.unit?.dutStatus ?? null,
  }));
}

/** 查詢定位：S/N 或後四碼，依儲位碼排序（POC doFind） */
export async function findUnitLocation(keyword: string): Promise<MapFindHit[]> {
  const kw = normSn(keyword);
  if (!kw) return [];
  const units = await prisma.unit.findMany({
    where: { sn: { contains: kw, mode: 'insensitive' } },
    select: { sn: true, slotCode: true, state: true },
    take: 200,
  });
  return units
    .map((u) => ({ sn: u.sn, state: u.state, slot: u.state === 'IN' && u.slotCode ? slotLoc(u.slotCode) : null }))
    .sort((a, b) => (a.slot?.code ?? 'zz').localeCompare(b.slot?.code ?? 'zz'));
}

export async function getUnitOrThrow(sn: string): Promise<UnitDTO> {
  const unit = await prisma.unit.findUnique({ where: { sn: normSn(sn) }, include: { issues: true } });
  if (!unit) throw notFound('UNIT_NOT_FOUND', `查無此機台：${sn}`);
  return toUnitDTO(unit);
}
