/**
 * Demo data seed — ported from POC v0.4 build()/seedData():
 *   WIP 24 台車 + FIN 12 台車，每台 11 層 x 4 機位（1,584 個儲位），1,000 台機台。
 * Uses the POC's LCG (seed 20260905) so every run produces the same data set;
 * dates are relative to "now" instead of the POC's fixed 2026/09/04.
 *
 * DESTRUCTIVE: clears every table first.
 */
import { PrismaClient, type IssueStatus, type UnitState } from '@prisma/client';
import { AREA_DEFS, BLOCK_REASONS, CFG, MODELS, OWNERS, PHASES } from '../src/lib/areaDefs';
import { rackCodeOf, slotCodeOf, suggestArea } from '../src/lib/logic';

const prisma = new PrismaClient();

const DSTAT_W: Record<string, number> = {
  '待測 EQM1': 20,
  'EQM1 已驗待放行': 20,
  'EQM1 已刷出待 Re SWDL': 15,
  '待 JQE 判定': 15,
  '待 RD 分析': 10,
  '待維修': 12,
  '待報廢': 8,
};
const PROJECT_W: Record<string, number> = { Slate: 28, Blade14: 26, Kevel: 28, Sunfire: 18 };
const EMPS: [string, string][] = [
  ['A12345', '陳志明'],
  ['A23456', '林佩君'],
  ['B34567', '王建宏'],
  ['B45678', '張雅琪'],
  ['C56789', '李冠廷'],
];
const ISSUE_POOL: [string, string, string, string][] = [
  ['Dell Logo edges appear jagged when boot up the unit', 'Issue follow BIOS 0.2.24 and VNP after flash BIOS to 0.2.34', 'BIOS 0.2.34 Intel RC FW update can fix', 'BIOS'],
  ['The daylight saving time is incorrect in the CMOS page', 'System setting with Winter time caused the issue', 'Change system setting to Daylight saving time', 'BIOS'],
  ['Touchpad no response after S3 resume', 'Driver timing issue on PS/2 init', 'Update TP FW to 1.08', 'EE'],
  ['Fan noise abnormal at 45dB in idle mode', 'Fan curve too aggressive under DPTF', 'Tune DPTF table in BIOS 0.2.36', 'Thermal'],
  ['WLAN throughput drop 30% at 5GHz', 'Antenna cable routing too close to hinge', 'Re-route cable + add mylar', 'ME'],
  ['LCD flicker at 60Hz when switching power source', 'Panel timing controller setting', 'Update panel FW / EDID', 'EE'],
];
const UNIT_COUNT = 1000;
const OUT_COUNT = 40;

// ---- POC RNG helpers ----
let seed = 20260905;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
function wpick(m: Record<string, number>): string {
  const t = Object.values(m).reduce((a, b) => a + b, 0);
  let r = rnd() * t;
  for (const k of Object.keys(m)) {
    r -= m[k];
    if (r <= 0) return k;
  }
  return Object.keys(m)[0];
}
const pad = (n: number, l = 2) => String(n).padStart(l, '0');
const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);
const days = (d: Date) => Math.max(0, Math.floor((NOW - d.getTime()) / 86_400_000));
const mkSN = (i: number) => '8069949' + pad(9000000 + i * 7 + ri(0, 5), 7); // 14 碼

type SlotRow = {
  code: string;
  rackCode: string;
  areaCode: string;
  level: number;
  pos: number;
  status: 'EMPTY' | 'OCCUPIED' | 'BLOCKED';
  blockReason?: string;
  blockBy?: string;
  blockAt?: Date;
  labelBroken?: boolean;
  labelBrokenReason?: string;
  labelBrokenBy?: string;
  labelBrokenAt?: Date;
};
type UnitRow = {
  sn: string;
  project: string;
  model: string;
  phase: string;
  owner: string;
  dutStatus: string;
  state: UnitState;
  slotCode: string | null;
  inAt: Date;
  lastMoveAt: Date;
  lastMoveBy: string | null;
  loanBy: string | null;
  loanOutAt: Date | null;
  issues: { title: string; rootCause: string; correctiveAction: string; owner: string; status: IssueStatus }[];
};

function mkUnit(i: number): UnitRow {
  const project = wpick(PROJECT_W);
  const inAt = daysAgo(ri(0, 50));
  const u: UnitRow = {
    sn: mkSN(i),
    project,
    model: pick(MODELS[project]),
    phase: pick(PHASES),
    dutStatus: wpick(DSTAT_W),
    owner: pick(OWNERS),
    state: 'IN',
    slotCode: null,
    inAt,
    lastMoveAt: inAt,
    lastMoveBy: null,
    loanBy: null,
    loanOutAt: null,
    issues: [],
  };
  u.lastMoveAt = rnd() < 0.12 ? u.inAt : daysAgo(ri(0, Math.min(days(u.inAt), 24)));
  const ni = rnd() < 0.32 ? ri(1, 2) : 0;
  for (let j = 0; j < ni; j++) {
    const p = pick(ISSUE_POOL);
    u.issues.push({
      title: p[0],
      rootCause: p[1],
      correctiveAction: p[2],
      owner: p[3],
      status: rnd() < 0.45 ? 'Closed' : rnd() < 0.6 ? 'Tracking' : 'Open',
    });
  }
  return u;
}

