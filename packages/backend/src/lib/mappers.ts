import type {
  Area as PArea,
  Movement as PMov,
  Rack as PRack,
  Slot as PSlot,
  Unit as PUnit,
  UnitIssue as PIssue,
} from '@prisma/client';
import type { AreaCode, AreaDTO, MovementDTO, RackDTO, SlotDTO, UnitDTO, UnitIssueDTO } from '@obe/shared';
import { areaDef } from './areaDefs';
import { isStaleDate, localNo, slotLoc, suggestArea } from './logic';

export function toAreaDTO(a: PArea & { racks?: { code: string }[] }): AreaDTO {
  return {
    code: a.code as AreaCode,
    zh: a.zh,
    name: a.name,
    description: a.description,
    dutStatuses: a.dutStatuses,
    rackCount: a.racks?.length ?? 0,
  };
}

export function toRackDTO(r: PRack): RackDTO {
  return {
    code: r.code,
    areaCode: r.areaCode as AreaCode,
    no: r.no,
    localNo: localNo(r.no),
    isActive: r.isActive,
    note: r.note,
  };
}

export function toSlotDTO(s: PSlot & { rack: PRack; unit?: { sn: string } | null }): SlotDTO {
  return {
    ...slotLoc(s.code)!,
    status: s.status,
    sn: s.unit?.sn ?? null,
    blockReason: s.blockReason,
    labelBroken: s.labelBroken,
    labelBrokenReason: s.labelBrokenReason,
    rackActive: s.rack.isActive,
  };
}

export function toIssueDTO(i: PIssue): UnitIssueDTO {
  return {
    id: i.id,
    title: i.title,
    rootCause: i.rootCause,
    correctiveAction: i.correctiveAction,
    owner: i.owner,
    status: i.status,
  };
}

export function toUnitDTO(u: PUnit & { issues?: PIssue[] }): UnitDTO {
  const want = suggestArea(u.dutStatus);
  const loc = u.slotCode ? slotLoc(u.slotCode) : null;
  const inRack = u.state === 'IN' && !!loc;
  return {
    sn: u.sn,
    project: u.project,
    model: u.model,
    phase: u.phase,
    owner: u.owner,
    dutStatus: u.dutStatus,
    state: u.state,
    slotCode: u.slotCode,
    slot: loc,
    isTemp: u.isTemp,
    inAt: u.inAt?.toISOString() ?? null,
    lastMoveAt: u.lastMoveAt?.toISOString() ?? null,
    lastMoveBy: u.lastMoveBy,
    loanBy: u.loanBy,
    loanOutAt: u.loanOutAt?.toISOString() ?? null,
    issues: (u.issues ?? []).map(toIssueDTO),
    suggestedArea: want,
    suggestedAreaName: areaDef(want).name,
    areaMismatch: inRack && loc!.areaCode !== want,
    isStale: u.state === 'IN' && isStaleDate(u.lastMoveAt),
  };
}

export function toMovementDTO(m: PMov): MovementDTO {
  return {
    id: m.id,
    ts: m.ts.toISOString(),
    type: m.action,
    sn: m.sn,
    slotCode: m.toSlot ?? m.fromSlot,
    empNo: m.empNo,
    empName: m.empName,
    note: m.note,
  };
}
