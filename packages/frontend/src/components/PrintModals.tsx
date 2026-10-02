import type { SlotLocDTO } from '@obe/shared';
import { BarCode } from './BarCode';
import { Modal } from './Modal';
import { pad2 } from './Tag';

/** 櫃位標籤（1D Code128，比照現場已印出的樣式）。POC v0.4 printLabel() */
export function PrintLabelModal({ slot, levels = 11, onClose }: { slot: SlotLocDTO; levels?: number; onClose: () => void }) {
  return (
    <Modal title={`櫃位標籤 ${slot.code}`} width={560} onClose={onClose} buttons={[{ label: '關閉', onClick: onClose }]}>
      <div className="lblcard">
        <div style={{ textAlign: 'center' }}>
          <BarCode text={slot.code} width={230} height={46} />
          <div className="mono" style={{ fontSize: 17, fontWeight: 800, letterSpacing: 2, marginTop: 5 }}>
            {slot.code}
          </div>
        </div>
        <div>
          <div className="zh">{slot.labelZh}</div>
          <div className="small muted" style={{ marginTop: 6 }}>
            條碼內容（1D Code128）：<b className="mono">{slot.code}</b>
            <br />
            區域 {slot.areaCode}（{slot.areaZh}）／台車 {pad2(slot.rackNo)}／層 {pad2(slot.level)}／機位 {pad2(slot.pos)}
          </div>
        </div>
      </div>
      <div className="msg info" style={{ marginTop: 10 }}>
        <b>系統直接讀現場已印出的條碼</b>掃到 <span className="mono">{slot.code}</span> 就等於「{slot.labelZh}」，不需要另外轉換或重印。
        面對台車由左至右為第 01 → 04 機位，由上而下為第 01 → {pad2(levels)} 層。
      </div>
    </Modal>
  );
}
