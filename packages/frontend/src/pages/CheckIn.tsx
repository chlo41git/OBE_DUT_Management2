import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CheckInDecision, SlotDTO, SlotLocDTO, UnitDTO } from '@obe/shared';
import { api, ApiError } from '../api/client';
import { Modal } from '../components/Modal';
import { ManualSlotModal } from '../components/ManualSlotModal';
import { AreaTag, formatDateTime } from '../components/Tag';
import { UnitInfo } from '../components/UnitInfo';
import { useToast } from '../components/Toast';
import { useScanFocusGuard } from '../components/useScanFocusGuard';

interface Msg {
  kind: 'ok' | 'warn' | 'err' | 'info';
  title: string;
  body?: string;
}

type ModalState =
  | { type: 'OCCUPIED'; slotCode: string }
  | { type: 'UNKNOWN_SN'; sn: string; message: string }
  | { type: 'LEFT_UNIT'; sn: string; message: string }
  | { type: 'NEED_MOVE_CONFIRM'; sn: string; message: string; currentSlot: SlotLocDTO | null }
  | null;

interface ShiftRow {
  t: string;
  sn: string;
  loc: string;
  project: string;
  cross: boolean;
}

const SLOT_ERR_TITLE: Record<string, string> = {
  WRONG_ORDER: '順序不對：本版是「先櫃位、後機台」',
  INVALID_FORMAT: '無法辨識的條碼',
  NOT_FOUND: '查無此櫃位條碼',
  INACTIVE: '此台車已停用',
  BLOCKED: '此櫃位停用中',
};

