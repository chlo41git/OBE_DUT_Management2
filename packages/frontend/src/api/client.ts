import type {
  AreaCode,
  AreaDTO,
  BlockSlotRequest,
  CheckInCommitRequest,
  CheckInCommitResult,
  CheckInSlotResult,
  CheckInUnitResult,
  CheckOutUnitResult,
  DashboardDTO,
  ManualSlotRequest,
  MapFindHit,
  MapSlotCell,
  MovementDTO,
  RackDTO,
  SlotDTO,
  SystemConfigDTO,
  UnitDTO,
} from '@obe/shared';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getOperator() {
  try {
    const raw = localStorage.getItem('obe.operator');
    if (raw) return JSON.parse(raw) as { empNo: string; empName: string };
  } catch {
    /* ignore */
  }
  return { empNo: 'A12345', empName: '陳志明' };
}

export function setOperator(op: { empNo: string; empName: string }) {
  localStorage.setItem('obe.operator', JSON.stringify(op));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const op = getOperator();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-emp-no': op.empNo,
      // 中文姓名放進 HTTP header 會壞掉，兩端都做 percent-encode／decode
      'x-emp-name': encodeURIComponent(op.empName),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.code || 'ERROR', body.message || `HTTP ${res.status}`, body.details);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) });
const patch = <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) });
const get = <T>(path: string) => request<T>(path);

export const api = {
  health: () => get<{ ok: boolean }>('/health'),
  config: () => get<SystemConfigDTO & { blockReasons: string[] }>('/config'),

  areas: () => get<AreaDTO[]>('/areas'),
  freeCountByArea: () => get<Record<string, number>>('/areas/free-count'),
  racks: () => get<RackDTO[]>('/racks'),
  createRack: (areaCode: AreaCode) => post<RackDTO>('/racks', { areaCode }),
  toggleRack: (code: string) => patch<RackDTO>(`/racks/${code}/toggle`),

  blockSlot: (code: string, req: BlockSlotRequest) => patch<SlotDTO>(`/slots/${code}/block`, req),
  unblockSlot: (code: string) => patch<SlotDTO>(`/slots/${code}/unblock`),

  mapSlots: () => get<MapSlotCell[]>('/map/slots'),
  mapFind: (kw: string) => get<MapFindHit[]>(`/map/find?kw=${encodeURIComponent(kw)}`),
  unit: (sn: string) => get<UnitDTO>(`/units/${encodeURIComponent(sn)}`),

  checkinScanSlot: (code: string) => post<CheckInSlotResult>('/checkin/scan-slot', { code }),
  checkinScanUnit: (slotCode: string, sn: string) => post<CheckInUnitResult>('/checkin/scan-unit', { slotCode, sn }),
  checkinCommit: (req: CheckInCommitRequest) => post<CheckInCommitResult>('/checkin/commit', req),
  checkinReject: (slotCode: string, sn: string) => post<{ message: string }>('/checkin/reject', { slotCode, sn }),
  checkinBlockLeft: (slotCode: string, sn: string) => post<{ message: string }>('/checkin/block-left', { slotCode, sn }),

  checkoutScanUnit: (sn: string) => post<CheckOutUnitResult>('/checkout/scan-unit', { sn }),
  checkoutManualSn: (sn: string, reason: string) => post<{ sn: string }>('/checkout/manual-sn', { sn, reason }),

  manualSlot: (req: ManualSlotRequest) => post<SlotDTO>('/manual-slot', req),

  events: (params: { type?: string; kw?: string; sn?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', params.type);
    if (params.kw) qs.set('kw', params.kw);
    if (params.sn) qs.set('sn', params.sn);
    if (params.limit) qs.set('limit', String(params.limit));
    return get<{ total: number; rows: MovementDTO[] }>(`/events?${qs.toString()}`);
  },
  eventTypes: () => get<string[]>('/events/types'),

  dashboard: () => get<DashboardDTO>('/dashboard'),
};
