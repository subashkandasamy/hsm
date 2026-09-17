// Vector barcodes for react-pdf documents. Geometry comes from lib/barcode/geometry.
import { Path, Rect, Svg } from '@react-pdf/renderer'
import { CODE128_QUIET_MODULES, CODE128_X_MM, code128Bars, qrPath } from '@/lib/barcode/geometry'

export const mm = (v: number) => (v * 72) / 25.4

/**
 * Font size (pt) that fits `text` on one line in `widthMm` — long names shrink
 * before they get cut off, since the name is an identifier. Uses an average
 * bold-uppercase glyph width of 0.66 em; the caller still sets an ellipsis.
 */
export function fitFontPt(text: string, widthMm: number, maxPt: number, minPt: number): number {
  const pt = mm(widthMm) / (Math.max(text.length, 1) * 0.66)
  return Math.max(minPt, Math.min(maxPt, Math.floor(pt * 4) / 4))
}

/** Width in mm a Code 128 symbol needs, quiet zones included — for layout checks. */
export function code128WidthMm(value: string, xMm = CODE128_X_MM): number {
  return (code128Bars(value).modules + CODE128_QUIET_MODULES * 2) * xMm
}

/** Code 128 at a fixed narrow-bar width (never scaled, so bars stay whole printer dots). Quiet zones included. */
export function Code128({ value, heightMm, xMm = CODE128_X_MM }: { value: string; heightMm: number; xMm?: number }) {
  const { bars, modules } = code128Bars(value)
  const total = modules + CODE128_QUIET_MODULES * 2
  const x = mm(xMm)
  return (
    <Svg width={total * x} height={mm(heightMm)} viewBox={`0 0 ${total * x} ${mm(heightMm)}`}>
      {bars.map((b, i) => (
        <Rect key={i} x={(b.x + CODE128_QUIET_MODULES) * x} y={0} width={b.w * x} height={mm(heightMm)} fill="#000000" />
      ))}
    </Svg>
  )
}

/** QR code `sizeMm` square, including a `margin`-module quiet zone. */
export function QrCode({ value, sizeMm, margin = 2 }: { value: string; sizeMm: number; margin?: number }) {
  const { d, total } = qrPath(value, margin)
  return (
    <Svg width={mm(sizeMm)} height={mm(sizeMm)} viewBox={`0 0 ${total} ${total}`}>
      <Path d={d} fill="#000000" />
    </Svg>
  )
}
