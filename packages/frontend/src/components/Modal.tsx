import type { ReactNode } from 'react';

export interface ModalButton {
  label: string;
  className?: string;
  onClick: () => void;
}

export function Modal({
  title,
  children,
  buttons,
  onClose,
}: {
  title: string;
  children: ReactNode;
  buttons: ModalButton[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="modal">
        <div className="mh">{title}</div>
        <div className="mb">{children}</div>
        <div className="mf">
          {buttons.map((b, i) => (
            <button key={i} className={b.className || 'btn'} onClick={b.onClick}>
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
