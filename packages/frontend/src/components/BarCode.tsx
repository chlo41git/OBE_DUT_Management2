import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';

/**
 * Real, scannable 1D barcode (Code 128 by default), rendered into an inline SVG by `jsbarcode`.
 *
 * 2026-09-26 規格變更：櫃位碼／台車碼的標籤一律改用一維條碼（Step 1 刷櫃位＝一維），
 * 機台 S/N 才是二維 QR（由 SL2.0／原廠標籤提供，本系統不產生）。
 * `format` 保留為參數，現場掃描槍若只吃 Code 39 可整站改這一個預設值。
 *
 * `width`：顯示寬度（px，SVG 依比例縮放）；傳 'auto' 則以原生尺寸顯示、不縮放。
 * `moduleWidth`：單一窄條的像素寬。要讓條碼槍「直接掃螢幕」（如刷退條碼）建議 ≥3 且 width='auto'
 * （POC v04-1：螢幕掃描建議 ≥3px，列印可用 2px）。
 */
export function BarCode({
  text,
  width = 200,
  height = 60,
  moduleWidth = 2,
  format = 'CODE128',
  showText = false,
}: {
  text: string;
  width?: number | 'auto';
  height?: number;
  moduleWidth?: number;
  format?: 'CODE128' | 'CODE39';
  showText?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, text, {
      format,
      width: moduleWidth,
      height,
      margin: 10 * (moduleWidth / 2), // 條碼前後的靜音區（約 10 個模組），掃描可靠度需要
      displayValue: showText,
      fontSize: 12,
      background: '#fff',
      lineColor: '#000',
    });
  }, [text, height, moduleWidth, format, showText]);

  return (
    <svg
      ref={ref}
      shapeRendering="crispEdges"
      style={{
        ...(width === 'auto' ? { maxWidth: '100%' } : { width }),
        display: 'block',
        margin: '0 auto',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 4,
      }}
    />
  );
}
