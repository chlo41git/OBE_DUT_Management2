import type { AreaCode } from '@obe/shared';

/** Static area definition — mirrors POC v0.4 AREAS constant. Seeded into storage_area. */
export interface AreaDef {
  code: AreaCode;
  zh: string;
  name: string;
  description: string;
  statuses: string[];
  rackCount: number; // 初始台車數（seed 用）
}

/** 已驗區收的 DUT 狀態（POC FIN_STAT）；其餘一律建議 WIP */
export const FIN_STATUSES = ['EQM1 已驗待放行', 'EQM1 已刷出待 Re SWDL'];

export const AREA_DEFS: AreaDef[] = [
  {
    code: 'WIP',
    zh: '未驗',
    name: '在製區（未驗）',
    description: '待測 EQM1、待 JQE 判定、待 RD 分析、待維修、待報廢',
    statuses: ['待測 EQM1', '待 JQE 判定', '待 RD 分析', '待維修', '待報廢'],
    rackCount: 24,
  },
  {
    code: 'FIN',
    zh: '已驗',
    name: '已驗區',
    description: 'EQM1 已驗待放行、EQM1 已刷出待 Re SWDL_IN',
    statuses: FIN_STATUSES,
    rackCount: 12,
  },
];

export const areaDef = (code: string): AreaDef => AREA_DEFS.find((a) => a.code === code) ?? AREA_DEFS[0];

/** POC CFG */
export const CFG = {
  levels: 11,
  positions: 4,
  staleDays: 30,
  dedupSeconds: 2,
} as const;

export const STATION = 'OBE-STN01';

export const BLOCK_REASONS = ['泡棉治具盤佔位（空盤）', '該層結構變形停用', '暫借放治具備品'];

export const PROJECTS = ['Slate', 'Blade14', 'Kevel', 'Sunfire'];
export const MODELS: Record<string, string[]> = {
  Slate: ['SLT-14X', 'SLT-16P'],
  Blade14: ['BLD-14A', 'BLD-14B'],
  Kevel: ['KVL-13S', 'KVL-15G'],
  Sunfire: ['SNF-14U'],
};
export const PHASES = ['EVT', 'DVT', 'PVT', 'MP'];
export const OWNERS = ['BIOS', 'EE', 'ME', 'Thermal', 'SW', 'JQE', 'PQE'];