async function main() {
  console.log('Clearing existing data...');
  await prisma.movement.deleteMany();
  await prisma.unitIssue.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.rack.deleteMany();
  await prisma.area.deleteMany();
  await prisma.scanMetric.deleteMany();

  // ---- build(): areas / racks / slots ----
  console.log('Creating areas / racks / slots...');
  const slots: SlotRow[] = [];
  for (const [i, a] of AREA_DEFS.entries()) {
    await prisma.area.create({
      data: { code: a.code, zh: a.zh, name: a.name, description: a.description, dutStatuses: a.statuses, sortOrder: i },
    });
    const racks = [];
    for (let no = 1; no <= a.rackCount; no++) {
      const rackCode = rackCodeOf(a.code, no);
      racks.push({ code: rackCode, areaCode: a.code, no, isActive: true });
      for (let L = 1; L <= CFG.levels; L++) {
        for (let P = 1; P <= CFG.positions; P++) {
          slots.push({ code: slotCodeOf(rackCode, L, P), rackCode, areaCode: a.code, level: L, pos: P, status: 'EMPTY' });
        }
      }
    }
    await prisma.rack.createMany({ data: racks });
  }

  // ---- seedData(): blocked slots, broken labels ----
  slots.forEach((s) => {
    if (rnd() < 0.03) {
      s.status = 'BLOCKED';
      s.blockReason = pick(BLOCK_REASONS);
      s.blockBy = pick(EMPS).join(' ');
      s.blockAt = daysAgo(ri(1, 40));
    }
  });
  slots.forEach((s) => {
    if (s.status !== 'BLOCKED' && rnd() < 0.008) {
      s.labelBroken = true;
      s.labelBrokenReason = '標籤磨損掃不到';
      s.labelBrokenBy = pick(EMPS).join(' ');
      s.labelBrokenAt = daysAgo(ri(1, 15));
    }
  });

  // free-slot pools per area, shuffled
  const free: Record<string, string[]> = { WIP: [], FIN: [] };
  slots.forEach((s) => s.status !== 'BLOCKED' && free[s.areaCode].push(s.code));
  Object.values(free).forEach((A) => {
    for (let i = A.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [A[i], A[j]] = [A[j], A[i]];
    }
  });
  const ptr: Record<string, number> = { WIP: 0, FIN: 0 };
  const slotByCode = new Map(slots.map((s) => [s.code, s]));

  // ---- units ----
  console.log(`Creating ${UNIT_COUNT} units...`);
  const units: UnitRow[] = [];
  const moves: { sn: string; fromSlot: string | null; toSlot: string | null; action: string; empNo: string; empName: string; note: string; ts: Date }[] = [];
  for (let i = 0; i < UNIT_COUNT; i++) {
    const u = mkUnit(i);
    units.push(u);
    if (i < OUT_COUNT) {
      const e = pick(EMPS);
      u.state = 'OUT';
      u.loanBy = e.join(' ');
      u.loanOutAt = daysAgo(ri(1, 12));
      u.lastMoveAt = u.loanOutAt;
      u.lastMoveBy = u.loanBy;
      moves.push({ sn: u.sn, fromSlot: null, toSlot: null, action: '取機出庫', empNo: e[0], empName: e[1], note: '刷櫃位條碼釋放', ts: u.loanOutAt });
      continue;
    }
    let z: string = suggestArea(u.dutStatus);
    let k = free[z][ptr[z]++];
    if (!k) {
      z = z === 'FIN' ? 'WIP' : 'FIN';
      k = free[z][ptr[z]++];
    }
    if (!k) {
      u.state = 'LEFT';
      continue;
    }
    u.slotCode = k;
    slotByCode.get(k)!.status = 'OCCUPIED';
    const e = pick(EMPS);
    u.lastMoveBy = e.join(' ');
    moves.push({ sn: u.sn, fromSlot: null, toSlot: k, action: '入庫上架', empNo: e[0], empName: e[1], note: '人員自選櫃位', ts: u.inAt });
  }

  await prisma.slot.createMany({ data: slots.map(({ areaCode: _a, ...s }) => s) });
  await prisma.unit.createMany({ data: units.map(({ issues: _i, ...u }) => u) });
  await prisma.unitIssue.createMany({ data: units.flatMap((u) => u.issues.map((i) => ({ ...i, unitSn: u.sn }))) });

  moves.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  await prisma.movement.createMany({ data: moves.map((m) => ({ ...m, station: 'OBE-STN01' })) });

  // POC SCAN = {covered:1268, missed:41}
  await prisma.scanMetric.create({ data: { date: daysAgo(1), station: 'OBE-STN01', scannedCnt: 1268, missedCnt: 41 } });

  const inCnt = units.filter((u) => u.state === 'IN').length;
  console.log(
    `Done: ${AREA_DEFS.reduce((n, a) => n + a.rackCount, 0)} racks, ${slots.length} slots ` +
      `(${slots.filter((s) => s.status === 'BLOCKED').length} blocked), ${units.length} units (${inCnt} in storage), ${moves.length} movements.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
