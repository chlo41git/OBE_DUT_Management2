import type { AreaCode, SlotLocDTO } from '@obe/shared';
import { areaDef, CFG, FIN_STATUSES } from './areaDefs';

export const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** v0.4：條碼內容 = 區域-台車-層-機位，例 FIN-04-01-04 */
export const SLOT_CODE_RE = /^(WIP|FIN)-\d{2}-\d{2}-\d{2}$/;
export const RACK_CODE_RE = /^(WIP|FIN)-\d{2}$/;
export const SLOT_FORMAT_HINT = 'FIN-04-01-04（區域-台車-層-機位）';

/**
 * Normalize a scanned/typed slot code into canonical FIN-04-01-04 form.
 * Ported from POC v0.4 normSlot(): accepts "fin 4 1 4", "FIN_04_01_04", "FIN4-1-4", "FIN/04/01/04".
 * Anything that doesn't look like a slot code is returned upper-cased and trimmed (e.g. an S/N).
 */
export function normSlot(raw: string): string {
  const c = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = c.match(/^(WIP|FIN)[-_/]?(\d{1,2})[-_/]?(\d{1,2})[-_/]?(\d{1,2})$/);
  return m ? `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}-${pad(Number(m[4]))}` : c;
}

/** Scanned S/N：只做 trim + 大寫，不做櫃位碼正規化 */
export const normSn = (raw: string) => (raw || '').trim().toUpperCase();

export function isSlotCode(code: string): boolean {
  return SLOT_CODE_RE.test(code);
}

export const rackCodeOf = (area: string, no: number) => `${area}-${pad(no)}`;
export const slotCodeOf = (rackCode: string, level: number, pos: number) => `${rackCode}-${pad(level)}-${pad(pos)}`;
export const localNo = (no: number) => `${pad(no)} 臺車`;

/** Parse FIN-04-01-04 → parts. Returns null for anything else. */
export function parseSlotCode(code: string): { areaCode: AreaCode; rackNo: number; level: number; pos: number } | null {
  if (!isSlotCode(code)) return null;
  const [a, r, l, p] = code.split('-');
  return { areaCode: a as AreaCode, rackNo: Number(r), level: Number(l), pos: Number(p) };
}

/** 標籤中文面：已驗，04臺車，01層，04機位（POC locLabelZh） */
export function labelZh(code: string): string {
  const p = parseSlotCode(code);
  if (!p) return code;
  return `${areaDef(p.areaCode).zh}，${pad(p.rackNo)}臺車，${pad(p.level)}層，${pad(p.pos)}機位`;
}

export function slotLoc(code: string): SlotLocDTO | null {
  const p = parseSlotCode(code);
  if (!p) return null;
  const a = areaDef(p.areaCode);
  return {
    code,
    rackCode: rackCodeOf(p.areaCode, p.rackNo),
    rackNo: p.rackNo,
    areaCode: p.areaCode,
    areaZh: a.zh,
    areaName: a.name,
    level: p.level,
    pos: p.pos,
    labelZh: labelZh(code),
  };
}

/** 建議區域：已驗狀態放 FIN，其餘放 WIP（POC areaForUnit） */
export function suggestArea(dutStatus: string): AreaCode {
  return FIN_STATUSES.includes(dutStatus) ? 'FIN' : 'WIP';
}

export function daysSince(date: Date | null | undefined, now = Date.now()): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((now - date.getTime()) / 86_400_000));
}

export const isStaleDate = (lastMoveAt: Date | null | undefined) => daysSince(lastMoveAt) > CFG.staleDays;

export const operatorLabel = (op: { empNo: string; empName: string }) => `${op.empNo} ${op.empName}`;

export function formatDateTime(d: Date): string {
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
