import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MovementDTO, UnitDTO } from '@obe/shared';
import { api } from '../api/client';
import { Drawer } from './Modal';
import { AreaTag, daysSince, formatDateTime } from './Tag';
import { UnitInfo } from './UnitInfo';
import { PrintLabelModal } from './PrintModals';

/** 機台明細抽屜。POC v0.4 showUnit() */
export function UnitDrawer({ sn, onClose }: { sn: string; onClose: () => void }) {
  const [unit, setUnit] = useState<UnitDTO | null>(null);
  const [events, setEvents] = useState<MovementDTO[]>([]);
  const [printing, setPrinting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.unit(sn).then(setUnit);
    api.events({ sn, limit: 10 }).then((r) => setEvents(r.rows));
  }, [sn]);

  if (!unit) return null;
  const inRack = unit.state === 'IN' && unit.slot;

  return (
    <>
      <Drawer title={`機台明細 ${sn}`} onClose={onClose}>
        <UnitInfo u={unit} />

        <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>位置狀態</h4>
        {inRack && unit.slot && (
          <div className="msg ok">
            <b>在庫 {unit.slot.code}</b>
            {unit.slot.labelZh}｜已放 {daysSince(unit.lastMoveAt)} 天
            {unit.areaMismatch && (
              <>
                <br />
                <span className="tag t-violet">
                  區域不符：建議 <AreaTag area={unit.suggestedArea} />，下次異動時歸位
                </span>
              </>
            )}
          </div>
        )}
        {unit.state === 'OUT' && (
          <div className="msg warn">
            <b>已刷退取出</b>由 {unit.loanBy} 於 {formatDateTime(unit.loanOutAt)} 取出（離架 {daysSince(unit.loanOutAt)} 天）
          </div>
        )}
        {unit.state === 'LEFT' && (
          <div className="msg err">
            <b>已離場</b>已出貨或報廢；要再入庫需先「重新啟用」
          </div>
        )}
        {unit.state === 'NEW' && (
          <div className="msg info">
            <b>待入庫</b>請走入庫上架流程刷上架
          </div>
        )}

        <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>異動履歷</h4>
        <ul className="tl">
          {events.length ? (
            events.map((e) => (
              <li key={e.id}>
                <div className="tm">{formatDateTime(e.ts)}</div>
                <b>{e.type}</b> {e.slotCode && <span className="mono">{e.slotCode}</span>}
                <div className="small muted">
                  {e.empNo} {e.empName} ｜{e.note}
                </div>
              </li>
            ))
          ) : (
            <li className="muted small">無紀錄</li>
          )}
        </ul>

        {inRack && (
          <div className="row">
            <button
              className="btn pri"
              onClick={() => {
                onClose();
                navigate(`/map?kw=${encodeURIComponent(unit.sn)}`);
              }}
            >
              在地圖上定位
            </button>
            <button className="btn" onClick={() => setPrinting(true)}>
              檢視櫃位標籤
            </button>
          </div>
        )}
      </Drawer>
      {printing && unit.slot && <PrintLabelModal slot={unit.slot} onClose={() => setPrinting(false)} />}
    </>
  );
}
