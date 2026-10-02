import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SlotDTO, UnitDTO } from '@obe/shared';
import { api, ApiError, getOperator } from '../api/client';
import { BarCode } from '../components/BarCode';
import { Modal } from '../components/Modal';
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

const DEFAULT_CMD = 'OBE-OUT';

const OUTCOME_MSG: Record<string, { kind: Msg['kind']; title: string }> = {
  SLOT_CODE: { kind: 'warn', title: '刷退改成刷機台 S/N，不是刷櫃位' },
  UNKNOWN_SN: { kind: 'err', title: '查無此機台 S/N' },
  ALREADY_OUT: { kind: 'warn', title: '這台已經刷退過了' },
  LEFT_UNIT: { kind: 'err', title: '此機台已離場' },
  NO_SLOT: { kind: 'err', title: '此機台沒有儲位紀錄' },
};

/**
 * 取機出庫：刷「刷退條碼」啟用刷退模式 → 連續刷機台 S/N，每刷一台就釋放一格。
 * Ported from POC v04-1（handleOut / enterOutMode / exitOutMode / releaseUnit / manualSN / printOutCmd）.
 */
export default function CheckOut() {
  const [outOn, setOutOn] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [released, setReleased] = useState<{ slot: SlotDTO; unit: UnitDTO } | null>(null);
  const [shift, setShift] = useState<ShiftRow[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config });
  const cmd = config?.checkoutCommandCode ?? DEFAULT_CMD;
  const lastScan = useRef<{ v: string; t: number }>({ v: '', t: 0 });
  // 掃描依序處理：條碼槍連刷時不漏刷、也不會兩筆請求同時在跑（防重複送出）
  const queue = useRef<Promise<void>>(Promise.resolve());
  // 刷退模式也放 ref：排隊中的掃描要看到「最新」狀態，而不是 closure 捕捉到的舊值
  const outOnRef = useRef(false);
  useScanFocusGuard(inputRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const step = !outOn ? 1 : released ? 3 : 2;

  function setMode(on: boolean) {
    outOnRef.current = on;
    setOutOn(on);
  }

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
    setMode(false);
    setReleased(null);
    setMsg(null);
    if (inputRef.current) inputRef.current.value = '';
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function enterOutMode() {
    setMode(true);
    setMsg({ kind: 'ok', title: '✔ 刷退模式已啟用', body: '可以連續刷機台 S/N，每刷一台就釋放一格，不必再刷一次刷退條碼。結束請按右上角「結束刷退」。' });
    toast('刷退模式啟用', 'ok');
    inputRef.current?.focus();
  }

  function exitOutMode() {
    const n = shift.length;
    reset();
    setMsg({ kind: 'info', title: '已結束刷退模式', body: `本班累計刷退 ${n} 台。要再刷退請重新刷一次刷退條碼。` });
  }

  function enqueue(v: string) {
    queue.current = queue.current.then(() => handleScan(v)).catch(() => {});
  }

  async function handleScan(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    if (v === cmd) return enterOutMode();
    if (!outOnRef.current) {
      setMsg({ kind: 'warn', title: '請先刷「刷退條碼」', body: '畫面下方那張條碼就可以直接刷，或刷貼在刷取站上的那張。啟用後才會接受機台 S/N。' });
      return;
    }
    try {
      const r = await api.checkoutScanUnit(v);
      if (r.outcome === 'RELEASED' && r.unit && r.slot && r.releasedAt) return onReleased(r.unit, r.slot, r.releasedAt);
      const m = OUTCOME_MSG[r.outcome] ?? { kind: 'err' as const, title: '無法刷退' };
      setMsg({ ...m, body: r.message });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ALREADY_RELEASED') {
        setMsg({ kind: 'warn', title: '這台已經刷退過了', body: e.message });
        return;
      }
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  function onReleased(unit: UnitDTO, slot: SlotDTO, at: string) {
    const op = getOperator();
    const who = `${op.empNo} ${op.empName}`;
    setReleased({ slot, unit });
    setShift((cur) => [{ t: at, sn: unit.sn, loc: slot.code, emp: who }, ...cur]);
    const oi = unit.issues.filter((i) => i.status !== 'Closed');
    setMsg({
      kind: oi.length ? 'warn' : 'ok',
      title: oi.length ? `⚠ 已刷退，但此機台有 ${oi.length} 筆未結 OBE Issue` : `✔ 已刷退 ${unit.sn}`,
      body:
        `原位置 ${slot.code}（${slot.labelZh}）已釋放為空位，由 ${who} 於 ${formatDateTime(at)} 取出。` +
        (oi.length ? `Issue Owner（${oi.map((i) => i.owner).join('、')}）會收到通知。` : '可以接著刷下一台。'),
    });
    toast(`已刷退 ${unit.sn}`, 'ok');
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  return (
    <>
      <div className="steps">
        <div className={`step ${step === 1 ? 'on' : 'done'}`}>
          <b>Step 1</b>刷「刷退條碼」啟用
        </div>
        <div className={`step ${step === 2 ? 'on' : step === 3 ? 'done' : ''}`}>
          <b>Step 2</b>刷機台 S/N
        </div>
        <div className={`step ${step === 3 ? 'on' : ''}`}>
          <b>Step 3</b>刷退完成
        </div>
      </div>
      <div className="scan">
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>
              刷取區 <span className="hint">刷退條碼 → 機台 S/N · 2 秒內重複刷自動忽略</span>
              <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exitOutMode}>
                結束刷退
              </button>
            </h3>
            <div className="bd">
              {outOn && (
                <div className="outbanner">
                  <span className="pulse" />
                  <b>刷退模式啟用中</b>連續刷機台 S/N，每刷一台就釋放一格
                </div>
              )}
              <div className="scanbox act">
                <div className="cap">{outOn ? '刷退模式啟用中 — 請刷機台 S/N' : '請先刷下方「刷退條碼」啟用刷退'}</div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={outOn ? '掃描機台 S/N…' : '請先刷刷退條碼…'}
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const v = e.currentTarget.value.trim().toUpperCase();
                    e.currentTarget.value = '';
                    if (!v || isDuplicateScan(v)) return;
                    enqueue(v);
                  }}
                />
              </div>
              <div className={`cmdbox ${outOn ? 'dim' : ''}`}>
                <div className="cmdttl">
                  刷退條碼 <span className="muted">直接刷螢幕上這張，或刷貼在刷取站上印出來的那張</span>
                </div>
                {/* 螢幕直接掃：模組寬 ≥3px、不縮放 */}
                <BarCode text={cmd} width="auto" height={70} moduleWidth={3.8} />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn sm" onClick={() => setPrintOpen(true)}>
                    列印刷退條碼
                  </button>
                </div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => setManualOpen(true)}>
                  S/N 標籤破損，手動輸入
                </button>
                <button className="btn" onClick={reset}>
                  重來
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>
              刷退的機台 <span className="hint">含 E-Safe Launch OBE Issue</span>
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
                <div className="muted small">✔ 已刷退，該格恢復為空位</div>
                <div className="bigloc">
                  {released.slot.code}
                  <small>{released.slot.labelZh}</small>
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <span className="tag t-gray mono">{released.unit.sn}</span>
                </div>
              </>
            ) : (
              <>
                <div className="muted small">刷退的櫃位 Released Location</div>
                <div className="bigloc">
                  — — —<small>刷退條碼 → 機台 S/N</small>
                </div>
              </>
            )}
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>
              本班已刷退 <span className="hint">{shift.length} 筆</span>
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
                  <span className="muted small">本班尚無刷退紀錄</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {manualOpen && (
        <ManualSnModal
          onClose={() => setManualOpen(false)}
          onDone={(sn) => {
            setManualOpen(false);
            setMode(true);
            enqueue(sn);
          }}
        />
      )}

      {printOpen && (
        <Modal title="刷退條碼（可列印貼在刷取站）" width={560} onClose={() => setPrintOpen(false)} buttons={[{ label: '關閉', onClick: () => setPrintOpen(false) }]}>
          <div className="lblcard">
            <div style={{ textAlign: 'center' }}>
              <BarCode text={cmd} width="auto" height={56} moduleWidth={3} />
              <div className="mono" style={{ fontSize: 19, fontWeight: 800, letterSpacing: 2, marginTop: 5 }}>
                {cmd}
              </div>
            </div>
            <div>
              <div className="zh">刷　退</div>
              <div className="small muted" style={{ marginTop: 6 }}>
                條碼內容（1D Code128）：<b className="mono">{cmd}</b>
                <br />
                刷這張後，接著刷機台 S/N 即完成刷退
              </div>
            </div>
          </div>
          <div className="msg info" style={{ marginTop: 10 }}>
            <b>這是一張「指令條碼」，不是儲位</b>
            它不代表任何櫃位，只是告訴系統「接下來要刷退」。建議印兩張：一張貼在刷取站桌面，一張貼在推車把手上。
          </div>
        </Modal>
      )}
    </>
  );
}