/** 入庫：先刷櫃位條碼 → 再刷機台 S/N。Ported from POC v0.4. */
export default function CheckIn() {
  const [step, setStep] = useState<1 | 2>(1);
  const [slot, setSlot] = useState<SlotDTO | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState('');
  const [unitInfo, setUnitInfo] = useState<UnitDTO | null>(null);
  const [shift, setShift] = useState<ShiftRow[]>([]);
  const [freeByArea, setFreeByArea] = useState<Record<string, number>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config });
  const lastScan = useRef<{ v: string; t: number }>({ v: '', t: 0 });
  useScanFocusGuard(inputRef);

  const refreshFree = () => api.freeCountByArea().then(setFreeByArea).catch(() => {});
  useEffect(() => {
    refreshFree();
    inputRef.current?.focus();
  }, []);

  const setMsg = (m: Msg | null) => setMsgs(m ? [m] : []);

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

  function reset(keepMsg = false) {
    setStep(1);
    setSlot(null);
    if (!keepMsg) {
      setMsgs([]);
      setUnitInfo(null);
    }
    if (inputRef.current) inputRef.current.value = '';
    refreshFree();
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  // 依 step 分派：不要讓 handleScan 自我遞迴（stale step closure 會造成無窮迴圈）
  async function handleScan(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    if (step === 1) return doScanSlot(v);
    return doScanUnit(v);
  }

  async function doScanSlot(v: string, keepMsg = false) {
    try {
      const r = await api.checkinScanSlot(v);
      if (r.outcome === 'OK' && r.slot) {
        setSlot(r.slot);
        setStep(2);
        setUnitInfo(null);
        if (!keepMsg) setMsg({ kind: 'info', title: '櫃位確認完成', body: r.message });
      } else if (r.outcome === 'OCCUPIED') {
        setModal({ type: 'OCCUPIED', slotCode: r.slot?.code || v });
      } else {
        if (step === 2) reset(true);
        setMsg({ kind: r.outcome === 'WRONG_ORDER' ? 'warn' : 'err', title: SLOT_ERR_TITLE[r.outcome] ?? '無法辨識的條碼', body: r.message });
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  async function doScanUnit(v: string) {
    if (!slot) return;
    try {
      const r = await api.checkinScanUnit(slot.code, v);
      switch (r.outcome) {
        case 'SLOT_RESCAN':
          setMsg({ kind: 'info', title: '已更換目標櫃位', body: r.message });
          setStep(1);
          return doScanSlot(v, true);
        case 'ALREADY_HERE':
          setMsg({ kind: 'warn', title: '重複刷取', body: r.message });
          if (r.unit) setUnitInfo(r.unit);
          return;
        case 'UNKNOWN_SN':
          return setModal({ type: 'UNKNOWN_SN', sn: v, message: r.message });
        case 'LEFT_UNIT':
          setReason('');
          return setModal({ type: 'LEFT_UNIT', sn: v, message: r.message });
        case 'NEED_MOVE_CONFIRM':
          return setModal({ type: 'NEED_MOVE_CONFIRM', sn: v, message: r.message, currentSlot: r.currentSlot ?? null });
        case 'OK':
        case 'RETURN':
          return doCommit(v);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
      if (e instanceof ApiError && e.code.startsWith('SLOT_')) reset(true);
    }
  }

  async function doCommit(sn: string, decision?: CheckInDecision, rsn?: string) {
    if (!slot) return;
    try {
      const r = await api.checkinCommit({ slotCode: slot.code, sn, decision, reason: rsn });
      setModal(null);
      setReason('');
      setShift((cur) => [{ t: new Date().toISOString(), sn: r.unit.sn, loc: r.slot.code, project: r.unit.project, cross: r.crossArea }, ...cur]);
      setUnitInfo(r.unit);
      toast(`綁定完成 ${r.slot.code}`, 'ok');
      const done: Msg[] = [
        { kind: 'ok', title: '✔ 綁定完成', body: `[${r.unit.sn}] → ${r.slot.code}（${r.slot.labelZh}）　${formatDateTime(new Date().toISOString())}` },
      ];
      if (r.crossArea) {
        done.push({
          kind: 'warn',
          title: '提示：跨區擺放',
          body: `${r.message}系統已完成綁定不擋下，機台明細會標示「區域不符」，下次異動時歸位。`,
        });
      }
      reset(true);
      setMsgs(done);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  async function doReject(sn: string) {
    if (slot) await api.checkinReject(slot.code, sn).catch(() => {});
    toast('已記錄拒收', 'err');
    setModal(null);
    reset();
  }

  async function doBlockLeft(sn: string) {
    if (slot) await api.checkinBlockLeft(slot.code, sn).catch(() => {});
    setModal(null);
    reset();
  }

  return (
    <>
      <div className="steps">
        <div className={`step ${step === 1 ? 'on' : 'done'}`}>
          <b>Step 1</b>刷櫃位條碼（人員自選空位）
        </div>
        <div className={`step ${step === 2 ? 'on' : ''}`}>
          <b>Step 2</b>刷機台 S/N
        </div>
        <div className="step">
          <b>Step 3</b>綁定完成
        </div>
      </div>
      <div className="scan">
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>
              刷取區 <span className="hint">先櫃位、後機台 · 2 秒內重複刷自動忽略</span>
            </h3>
            <div className="bd">
              <div className="scanbox act">
                <div className="cap">{step === 1 ? '請先刷「櫃位條碼」' : `請刷機台 S/N（目標 ${slot?.code}）`}</div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={step === 1 ? '等待掃描…' : '掃描機台 S/N…'}
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
                <button className="btn" onClick={() => reset()}>
                  重來
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>
              機台資訊 <span className="hint">來源：SL2.0 unit 主檔</span>
            </h3>
            <div className="bd">{unitInfo ? <UnitInfo u={unitInfo} /> : <span className="muted small">尚未刷入機台</span>}</div>
          </div>
        </div>
        <div>
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.kind}`}>
              <b>{m.title}</b>
              {m.body}
            </div>
          ))}
          <div className={`locpanel ${slot ? 'go' : ''}`}>
            {slot ? (
              <>
                <div className="muted small">✔ 此格可放置 Target Location</div>
                <div className="bigloc">
                  {slot.code}
                  <small>{slot.labelZh}</small>
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <span className="tag t-green">空位可用</span>
                  <AreaTag area={slot.areaCode} />
                  <span className="tag t-gray">{slot.areaName}</span>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  請接著刷機台 S/N 完成綁定
                </div>
              </>
            ) : (
              <>
                <div className="muted small">目標櫃位 Target Location</div>
                <div className="bigloc">
                  — — —<small>請先刷櫃位條碼，人員可自由挑選任何空位</small>
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 8 }}>
                  {Object.entries(freeByArea).map(([a, n]) => (
                    <span key={a} className={`tag ${n > 60 ? 't-green' : n > 0 ? 't-amber' : 't-red'}`}>
                      {a} 空位 {n}
                    </span>
                  ))}
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  區域只是建議：未驗放 WIP、已驗放 FIN；放到另一區仍可完成，系統只提示不擋下。
                </div>
              </>
            )}
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>
              本班已入庫 <span className="hint">{shift.length} 筆</span>
            </h3>
            <div className="tblwrap" style={{ maxHeight: 210 }}>
              {shift.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>時間</th>
                      <th>S/N</th>
                      <th>櫃位條碼</th>
                      <th>專案</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shift.map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{formatDateTime(r.t)}</td>
                        <td className="mono">{r.sn}</td>
                        <td className="mono">
                          {r.loc} {r.cross && <span className="tag t-amber">跨區</span>}
                        </td>
                        <td>{r.project}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="bd">
                  <span className="muted small">本班尚無入庫紀錄</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modal?.type === 'OCCUPIED' && (
        <Modal
          title="⚠ 此櫃位已被佔用，請改刷其他空櫃位"
          onClose={() => setModal(null)}
          buttons={[
            {
              label: '知道了，改刷其他櫃位',
              className: 'btn pri',
              onClick: () => {
                setModal(null);
                reset();
                setMsg({
                  kind: 'warn',
                  title: '請改刷其他空櫃位',
                  body: `[${modal.slotCode}] 已被佔用，不能放。可參考畫面上 WIP／FIN 的可用空位數，或到「找機台與儲位地圖」找綠燈。`,
                });
              },
            },
          ]}
        >
          <div className="msg warn" style={{ margin: 0 }}>
            <b>就算現場這一格是空的，也不能放</b>
            常見情況是該機台被 RD 拿去 Debug、送測時沒有刷櫃位，系統仍把它記在這一格。
            <br />
            <b>請改刷其他綠燈空櫃位</b>把手上這台放好，先不要卡在這裡。
          </div>
        </Modal>
      )}

      {modal?.type === 'UNKNOWN_SN' && (
        <Modal
          title="未建檔 S/N"
          onClose={() => setModal(null)}
          buttons={[
            { label: '拒收退回', onClick: () => doReject(modal.sn) },
            { label: '臨時建檔並上架', className: 'btn pri', onClick: () => doCommit(modal.sn, 'TEMP_CREATE') },
          ]}
        >
          <div className="msg err">
            <b>{modal.sn} 不在機台主檔</b>
            {modal.message}
          </div>
          <div className="small muted">選「臨時建檔」會列入儀表板的待補清單，由 JQE 於 SL2.0 補齊主檔後才會消失。</div>
        </Modal>
      )}

      {modal?.type === 'LEFT_UNIT' && (
        <Modal
          title="此機台已離場"
          onClose={() => setModal(null)}
          buttons={[
            { label: '擋下，不收', onClick: () => doBlockLeft(modal.sn) },
            {
              label: '重新啟用並上架',
              className: 'btn pri',
              onClick: () => {
                if (!reason.trim()) return toast('請填理由', 'err');
                doCommit(modal.sn, 'REACTIVATE', reason.trim());
              },
            },
          ]}
        >
          <div className="msg err">
            <b>{modal.sn} 狀態為「已離場」（出貨或報廢）</b>
            {modal.message}
          </div>
          <label className="f">重新啟用理由（必填）</label>
          <input type="text" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：出貨取消退回／報廢前借回複測" />
        </Modal>
      )}

      {modal?.type === 'NEED_MOVE_CONFIRM' && (
        <Modal
          title="此機台系統顯示已在架上"
          onClose={() => {
            setModal(null);
            reset();
          }}
          buttons={[
            {
              label: '取消',
              onClick: () => {
                setModal(null);
                reset();
              },
            },
            { label: '確認移位到此格', className: 'btn pri', onClick: () => doCommit(modal.sn, 'CONFIRM_MOVE') },
          ]}
        >
          <div className="msg warn">
            <b>
              {modal.sn} 目前記錄在 {modal.currentSlot?.code}
            </b>
            （{modal.currentSlot?.labelZh}）
            <br />
            你現在要把它綁到 {slot?.code}。{modal.message}
          </div>
        </Modal>
      )}

      {manualOpen && (
        <ManualSlotModal
          mode="in"
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
