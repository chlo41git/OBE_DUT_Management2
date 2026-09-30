import { useState } from 'react';
import type { SlotDTO } from '@obe/shared';
import { api, ApiError } from '../api/client';
import { Modal } from './Modal';
import { useToast } from './Toast';

export const SLOT_FORMAT_HINT = 'FIN-04-01-04（區域-台車-層-機位）';

/** 標籤破損 — 手動輸入儲位（入庫／出庫共用）。POC v0.4 manualSlot() */
export function ManualSlotModal({ mode, onClose, onDone }: { mode: 'in' | 'out'; onClose: () => void; onDone: (slot: SlotDTO) => void }) {
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const toast = useToast();

  async function submit() {
    if (!code.trim()) return toast('查無此櫃位條碼', 'err');
    if (!reason.trim()) return toast('請填理由', 'err');
    try {
      const s = await api.manualSlot({ mode, code, reason });
      onDone(s);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '發生錯誤', 'err');
    }
  }

  return (
    <Modal
      title="標籤破損 — 手動輸入儲位"
      onClose={onClose}
      buttons={[
        { label: '取消', onClick: onClose },
        { label: '確認', className: 'btn pri', onClick: submit },
      ]}
    >
      <div className="msg warn">
        <b>此入口會留下稽核紀錄</b>手動輸入等於少了一次實體確認，必須填理由；該櫃位會記為「標籤待補印」。
      </div>
      <label className="f">櫃位條碼（{SLOT_FORMAT_HINT}）</label>
      <input type="text" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="FIN-04-01-04" />
      <label className="f" style={{ marginTop: 10 }}>
        理由（必填）
      </label>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="例：標籤磨損掃不到／被機台壓住"
      />
    </Modal>
  );
}
