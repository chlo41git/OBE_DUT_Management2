import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getOperator, setOperator } from '../api/client';
import { Modal } from './Modal';

const TTL: Record<string, [string, string]> = {
  '/dash': ['戰情儀表板', 'OBE 區 DUT 即時在庫概況'],
  '/in': ['入庫上架 Check-in', '刷櫃位條碼 → 刷機台 S/N → 綁定完成（人員自由選空位）'],
  '/out': ['取機出庫 Check-out', '刷「刷退條碼」啟用 → 刷機台 S/N → 該格自動釋放'],
  '/map': ['找機台與儲位地圖', '燈號即現況：紅＝已使用、綠＝空位；查詢命中會在圖上閃爍定位'],
  '/log': ['事件紀錄', 'Audit Trail'],
};

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="chip">{`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`}</span>;
}

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');

export function Layout() {
  const loc = useLocation();
  const [title, sub] = TTL[loc.pathname] ?? ['OBE DUT 儲位管理系統', ''];
  const [editingOp, setEditingOp] = useState(false);
  const [op, setOp] = useState(getOperator());

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <h1>OBE DUT 儲位管理系統</h1>
          <span>EQM1 Storage Mgmt · v0.4</span>
        </div>
        <nav className="nav">
          <div className="grp">管理 Management</div>
          <NavLink to="/in" className={navCls}>
            <span className="ic">↧</span>入庫上架 Check-in
          </NavLink>
          <NavLink to="/out" className={navCls}>
            <span className="ic">↥</span>取機出庫 Check-out
          </NavLink>
          <NavLink to="/map" className={navCls}>
            <span className="ic">▦</span>找機台與儲位地圖
          </NavLink>
          <div className="grp">系統 System</div>
          <NavLink to="/dash" className={navCls}>
            <span className="ic">▤</span>戰情儀表板
          </NavLink>
          <NavLink to="/log" className={navCls}>
            <span className="ic">≡</span>事件紀錄
          </NavLink>
        </nav>
        <div className="sidefoot">
          條碼格式 <b>WIP／FIN-台車-層-機位</b>
          <br />
          React+TS ／ Node+TS ／ PostgreSQL
          <br />
          OBE_DUT_儲位管理系統 POC v0.4 移植
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <h2>{title}</h2>
          <span className="sub">{sub}</span>
          <div className="right">
            <span className="chip">
              刷取站 <b>OBE-STN01</b>
            </span>
            <span className="chip" style={{ cursor: 'pointer' }} title="點擊切換操作員" onClick={() => setEditingOp(true)}>
              操作員 <b>{op.empNo} {op.empName}</b>
            </span>
            <Clock />
          </div>
        </header>
        <div className="view">
          <Outlet />
        </div>
      </div>

      {editingOp && (
        <Modal
          title="切換操作員（模擬刷員工證）"
          onClose={() => setEditingOp(false)}
          buttons={[
            { label: '取消', onClick: () => setEditingOp(false) },
            {
              label: '確認',
              className: 'btn pri',
              onClick: () => {
                setOperator(op);
                setEditingOp(false);
                window.location.reload();
              },
            },
          ]}
        >
          <label className="f">工號</label>
          <input type="text" value={op.empNo} onChange={(e) => setOp({ ...op, empNo: e.target.value })} />
          <label className="f" style={{ marginTop: 10 }}>
            姓名
          </label>
          <input type="text" value={op.empName} onChange={(e) => setOp({ ...op, empName: e.target.value })} />
        </Modal>
      )}
    </div>
  );
}
