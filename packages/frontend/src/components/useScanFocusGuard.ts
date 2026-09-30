import { useEffect, type RefObject } from 'react';

/**
 * 條碼槍焦點守門（POC v0.4 guardFocus）：實體條碼槍等同鍵盤輸入，焦點一旦離開刷取框，
 * 刷出來的字就會掉在別的地方。沒有跳窗時，自動把焦點拉回刷取框；
 * 使用者正在其他輸入框／下拉選單打字時不搶焦點。
 */
export function useScanFocusGuard(ref: RefObject<HTMLInputElement>) {
  useEffect(() => {
    function guard() {
      const box = ref.current;
      if (!box) return;
      if (document.querySelector('.mask')) return; // modal / drawer open
      const a = document.activeElement;
      if (a === box) return;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      box.focus();
    }
    const t = setInterval(guard, 700);
    const onClick = () => setTimeout(guard, 40);
    document.addEventListener('click', onClick);
    return () => {
      clearInterval(t);
      document.removeEventListener('click', onClick);
    };
  }, [ref]);
}
