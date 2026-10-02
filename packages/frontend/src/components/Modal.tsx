import type { ReactNode } from 'react';

export interface ModalButton {
  label: string;
  className?: string;
  onClick: () => void;
  /** 送出中等情況暫停點擊（防重複送出） */
  disabled?: boolean;
}

export function Modal({
  title,
  children,
  buttons,
  onClose,
  width,
}: {
  title: string;
  children: ReactNode;
  buttons: ModalButton[];
  onClose: () => void;
  /** 預設 520px（.modal）；內容較寬的對話框（如櫃位標籤）可加寬，max-width 94vw 仍有效 */
  width?: number;
}) {
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="modal" style={width ? { width } : undefined}>
        <div className="mh">{title}</div>
        <div className="mb">{children}</div>
        <div className="mf">
          {buttons.map((b, i) => (
            <button key={i} className={b.className || 'btn'} onClick={b.onClick} disabled={b.disabled}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="drawer">
        <div className="dh">
          <h4>{title}</h4>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            關閉
          </button>
        </div>
        <div className="db">{children}</div>
      </div>
    </>
  );
}
