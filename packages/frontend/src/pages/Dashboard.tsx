import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AreaTag } from '../components/Tag';
import { LogTable } from '../components/LogTable';

const utilBar = (p: number) => (p > 90 ? 'hi' : p > 80 ? 'md' : '');
const covBar = (p: number) => (p < 95 ? 'hi' : p < 98 ? 'md' : '');

/** 戰情儀表板。Ported from POC v0.4 renderDash(). */
export default function Dashboard() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 15000 });
  if (!data) return <div className="muted">載入中…</div>;
  const { kpi } = data;

  const kpis: { l: string; v: string | number; f: string; c: string; bar?: number; barCls?: string }[] = [
    { l: '在庫機台 In Storage', v: kpi.inStorage, f: `建檔 ${kpi.totalUnits} 台｜已取出 ${kpi.outUnits} 台`, c: '' },
    {
      l: '可用儲位使用率',
      v: `${kpi.utilizationPct}%`,
      f: `${kpi.usedSlots} / ${kpi.usableSlots} 位（停用 ${kpi.blockedSlots} 位不計）`,
      c: kpi.utilizationPct > 90 ? 'bad' : kpi.utilizationPct > 80 ? 'warn' : 'ok',
      bar: kpi.utilizationPct,
      barCls: utilBar(kpi.utilizationPct),
    },
    {
      l: '刷取覆蓋率 Scan Coverage',
      v: `${kpi.scanCoveragePct}%`,
      f: `應刷 ${kpi.scanExpected} 次，漏刷 ${kpi.scanMissed} 次`,
      c: kpi.scanCoveragePct < 95 ? 'bad' : kpi.scanCoveragePct < 98 ? 'warn' : 'ok',
      bar: kpi.scanCoveragePct,
      barCls: covBar(kpi.scanCoveragePct),
    },
    {
      l: `呆滯機台 >${kpi.staleDays} 天`,
      v: kpi.staleCount,
      f: `佔在庫 ${kpi.stalePct}%，需清架`,
      c: kpi.staleCount > 60 ? 'bad' : kpi.staleCount ? 'warn' : 'ok',
    },
  ];

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        {kpis.map((k) => (
          <div key={k.l} className={`kpi ${k.c}`}>
            <div className="lb">{k.l}</div>
            <div className="vl">{k.v}</div>
            {k.bar != null && (
              <div className="bar">
                <i className={k.barCls} style={{ width: `${Math.min(k.bar, 100)}%` }} />
              </div>
            )}
            <div className="ft">{k.f}</div>
          </div>
        ))}
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>
            區域佔用率 <span className="hint">WIP 未驗／FIN 已驗</span>
          </h3>
          <div className="bd">
            {data.areaUtilization.map((z) => (
              <div key={z.areaCode} style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <AreaTag area={z.areaCode} /> {z.areaName} <span className="muted small">({z.rackCount} 臺車)</span>
                  </span>
                  <span className="mono small">
                    {z.used}/{z.usable} · {z.pct}%
                  </span>
                </div>
                <div className="bar">
                  <i className={utilBar(z.pct)} style={{ width: `${z.pct}%` }} />
                </div>
                <div className="small muted" style={{ marginTop: 3 }}>
                  {z.description}
                </div>
              </div>
            ))}
            <div className="small muted">
              條碼區碼即現場印出的 <b className="mono">WIP</b>／<b className="mono">FIN</b>，兩區台車各自從 01 編起。
            </div>
          </div>
        </div>

        <div className="card">
          <h3>
            今日作業量與刷取品質 <span className="hint">Throughput / Scan Quality</span>
          </h3>
          <div className="bd">
            <div className="grid g2">
              <div className="kpi ok">
                <div className="lb">入庫</div>
                <div className="vl">{data.todayCheckIns}</div>
                <div className="ft">今日累計</div>
              </div>
              <div className="kpi">
                <div className="lb">出庫</div>
                <div className="vl">{data.todayCheckOuts}</div>
                <div className="ft">今日累計</div>
              </div>
            </div>
            <div className={`msg ${kpi.scanCoveragePct < 95 ? 'warn' : 'info'}`} style={{ marginTop: 10 }}>
              <b>刷取覆蓋率 {kpi.scanCoveragePct}%</b>
              {kpi.scanCoveragePct < 95
                ? '低於 95%：代表「拿了沒刷」仍多，建議把第二階段的盤點提前導入。'
                : '高於 95%：兩段刷取有落實，盤點可維持第二階段再導入。'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>
          最近作業 <span className="hint">Recent Events</span>
        </h3>
        <div className="tblwrap">
          <LogTable rows={data.recentEvents} />
        </div>
      </div>
    </>
  );
}
