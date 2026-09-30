import type { UnitDTO } from '@obe/shared';
import { AreaTag, DutStatusTag, daysSince } from './Tag';

/** 機台資訊（POC v0.4 unitInfoHTML）— 入庫／出庫／機台明細共用 */
export function UnitInfo({ u }: { u: UnitDTO }) {
  const openIssues = u.issues.filter((i) => i.status !== 'Closed');
  return (
    <>
      <dl className="kv">
        <dt>S/N</dt>
        <dd className="mono">
          {u.sn} {u.isTemp && <span className="tag t-red">臨時建檔</span>}
        </dd>
        <dt>專案／機種</dt>
        <dd>
          {u.project} · {u.model} ({u.phase})
        </dd>
        <dt>DUT 狀態</dt>
        <dd>
          <DutStatusTag status={u.dutStatus} />
        </dd>
        <dt>建議區域</dt>
        <dd>
          <AreaTag area={u.suggestedArea} /> {u.suggestedAreaName}
        </dd>
        <dt>Owner</dt>
        <dd>{u.owner}</dd>
        <dt>入庫天數</dt>
        <dd>
          {daysSince(u.inAt)} 天 {u.isStale && <span className="tag t-amber">呆滯</span>}
        </dd>
        <dt>OBE Issue</dt>
        <dd>{openIssues.length ? <span className="tag t-red">未結 {openIssues.length} 筆</span> : <span className="tag t-green">無未結</span>}</dd>
      </dl>
      {openIssues.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {openIssues.map((i) => (
            <div className="msg warn" key={i.id} style={{ marginBottom: 6 }}>
              <b>{i.title}</b>
              <div className="small">
                RC：{i.rootCause}
                <br />
                CA：{i.correctiveAction}
                <br />
                Status: {i.status} ｜ Owner: {i.owner}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
