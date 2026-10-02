import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AreaCode, AreaDTO, MapSlotCell, RackDTO } from '@obe/shared';
import { api, ApiError } from '../api/client';
import { BarCode } from '../components/BarCode';
import { Modal } from '../components/Modal';
import { PrintLabelModal } from '../components/PrintModals';
import { UnitDrawer } from '../components/UnitDrawer';
import { AreaTag, pad2 } from '../components/Tag';
import { useToast } from '../components/Toast';

const ledClass = (s: MapSlotCell) => (s.status === 'BLOCKED' ? 'led-block' : s.sn ? 'led-occ' : 'led-empty');

/** 找機台與儲位地圖。Ported from POC v0.4 renderMap()/renderAll()/renderOne(). */
export default function MapPage() {
  const [areas, setAreas] = useState<AreaDTO[]>([]);
  const [racks, setRacks] = useState<RackDTO[]>([]);
  const [mode, setMode] = useState<'ALL' | 'ONE'>('ALL');
  const [currRack, setCurrRack] = useState<string | null>(null);
  const [slots, setSlots] = useState<MapSlotCell[]>([]);
  const [params, setParams] = useSearchParams();
  const [kw, setKw] = useState(params.get('kw') || '');
  const [hits, setHits] = useState<Set<string>>(new Set());
  const [findMsg, setFindMsg] = useState<ReactNode>(null);
  const [openSn, setOpenSn] = useState<string | null>(null);
  const [slotModal, setSlotModal] = useState<MapSlotCell | null>(null);
  const [blockFor, setBlockFor] = useState<MapSlotCell | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [printSlot, setPrintSlot] = useState<MapSlotCell | null>(null);
  const [newRackOpen, setNewRackOpen] = useState(false);
  const [rackBlocked, setRackBlocked] = useState<{ headline: string; body: string } | null>(null);
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.config });
  const toast = useToast();
  const scrollDone = useRef(false);

  const levels = config?.levels ?? 11;
  const positions = config?.positions ?? 4;
  const blockReasons = config?.blockReasons ?? [];

  function reloadRacks() {
    api.areas().then(setAreas);
    api.racks().then((r) => {
      setRacks(r);
      setCurrRack((cur) => cur ?? (r.length ? r[0].code : null));
    });
  }
  const reloadSlots = () => api.mapSlots().then(setSlots);

  useEffect(() => {
    reloadRacks();
    reloadSlots();
    const t = setInterval(reloadSlots, 15000);
    return () => clearInterval(t);
  }, []);

  // 深連結 /map?kw=...（機台明細「在地圖上定位」）
  useEffect(() => {
    const urlKw = params.get('kw');
    if (urlKw && slots.length > 0) doFind(urlKw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('kw'), slots.length > 0]);

  const slotByCode = useMemo(() => new Map(slots.map((s) => [s.code, s])), [slots]);
  const rackStat = useMemo(() => {
    const m: Record<string, { n: number; used: number; block: number; hit: number }> = {};
    slots.forEach((s) => {
      const r = (m[s.rackCode] ??= { n: 0, used: 0, block: 0, hit: 0 });
      r.n++;
      if (s.sn) r.used++;
      if (s.status === 'BLOCKED') r.block++;
      if (hits.has(s.code)) r.hit++;
    });
    return m;
  }, [slots, hits]);

  async function doFind(kwOverride?: string) {
    const kwv = (kwOverride ?? kw).trim().toUpperCase();
    setKw(kwv);
    setParams(kwv ? { kw: kwv } : {}, { replace: true });
    if (!kwv) {
      setHits(new Set());
      setFindMsg(null);
      return;
    }
    const res = await api.mapFind(kwv);
    const inRack = res.filter((u) => u.slot);
    setHits(new Set(inRack.map((u) => u.slot!.code)));
    setMode('ALL'); // 查詢一律留在全區總覽，不跳單台車
    scrollDone.current = false;
    if (!res.length) {
      setFindMsg(<span className="no">查無此 S/N</span>);
      toast('查無此 S/N', 'err');
      return;
    }
    if (res.length === 1) {
      const u = res[0];
      setFindMsg(
        u.slot ? (
          <>
            <b className="mono">{u.sn}</b> → <b className="mono">{u.slot.code}</b> <b>{u.slot.labelZh}</b> <span className="muted">｜圖上紫框閃爍處</span>
          </>
        ) : (
          <>
            <b className="mono">{u.sn}</b> <span className="no">{u.state === 'OUT' ? '已取出，不在架上' : u.state === 'NEW' ? '待入庫，不在架上' : '已離場'}</span>
          </>
        ),
      );
      return;
    }
    setFindMsg(
      <>
        命中 <b>{res.length}</b> 台，其中在架 <b>{inRack.length}</b> 台，已於圖上標出
      </>,
    );
  }

  function clearFind() {
    setKw('');
    setHits(new Set());
    setFindMsg(null);
    setParams({}, { replace: true });
  }

  useEffect(() => {
    if (hits.size && mode === 'ALL' && !scrollDone.current) {
      setTimeout(() => {
        document.querySelector('.cartcard.hasHit')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        scrollDone.current = true;
      }, 80);
    }
  }, [hits, mode, slots]);

  async function toggleRack(code: string) {
    try {
      const r = await api.toggleRack(code);
      setRacks((cur) => cur.map((x) => (x.code === code ? r : x)));
      toast(r.isActive ? '已啟用' : '已停用', 'ok');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RACK_NOT_EMPTY') {
        const hint = (e.details as { hint?: string } | undefined)?.hint ?? '';
        setRackBlocked({ headline: e.message, body: hint });
        return;
      }
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  async function unblock(s: MapSlotCell) {
    try {
      await api.unblockSlot(s.code);
      setSlotModal(null);
      await reloadSlots();
      toast('已解除停用', 'ok');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  async function confirmBlock() {
    if (!blockFor) return;
    try {
      await api.blockSlot(blockFor.code, { reason: blockReason || blockReasons[0] });
      setBlockFor(null);
      setSlotModal(null);
      await reloadSlots();
      toast('已停用', 'ok');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  const tot = { used: 0, empty: 0, block: 0 };
  slots.forEach((s) => (s.status === 'BLOCKED' ? tot.block++ : s.sn ? tot.used++ : tot.empty++));
  const currRackObj = racks.find((r) => r.code === currRack);
  const currArea = areas.find((a) => a.code === currRackObj?.areaCode);
  const cst = rackStat[currRack ?? ''] ?? { n: 0, used: 0, block: 0, hit: 0 };

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="bd">
          <div className="filters">
            <input
              type="text"
              placeholder="輸入 S/N 或後四碼，按 Enter 直接定位…"
              style={{ minWidth: 290 }}
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doFind()}
            />
            <button className="btn pri" onClick={() => doFind()}>
              查詢定位
            </button>
            <button className="btn" onClick={clearFind}>
              清除
            </button>
            <span className="findres">{findMsg}</span>
            <span className="row" style={{ marginLeft: 'auto' }}>
              <button className={`btn modebtn ${mode === 'ALL' ? 'on' : ''}`} onClick={() => setMode('ALL')}>
                全區總覽
              </button>
              <button className={`btn modebtn ${mode === 'ONE' ? 'on' : ''}`} onClick={() => setMode('ONE')}>
                單台車
              </button>
              <button className="btn pri" onClick={() => setNewRackOpen(true)}>
                ＋ 新增台車
              </button>
            </span>
          </div>
          <div className="legend" style={{ margin: 0 }}>
            <span>
              <i className="led led-occ" style={{ width: 11, height: 11 }} />
              紅燈：已使用
            </span>
            <span>
              <i className="led led-empty" style={{ width: 11, height: 11 }} />
              綠燈：空位
            </span>
            <span>
              <i className="led led-block" style={{ width: 11, height: 11 }} />
              灰燈：停用（治具盤／破損）
            </span>
            <span style={{ color: '#7c3aed' }}>
              <b>紫框閃爍</b>＝查詢命中的機台位置
            </span>
            <span style={{ marginLeft: 'auto' }} className="muted">
              燈號位置＝實際架位：左起第 1 機位 → 第 {positions} 機位，由上而下第 1 層 → 第 {levels} 層
            </span>
          </div>
        </div>
      </div>

      {mode === 'ALL' ? (
        <div className="card">
          <h3>
            全區總覽{' '}
            <span className="hint">
              {racks.length} 臺車 ｜紅燈 {tot.used} ｜綠燈 {tot.empty} ｜灰燈 {tot.block}　（列＝層 01–{pad2(levels)}，欄＝機位 01–{pad2(positions)}）
            </span>
          </h3>
          <div className="bd">
            {areas.map((a) => {
              const areaRacks = racks.filter((r) => r.areaCode === a.code);
              const ss = areaRacks.reduce((n, r) => n + (rackStat[r.code]?.n ?? 0), 0);
              const us = areaRacks.reduce((n, r) => n + (rackStat[r.code]?.used ?? 0), 0);
              return (
                <Fragment key={a.code}>
                  <div className="row" style={{ margin: '14px 0 8px', alignItems: 'baseline' }}>
                    <AreaTag area={a.code} />
                    <b style={{ fontSize: 13 }}>{a.name}</b>
                    <span className="muted small">
                      {areaRacks.length} 臺車 ｜使用 {us}/{ss}
                    </span>
                  </div>
                  <div className="cartgrid">
                    {areaRacks.map((r) => {
                      const st = rackStat[r.code] ?? { n: 0, used: 0, block: 0, hit: 0 };
                      return (
                        <div
                          key={r.code}
                          className={`cartcard ${st.hit ? 'hasHit' : ''} ${currRack === r.code ? 'on' : ''}`}
                          onClick={() => {
                            setCurrRack(r.code);
                            setMode('ONE');
                          }}
                        >
                          <div className="hd">
                            <span className="nm">{r.code}</span>
                            <span className="rt">
                              {st.used}/{st.n}
                            </span>
                          </div>
                          {!r.isActive && (
                            <div className="sub">
                              <b>已停用</b>
                            </div>
                          )}
                          {st.hit > 0 && (
                            <div className="sub">
                              <b style={{ color: '#7c3aed' }}>命中 {st.hit} 台</b>
                            </div>
                          )}
                          <MiniGrid rackCode={r.code} levels={levels} positions={positions} slotByCode={slotByCode} hits={hits} />
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rackwrap">
          <div className="card">
            <h3>台車清單</h3>
            <div className="racklist">
              {racks.map((r) => (
                <div key={r.code} className={`rackitem ${r.code === currRack ? 'on' : ''}`} onClick={() => setCurrRack(r.code)}>
                  <span className="nm">{r.code}</span>
                  <span className="small muted">{r.localNo}</span>
                  {!r.isActive && <span className="tag t-gray small">停用</span>}
                  {(rackStat[r.code]?.hit ?? 0) > 0 && <span className="tag t-violet small">命中</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>
              {currRack}{' '}
              <span className="hint">
                {currArea?.name} · {currRackObj?.localNo} ｜使用 {cst.used}/{cst.n}（停用 {cst.block}）
                {cst.hit > 0 && (
                  <>
                    {' '}
                    ｜<b style={{ color: '#7c3aed' }}>命中 {cst.hit}</b>
                  </>
                )}
              </span>
            </h3>
            <div className="bd">
              {currRackObj && (
                <div className="row" style={{ marginBottom: 10 }}>
                  <AreaTag area={currRackObj.areaCode} />
                  <span className={`tag ${currRackObj.isActive ? 't-green' : 't-gray'}`}>{currRackObj.isActive ? '啟用中' : '已停用'}</span>
                  {currRackObj.note && <span className="tag t-amber">{currRackObj.note}</span>}
                  <span style={{ marginLeft: 'auto' }} />
                  <button className={`btn sm ${currRackObj.isActive ? 'dgr' : ''}`} onClick={() => toggleRack(currRackObj.code)}>
                    {currRackObj.isActive ? '停用' : '啟用'}
                  </button>
                </div>
              )}
              <div className="shelfrow">
                <span className="lv" />
                {Array.from({ length: positions }, (_, i) => (
                  <span key={i} className="small muted" style={{ textAlign: 'center' }}>
                    第 {pad2(i + 1)} 機位
                  </span>
                ))}
              </div>
              {Array.from({ length: levels }, (_, li) => {
                const L = li + 1;
                return (
                  <div className="shelfrow" key={L}>
                    <span className="lv">{pad2(L)} 層</span>
                    {Array.from({ length: positions }, (_, pi) => {
                      const s = slotByCode.get(`${currRack}-${pad2(L)}-${pad2(pi + 1)}`);
                      if (!s) return <div key={pi} />;
                      return (
                        <div key={s.code} className={`cell ${hits.has(s.code) ? 'hit' : ''}`} onClick={() => (s.sn ? setOpenSn(s.sn) : setSlotModal(s))}>
                          <span className={`led ${ledClass(s)}`} />
                          <div className="info">
                            <div className="pn">
                              {pad2(s.level)}-{pad2(s.pos)}
                              {s.labelBroken ? ' ⚠標籤' : ''}
                            </div>
                            {s.status === 'BLOCKED' ? (
                              <div className="sn" style={{ color: '#64748b' }}>
                                停用
                              </div>
                            ) : s.sn ? (
                              <div className="sn">{s.sn}</div>
                            ) : (
                              <div className="sn" style={{ color: '#16a34a' }}>
                                空位
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {openSn && (
        <UnitDrawer
          sn={openSn}
          onClose={() => {
            setOpenSn(null);
            reloadSlots();
          }}
        />
      )}

      {slotModal && !blockFor && !printSlot && (
        <Modal
          title={`儲位 ${slotModal.code}`}
          onClose={() => setSlotModal(null)}
          buttons={[
            { label: '檢視標籤', onClick: () => setPrintSlot(slotModal) },
            slotModal.status === 'BLOCKED'
              ? { label: '解除停用', onClick: () => unblock(slotModal) }
              : {
                  label: '標記停用（治具盤／破損）',
                  className: 'btn dgr',
                  onClick: () => {
                    setBlockReason(blockReasons[0] ?? '');
                    setBlockFor(slotModal);
                  },
                },
            { label: '關閉', onClick: () => setSlotModal(null) },
          ]}
        >
          <dl className="kv">
            <dt>條碼內容</dt>
            <dd className="mono">{slotModal.code}</dd>
            <dt>標籤中文</dt>
            <dd>{slotModal.labelZh}</dd>
            <dt>燈號</dt>
            <dd>
              {slotModal.status === 'BLOCKED' ? (
                <>
                  <span className="tag t-gray">灰燈・停用</span> {slotModal.blockReason}
                </>
              ) : (
                <span className="tag t-green">綠燈・空位</span>
              )}
            </dd>
            {slotModal.labelBroken && (
              <>
                <dt>標籤</dt>
                <dd>
                  <span className="tag t-amber">待補印</span> {slotModal.labelBrokenReason}
                </dd>
              </>
            )}
          </dl>
          <div style={{ marginTop: 12 }}>
            <BarCode text={slotModal.code} width={300} height={45} />
          </div>
        </Modal>
      )}

      {blockFor && (
        <Modal
          title={`標記停用 ${blockFor.code}`}
          onClose={() => setBlockFor(null)}
          buttons={[
            { label: '取消', onClick: () => setBlockFor(null) },
            { label: '確認停用', className: 'btn dgr', onClick: confirmBlock },
          ]}
        >
          <label className="f">原因</label>
          <select value={blockReason} onChange={(e) => setBlockReason(e.target.value)}>
            {blockReasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <div className="small muted" style={{ marginTop: 8 }}>
            停用後燈號轉灰，使用率分母自動扣除。
          </div>
        </Modal>
      )}

      {printSlot && <PrintLabelModal slot={printSlot} levels={levels} onClose={() => setPrintSlot(null)} />}

      {newRackOpen && (
        <NewRackModal
          areas={areas}
          levels={levels}
          positions={positions}
          onClose={() => setNewRackOpen(false)}
          onCreated={(r) => {
            setNewRackOpen(false);
            reloadRacks();
            reloadSlots();
            setCurrRack(r.code);
            setMode('ONE');
            toast(`已新增 ${r.code}`, 'ok');
          }}
        />
      )}

      {rackBlocked && (
        <Modal title="無法停用" onClose={() => setRackBlocked(null)} buttons={[{ label: '關閉', onClick: () => setRackBlocked(null) }]}>
          <div className="msg err">
            <b>{rackBlocked.headline}</b>
            {rackBlocked.body}
          </div>
        </Modal>
      )}
    </>
  );
}

function MiniGrid({
  rackCode,
  levels,
  positions,
  slotByCode,
  hits,
}: {
  rackCode: string;
  levels: number;
  positions: number;
  slotByCode: Map<string, MapSlotCell>;
  hits: Set<string>;
}) {
  return (
    <div className="mini" style={{ gridTemplateColumns: `15px repeat(${positions}, 1fr)` }}>
      <span />
      {Array.from({ length: positions }, (_, i) => (
        <span key={i} className="hl">
          {pad2(i + 1)}
        </span>
      ))}
      {Array.from({ length: levels }, (_, li) => (
        <Fragment key={li}>
          <span className="lv">{pad2(li + 1)}</span>
          {Array.from({ length: positions }, (_, pi) => {
            const s = slotByCode.get(`${rackCode}-${pad2(li + 1)}-${pad2(pi + 1)}`);
            if (!s) return <i key={pi} />;
            const tip = `${s.code}\n${s.labelZh}\n${
              s.sn ? `紅燈・已使用 ${s.sn} ｜${s.project} ｜${s.dutStatus}` : s.status === 'BLOCKED' ? `灰燈・停用 ${s.blockReason}` : '綠燈・空位可放置'
            }`;
            return <i key={pi} className={`led ${ledClass(s)} ${hits.has(s.code) ? 'hitdot' : ''}`} title={tip} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}

function NewRackModal({
  areas,
  levels,
  positions,
  onClose,
  onCreated,
}: {
  areas: AreaDTO[];
  levels: number;
  positions: number;
  onClose: () => void;
  onCreated: (r: RackDTO) => void;
}) {
  const [areaCode, setAreaCode] = useState<AreaCode>(areas[0]?.code ?? 'WIP');
  const toast = useToast();
  const n = levels * positions;
  return (
    <Modal
      title="新增台車"
      onClose={onClose}
      buttons={[
        { label: '取消', onClick: onClose },
        {
          label: '建立',
          className: 'btn pri',
          onClick: async () => {
            try {
              onCreated(await api.createRack(areaCode));
            } catch (e) {
              toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
            }
          },
        },
      ]}
    >
      <label className="f">區域</label>
      <select value={areaCode} onChange={(e) => setAreaCode(e.target.value as AreaCode)}>
        {areas.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code} {a.name}
          </option>
        ))}
      </select>
      <div className="small muted" style={{ marginTop: 10 }}>
        台車號自動接續該區最後一號，建立後自動長出 {levels} 層 × {positions} 機位＝{n} 個儲位。
      </div>
      <div className="msg warn" style={{ marginTop: 10 }}>
        <b>新增後必須先把 {n} 張條碼印出來貼上去</b>系統只認條碼；沒貼標籤的台車人員刷不到，等於不存在。
      </div>
    </Modal>
  );
}
