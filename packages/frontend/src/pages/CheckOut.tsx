import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SlotDTO, UnitDTO } from '@obe/shared';
import { api, ApiError, getOperator } from '../api/client';
import { Modal } from '../components/Modal';
import { ManualSlotModal } from '../components/ManualSlotModal';
import { formatDateTime } from '../components/Tag';
import { UnitInfo } from '../components/UnitInfo';
import { useToast } from '../components/Toast';
import { useScanFocusGuard } from '../components/useScanFocusGuard';

interface Msg {
  kind: 'ok' | 'warn' | 'err' | 'info';
  title: string;
  body?: string;
}
interface ShiftRow {
  t: string;
  sn: string;
  loc: string;
  emp: string;
}

const ERR_TITLE: Record<string, string> = {
  WRONG_ORDER: '本版出庫只需刷「櫃位條碼」',
  INVALID_FORMAT: '無法辨識的條碼',
  NOT_FOUND: '查無此櫃位條碼',
  BLOCKED: '此櫃位為停用中',
  EMPTY: '此櫃位系統顯示為空',
};

/** 出庫：只刷櫃位條碼 → 二次確認 → 釋放。Ported from POC v0.4. */
export default function CheckOut() {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ slot: SlotDTO; unit: UnitDTO } | null>(null);
  const [released, setReleased] = useState<{ slot: SlotDTO; unit: UnitDTO } | null>(null);
  const [shift, setShift] = useState<ShiftRow[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [manualOpen, setManualOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config });
  const lastScan = useRef<{ v: string; t: number }>({ v: '', t: 0 });
  useScanFocusGuard(inputRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function isDuplicateScan(v: string) {
    const windowMs = (config?.dedupSeconds ?? 2) * 1000;
    const now = Date.now();
    if (v === lastScan.current.v && now - lastScan.current.t < windowMs) {
      toast('2 秒內重複刷同一條碼，已忽略');
      return true;
    }
    lastScan.current = { v, t: now };
    return false;
  }

  function reset() {
    setStep(1);
    setReleased(null);
    setMsg(null);
    if (inputRef.current) inputRef.current.value = '';
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  async function handleScan(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    try {
      const r = await api.checkoutScanSlot(v);
      if (r.outcome === 'OK' && r.slot && r.unit) {
        setStep(2);
        setConfirmTarget({ slot: r.slot, unit: r.unit });
      } else {
        setMsg({ kind: r.outcome === 'WRONG_ORDER' ? 'warn' : 'err', title: ERR_TITLE[r.outcome] ?? '無法辨識的條碼', body: r.message });
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  function cancelConfirm() {
    setConfirmTarget(null);
    reset();
    toast('已取消');
  }

  async function confirmRelease() {
    if (!confirmTarget) return;
    try {
      const r = await api.checkoutConfirm(confirmTarget.slot.code);
      const op = getOperator();
      const who = `${op.empNo} ${op.empName}`;
      setConfirmTarget(null);
      setReleased({ slot: r.slot, unit: r.unit });
      setStep(3);
      setShift((cur) => [{ t: r.releasedAt, sn: r.unit.sn, loc: r.slot.code, emp: who }, ...cur]);
      const oi = r.unit.issues.filter((i) => i.status !== 'Closed');
      setMsg({
        kind: oi.length ? 'warn' : 'ok',
        title: oi.length ? `⚠ 已釋放，但此機台有 ${oi.length} 筆未結 OBE Issue` : '✔ 已釋放此櫃位',
        body:
          `取走的是 ${r.unit.sn}　由 ${who} 於 ${formatDateTime(r.releasedAt)} 取出` +
          (oi.length ? `。Issue Owner（${oi.map((i) => i.owner).join('、')}）會收到通知。` : '。'),
      });
      toast(`已釋放 ${r.slot.code}`, 'ok');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  const confirmIssues = confirmTarget?.unit.issues.filter((i) => i.status !== 'Closed') ?? [];

  return (
    <>
      <div className="steps">
        <div className={`step ${step === 1 ? 'on' : 'done'}`}>
          <b>Step 1</b>刷櫃位條碼
        </div>
        <div className={`step ${step === 2 ? 'on' : step === 3 ? 'done' : ''}`}>
          <b>Step 2</b>確認取出（二次確認）
        </div>
        <div className={`step ${step === 3 ? 'on' : ''}`}>
          <b>Step 3</b>釋放完成
        </div>
      </div>
      <div className="scan">
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>
              刷取區 <span className="hint">刷櫃位條碼 → 二次確認後才釋放</span>
            </h3>
            <div className="bd">
              <div className="scanbox act">
                <div className="cap">請刷「櫃位條碼」釋放該格</div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="等待掃描…"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const v = e.currentTarget.value.trim().toUpperCase();
                    e.currentTarget.value = '';
                    if (!v || isDuplicateScan(v)) return;
                    handleScan(v);
                  }}
                />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setManualOpen(true)}>
                  標籤破損，手動輸入儲位
                </button>
                <button className="btn" onClick={reset}>
                  重來
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>
              取出的機台 <span className="hint">含 E-Safe Launch OBE Issue</span>
            </h3>
            <div className="bd">{released ? <UnitInfo u={released.unit} /> : <span className="muted small">尚未刷取</span>}</div>
          </div>
        </div>
        <div>
          {msg && (
            <div className={`msg ${msg.kind}`}>
              <b>{msg.title}</b>
              {msg.body}
            </div>
          )}
          <div className={`locpanel ${released ? 'go' : ''}`}>
            {released ? (
              <>
                <div className="muted small">✔ 已釋放 Released</div>
                <div className="bigloc">
                  {released.slot.code}
                  <small>{released.slot.labelZh} 現為空位</small>
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <span className="tag t-gray mono">{released.unit.sn}</span>
                </div>
              </>
            ) : (
              <>
                <div className="muted small">釋放的櫃位 Released Location</div>
                <div className="bigloc">
                  — — —<small>刷櫃位條碼，確認後才釋放</small>
                </div>
              </>
            )}
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>
              本班已出庫 <span className="hint">{shift.length} 筆</span>
            </h3>
            <div className="tblwrap" style={{ maxHeight: 210 }}>
              {shift.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>時間</th>
                      <th>S/N</th>
                      <th>原櫃位條碼</th>
                      <th>操作員</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shift.map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{formatDateTime(r.t)}</td>
                        <td className="mono">{r.sn}</td>
                        <td className="mono">{r.loc}</td>
                        <td className="small">{r.emp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="bd">
                  <span className="muted small">本班尚無出庫紀錄</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmTarget && (
        <Modal
          title="確認取出？"
          onClose={cancelConfirm}
          buttons={[
            { label: '取消，不取出', onClick: cancelConfirm },
            { label: '確認取出', className: 'btn pri', onClick: confirmRelease },
          ]}
        >
          <div className="msg warn" style={{ marginBottom: 10 }}>
            <b>此動作會把櫃位釋放為空位</b>請先確認手上要取走的就是這一台，避免誤刷。
          </div>
          <div style={{ textAlign: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 12px', background: '#f8fafc' }}>
            <div className="muted small">櫃位條碼</div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>
              {confirmTarget.slot.code}
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              {confirmTarget.slot.labelZh}
            </div>
            <div className="muted small" style={{ marginTop: 12 }}>
              機台 S/N
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {confirmTarget.unit.sn}
            </div>
          </div>
          {confirmIssues.length > 0 && (
            <div className="msg err" style={{ marginTop: 10 }}>
              <b>⚠ 此機台有 {confirmIssues.length} 筆未結 OBE Issue</b>
              Owner（{confirmIssues.map((i) => i.owner).join('、')}）會在取出後收到通知。
            </div>
          )}
        </Modal>
      )}

      {manualOpen && (
        <ManualSlotModal
          mode="out"
          onClose={() => setManualOpen(false)}
          onDone={(s) => {
            setManualOpen(false);
            handleScan(s.code);
          }}
        />
      )}
    </>
  );
}
