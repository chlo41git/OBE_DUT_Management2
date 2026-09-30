const DSTAT_TAG: Record<string, string> = {
  '待測 EQM1': 't-blue',
  'EQM1 已驗待放行': 't-green',
  'EQM1 已刷出待 Re SWDL': 't-cyan',
  '待 JQE 判定': 't-amber',
  '待 RD 分析': 't-violet',
  '待維修': 't-red',
  '待報廢': 't-gray',
};

export function DutStatusTag({ status }: { status: string }) {
  return <span className={`tag ${DSTAT_TAG[status] || 't-gray'}`}>{status}</span>;
}

export function UnitStateTag({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    IN: ['t-green', '在庫'],
    OUT: ['t-amber', '已取出'],
    LEFT: ['t-gray', '已離場'],
    NEW: ['t-blue', '待入庫'],
  };
  const [cls, label] = map[state] || ['t-gray', state];
  return <span className={`tag ${cls}`}>{label}</span>;
}

/** 區域碼標籤（WIP 藍／FIN 綠），POC v0.4 areaTag() */
export function AreaTag({ area }: { area: string }) {
  return <span className={`areaTag ${area.toLowerCase()}`}>{area}</span>;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
