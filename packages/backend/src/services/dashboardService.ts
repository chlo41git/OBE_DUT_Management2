import type { AreaCode, DashboardDTO } from '@obe/shared';
import { prisma } from '../db/prisma';
import { CFG } from '../lib/areaDefs';
import { toMovementDTO } from '../lib/mappers';

/** 戰情儀表板：KPI、區域佔用率、今日作業量、最近作業。Ported from POC v0.4 renderDash(). */
export async function getDashboard(): Promise<DashboardDTO> {
  const staleCutoff = new Date(Date.now() - CFG.staleDays * 86_400_000);
  const today = startOfToday();
  const [totalUnits, inStorage, outUnits, staleCount, areas, slotAgg, scanAgg, todayIn, todayOut, recent] = await Promise.all([
    prisma.unit.count(),
    prisma.unit.count({ where: { state: 'IN' } }),
    prisma.unit.count({ where: { state: 'OUT' } }),
    prisma.unit.count({ where: { state: 'IN', lastMoveAt: { lt: staleCutoff } } }),
    prisma.area.findMany({ orderBy: { sortOrder: 'asc' }, include: { racks: { select: { code: true } } } }),
    prisma.slot.groupBy({ by: ['rackCode', 'status'], _count: { _all: true } }),
    prisma.scanMetric.aggregate({ _sum: { scannedCnt: true, missedCnt: true } }),
    prisma.movement.count({ where: { action: '入庫上架', ts: { gte: today } } }),
    prisma.movement.count({ where: { action: '取機出庫', ts: { gte: today } } }),
    prisma.movement.findMany({ orderBy: [{ ts: 'desc' }, { id: 'desc' }], take: 12 }),
  ]);

  const areaOfRack = new Map<string, AreaCode>();
  areas.forEach((a) => a.racks.forEach((r) => areaOfRack.set(r.code, a.code as AreaCode)));
  const per: Record<string, { total: number; used: number; blocked: number }> = {};
  let total = 0;
  let used = 0;
  let blocked = 0;
  slotAgg.forEach((g) => {
    const a = areaOfRack.get(g.rackCode);
    if (!a) return;
    const n = g._count._all;
    per[a] = per[a] ?? { total: 0, used: 0, blocked: 0 };
    per[a].total += n;
    total += n;
    if (g.status === 'OCCUPIED') {
      per[a].used += n;
      used += n;
    }
    if (g.status === 'BLOCKED') {
      per[a].blocked += n;
      blocked += n;
    }
  });
  const usable = total - blocked;
  const pct = (u: number, d: number) => (d ? Math.round((u / d) * 100) : 0);

  const scanned = scanAgg._sum.scannedCnt ?? 0;
  const missed = scanAgg._sum.missedCnt ?? 0;
  const expected = scanned + missed;

  return {
    kpi: {
      inStorage,
      totalUnits,
      outUnits,
      utilizationPct: pct(used, usable),
      usedSlots: used,
      usableSlots: usable,
      blockedSlots: blocked,
      scanCoveragePct: expected ? Math.round((scanned / expected) * 1000) / 10 : 100,
      scanExpected: expected,
      scanMissed: missed,
      staleCount,
      staleDays: CFG.staleDays,
      stalePct: pct(staleCount, inStorage),
    },
    areaUtilization: areas.map((a) => {
      const s = per[a.code] ?? { total: 0, used: 0, blocked: 0 };
      return {
        areaCode: a.code as AreaCode,
        areaName: a.name,
        description: a.description,
        rackCount: a.racks.length,
        used: s.used,
        usable: s.total - s.blocked,
        pct: pct(s.used, s.total - s.blocked),
      };
    }),
    todayCheckIns: todayIn,
    todayCheckOuts: todayOut,
    recentEvents: recent.map(toMovementDTO),
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
