import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';

/**
 * Real, scannable 1D barcode (Code 128 by default), rendered into an inline SVG by `jsbarcode`.
 *
 * 2026-09-26 規格變更：櫃位碼／台車碼的標籤一律改用一維條碼（Step 1 刷櫃位＝一維），
 * 機台 S/N 才是二維 QR（由 SL2.0／原廠標籤提供，本系統不產生）。
 * `format` 保留為參數，現場掃描槍若只吃 Code 39 可整站改這一個預設值。
 */
export function BarCode({
  text,
  width = 200,
  height = 60,
  format = 'CODE128',
  showText = false,
}: {
  text: string;
  width?: number;
  height?: number;
  format?: 'CODE128' | 'CODE39';
  showText?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, text, {
      format,
      width: 2, // 單一窄條的像素寬
      height,
      margin: 10, // 條碼前後的靜音區，掃描可靠度需要
      displayValue: showText,
      fontSize: 12,
      background: '#fff',
      lineColor: '#000',
    });
  }, [text, height, format, showText]);

  return (
    <svg
      ref={ref}
      style={{ width, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4 }}
    />
  );
}
