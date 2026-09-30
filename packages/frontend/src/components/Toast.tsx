import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
  kind?: 'ok' | 'err' | '';
}

interface ToastCtx {
  toast: (text: string, kind?: 'ok' | 'err' | '') => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx).toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: 'ok' | 'err' | '' = '') => {
    const id = ++seq.current;
    setItems((cur) => [...cur, { id, text, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 3200);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast">
        {items.map((i) => (
          <div key={i.id} className={i.kind || ''}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
