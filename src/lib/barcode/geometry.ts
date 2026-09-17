// Barcode geometry shared by the label PDFs and their print tests.
// Pure data (no rendering) so what is tested is exactly what is printed.

import { CODE128 } from 'jsbarcode/bin/barcodes/CODE128'
import QRCode from 'qrcode'

/** Label printers in Indian clinics are mostly 203 dpi (8 dots/mm). */
export const DOT_MM = 25.4 / 203

/**
 * Code 128 narrow-bar width: exactly 3 printer dots at 203 dpi (0.375 mm).
 * Whole-dot widths keep bars sharp on thermal heads; 0.375 mm reads reliably on
 * tube curvature and with lab analyzer and handheld scanners.
 */
export const CODE128_X_MM = 3 * DOT_MM

/** Minimum clear space either side of a Code 128 symbol: 10 × the narrow bar. */
export const CODE128_QUIET_MODULES = 10

export interface Bar { x: number; w: number }

/** Code 128 (auto code-set) as black bar runs in module units. */
export function code128Bars(value: string): { bars: Bar[]; modules: number } {
  const enc = new CODE128(value, {})
  if (!enc.valid()) throw new Error(`Cannot encode "${value}" as Code 128`)
  const bits = enc.encode().data
  const bars: Bar[] = []
  for (let i = 0; i < bits.length; ) {
    if (bits[i] !== '1') { i++; continue }
    let j = i
    while (j < bits.length && bits[j] === '1') j++
    bars.push({ x: i, w: j - i })
    i = j
  }
  return { bars, modules: bits.length }
}

/** QR matrix (error correction M — survives creases and wear on a band/card). */
export function qrMatrix(value: string): { size: number; dark: (x: number, y: number) => boolean } {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const { size, data } = qr.modules
  return { size, dark: (x, y) => data[y * size + x] === 1 }
}

/** QR as one SVG path in module units (quiet zone of `margin` modules included in `total`). */
export function qrPath(value: string, margin: number): { d: string; total: number } {
  const { size, dark } = qrMatrix(value)
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; ) {
      if (!dark(x, y)) { x++; continue }
      let e = x
      while (e < size && dark(e, y)) e++
      d += `M${x + margin} ${y + margin}h${e - x}v1h${x - e}z`
      x = e
    }
  }
  return { d, total: size + margin * 2 }
}

/** Tube barcode value: accession number + 2-digit tube number (all digits, so Code 128 set C). */
export const tubeCode = (accessionNo: string, tube: number) => `${accessionNo}${String(tube).padStart(2, '0')}`
