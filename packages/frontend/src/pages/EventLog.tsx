import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { LogTable } from '../components/LogTable';

/** 事件紀錄（Audit Trail · 不可刪改）。Ported from POC v0.4 renderLog(). */
export default function EventLog() {
  const [type, setType] = useState('');
  const [kw, setKw] = useState('');
  const [query, setQuery] = useState({ type: '', kw: '' });
  const { data: types } = useQuery({ queryKey: ['event-types'], queryFn: api.eventTypes });
  const { data } = useQuery({ queryKey: ['events', query], queryFn: () => api.events({ ...query, limit: 300 }) });
  const run = () => setQuery({ type, kw: kw.trim().toUpperCase() });

  return (
    <div className="card">
      <h3>
        事件紀錄 <span className="hint">Audit Trail · 不可刪改</span>
      </h3>
      <div className="bd">
        <div className="filters">
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 190 }}>
            <option value="">全部事件</option>
            {(types || []).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input type="text" placeholder="S/N 或儲位" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
          <button className="btn pri" onClick={run}>
            查詢
          </button>
          <span className="muted small">{data ? `共 ${data.total} 筆（顯示前 300）` : ''}</span>
        </div>
      </div>
      <div className="tblwrap">
        <LogTable rows={data?.rows ?? []} />
      </div>
    </div>
  );
}