/** S/N 標籤破損 — 手動輸入機台 S/N（只留稽核紀錄）。POC v04-1 manualSN() */
function ManualSnModal({ onClose, onDone }: { onClose: () => void; onDone: (sn: string) => void }) {
  const [sn, setSn] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit() {
    const v = sn.trim().toUpperCase();
    if (!v) return toast('查無此 S/N', 'err');
    if (!reason.trim()) return toast('請填理由', 'err');
    if (busy) return;
    setBusy(true);
    try {
      await api.checkoutManualSn(v, reason.trim());
      onDone(v);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="S/N 標籤破損 — 手動輸入機台 S/N"
      onClose={onClose}
      buttons={[
        { label: '取消', onClick: onClose, disabled: busy },
        { label: busy ? '處理中…' : '確認', className: 'btn pri', onClick: submit, disabled: busy },
      ]}
    >
      <div className="msg warn">
        <b>此入口會留下稽核紀錄</b>手動輸入少了一次實體確認，必須填理由。
      </div>
      <label className="f">機台 S/N（14 碼）</label>
      <input type="text" autoFocus value={sn} onChange={(e) => setSn(e.target.value)} placeholder="80699499000005" />
      <label className="f" style={{ marginTop: 10 }}>
        理由（必填）
      </label>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="例：S/N 標籤磨損掃不到"
      />
    </Modal>
  );
}
