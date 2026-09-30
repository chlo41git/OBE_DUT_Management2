/**
 * Shared API contract types between @obe/backend and @obe/frontend.
 * Ported from the business rules in OBE_DUT_儲位管理系統_POC_v04.html.
 *
 * v0.4：儲位碼＝現場已印出的一維條碼「區域-台車-層-機位」，例 FIN-04-01-04。
 * The frontend imports only *types* from here; display strings (labelZh 等)
 * are computed by the backend and shipped inside the DTOs.
 */

export type AreaCode = 'WIP' | 'FIN';
export type SlotStatus = 'EMPTY' | 'OCCUPIED' | 'BLOCKED';
export type UnitState = 'NEW' | 'IN' | 'OUT' | 'LEFT';
export type IssueStatus = 'Open' | 'Tracking' | 'Closed';

/** Canonical DUT status order — mirrors POC DSTAT. */
export const DUT_STATUSES = [
  '待測 EQM1',
  'EQM1 已驗待放行',
  'EQM1 已刷出待 Re SWDL',
  '待 JQE 判定',
  '待 RD 分析',
  '待維修',
  '待報廢',
] as const;
export type DutStatus = (typeof DUT_STATUSES)[number];

export interface AreaDTO {
  code: AreaCode;
  zh: string; // 未驗／已驗
  name: string; // 在製區（未驗）／已驗區
  description: string;
  dutStatuses: string[];
  rackCount: number;
}

export interface RackDTO {
  code: string; // WIP-01
  areaCode: AreaCode;
  no: number;
  localNo: string; // 「01 臺車」
  isActive: boolean;
  note: string | null;
}

/** 儲位的位置資訊（全部由條碼碼值推得，另附中文面） */
export interface SlotLocDTO {
  code: string; // FIN-04-01-04
  rackCode: string; // FIN-04
  rackNo: number;
  areaCode: AreaCode;
  areaZh: string;
  areaName: string;
  level: number;
  pos: number;
  /** 標籤中文面：「已驗，04臺車，01層，04機位」 */
  labelZh: string;
}

export interface SlotDTO extends SlotLocDTO {
  status: SlotStatus;
  sn: string | null;
  blockReason: string | null;
  labelBroken: boolean;
  labelBrokenReason: string | null;
  rackActive: boolean;
}

export interface UnitIssueDTO {
  id: number;
  title: string;
  rootCause: string;
  correctiveAction: string;
  owner: string;
  status: IssueStatus;
}

export interface UnitDTO {
  sn: string;
  project: string;
  model: string;
  phase: string;
  owner: string;
  dutStatus: string;
  state: UnitState;
  slotCode: string | null;
  slot: SlotLocDTO | null;
  isTemp: boolean;
  inAt: string | null;
  lastMoveAt: string | null;
  lastMoveBy: string | null;
  loanBy: string | null;
  loanOutAt: string | null;
  issues: UnitIssueDTO[];
  suggestedArea: AreaCode;
  suggestedAreaName: string;
  /** 在庫但所在區域與建議區域不同 */
  areaMismatch: boolean;
  /** 在庫且超過 staleDays 未異動 */
  isStale: boolean;
}

export interface MovementDTO {
  id: number;
  ts: string;
  type: string;
  sn: string;
  slotCode: string | null;
  empNo: string;
  empName: string;
  note: string;
}

export interface DashboardKpiDTO {
  inStorage: number;
  totalUnits: number;
  outUnits: number;
  utilizationPct: number;
  usedSlots: number;
  usableSlots: number;
  blockedSlots: number;
  scanCoveragePct: number;
  scanExpected: number;
  scanMissed: number;
  staleCount: number;
  staleDays: number;
  stalePct: number;
}

export interface AreaUtilizationDTO {
  areaCode: AreaCode;
  areaName: string;
  description: string;
  rackCount: number;
  used: number;
  usable: number;
  pct: number;
}

export interface DashboardDTO {
  kpi: DashboardKpiDTO;
  areaUtilization: AreaUtilizationDTO[];
  todayCheckIns: number;
  todayCheckOuts: number;
  recentEvents: MovementDTO[];
}

/** 系統常數（POC CFG） */
export interface SystemConfigDTO {
  levels: number;
  positions: number;
  staleDays: number;
  dedupSeconds: number;
  slotFormatHint: string; // 「FIN-04-01-04（區域-台車-層-機位）」
}

// -------- request payloads --------

export type CheckInDecision = 'TEMP_CREATE' | 'REACTIVATE' | 'CONFIRM_MOVE';

export interface CheckInCommitRequest {
  slotCode: string;
  sn: string;
  /** decision needed when sn is unknown, already LEFT, or on another slot */
  decision?: CheckInDecision;
  reason?: string; // required for REACTIVATE
}

export interface ManualSlotRequest {
  mode: 'in' | 'out';
  code: string;
  reason: string;
}

export interface CreateRackRequest {
  areaCode: AreaCode;
}

export interface BlockSlotRequest {
  reason: string;
}

// -------- check-in flow results (mirrors POC's step-by-step modals) --------

export type CheckInSlotOutcome =
  | 'OK'
  | 'OCCUPIED'
  | 'BLOCKED'
  | 'INACTIVE'
  | 'NOT_FOUND'
  | 'WRONG_ORDER' // 刷到的是 S/N：本版是「先櫃位、後機台」
  | 'INVALID_FORMAT';

export interface CheckInSlotResult {
  outcome: CheckInSlotOutcome;
  message: string;
  slot?: SlotDTO;
}

export type CheckInUnitOutcome =
  | 'OK' // ready to commit, no decision needed
  | 'RETURN' // OUT → 歸還入庫, ready to commit
  | 'UNKNOWN_SN' // needs decision: reject | TEMP_CREATE
  | 'LEFT_UNIT' // needs decision: block | REACTIVATE (+reason)
  | 'NEED_MOVE_CONFIRM' // needs decision: CONFIRM_MOVE
  | 'ALREADY_HERE' // no-op, informational
  | 'SLOT_RESCAN'; // the "sn" scanned was actually a slot code

export interface CheckInUnitResult {
  outcome: CheckInUnitOutcome;
  message: string;
  unit?: UnitDTO;
  currentSlot?: SlotLocDTO | null;
}

export interface CheckInCommitResult {
  unit: UnitDTO;
  slot: SlotDTO;
  crossArea: boolean;
  message: string;
}

export type CheckOutSlotOutcome = 'OK' | 'EMPTY' | 'BLOCKED' | 'NOT_FOUND' | 'WRONG_ORDER' | 'INVALID_FORMAT';

export interface CheckOutSlotResult {
  outcome: CheckOutSlotOutcome;
  message: string;
  slot?: SlotDTO;
  unit?: UnitDTO;
}

export interface CheckOutConfirmResult {
  unit: UnitDTO;
  slot: SlotDTO;
  releasedAt: string;
  message: string;
}

// -------- map page --------

export interface MapSlotCell extends SlotDTO {
  project: string | null;
  dutStatus: string | null;
}

export interface MapFindHit {
  sn: string;
  state: UnitState;
  slot: SlotLocDTO | null;
}
