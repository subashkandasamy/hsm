// Printability check for label barcodes: rasterises the exact bar/module geometry
// the label PDFs use at 203 dpi (typical thermal label printer), clean and blurred
// (worn/low-contrast print), and decodes it. Exits 1 on any failure.
//   npm run verify:barcodes   (203 and 300 dpi)
import sharp from 'sharp'
import { BarcodeFormat, BinaryBitmap, Code128Reader, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library'
import { CODE128_QUIET_MODULES, CODE128_X_MM, DOT_MM, code128Bars, qrPath, tubeCode } from '../src/lib/barcode/geometry'

// 203 dpi by default; also run with PRINTER_DPI=300 for 300 dpi label printers.
const DPI = Number(process.env.PRINTER_DPI ?? 203)
/** mm → printer pixels at 203 dpi (sharp's `density` option double-scales mm-sized SVGs, so size in px). */
const px = (vMm: number) => Math.round((vMm / 25.4) * DPI)
const LABEL_W_MM = 50 - 2 * 1.4 // tube label width minus side padding (SampleLabelsPdf)
let failed = 0

async function decode(svg: string, blur: number, format: BarcodeFormat): Promise<string | null> {
  // SVGs are sized in printer pixels (see px()); threshold to pure black/white like a
  // thermal head (each dot is on or off), then blur to simulate ink spread / wear.
  let img = sharp(Buffer.from(svg)).flatten({ background: '#fff' }).greyscale().threshold(128)
  if (blur) img = img.blur(blur)
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const lum = new Uint8ClampedArray(info.width * info.height)
  for (let i = 0; i < lum.length; i++) lum[i] = data[i * info.channels]
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, info.width, info.height)))
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]])
  try {
    return (format === BarcodeFormat.QR_CODE ? new QRCodeReader() : new Code128Reader()).decode(bitmap, hints).getText()
  } catch {
    return null
  }
}

function code128Svg(value: string, xMm: number, hMm: number) {
  const { bars, modules } = code128Bars(value)
  const W = (modules + CODE128_QUIET_MODULES * 2) * xMm, H = hMm + 4
  const rects = bars.map((b) => `<rect x="${(b.x + CODE128_QUIET_MODULES) * xMm}" y="2" width="${b.w * xMm}" height="${hMm}"/>`).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${rects}</g></svg>`, widthMm: W }
}

function qrSvg(value: string, sizeMm: number, margin: number) {
  const { d, total } = qrPath(value, margin)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px(sizeMm + 6 * sizeMm / total)}" height="${px(sizeMm + 6 * sizeMm / total)}" viewBox="-3 -3 ${total + 6} ${total + 6}"><rect x="-3" y="-3" width="${total + 6}" height="${total + 6}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}

function report(ok: boolean, line: string) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`)
}

async function main() {
  // Tube labels: normal accession (3-dot bars) and the 10,000+/day fallback (2-dot bars)
  for (const [acc, xDots] of [['2609170001', 3], ['2609179999', 3], ['26091710000', 2]] as const) {
    for (const tube of [1, 12]) {
      const v = tubeCode(acc, tube)
      const xMm = xDots === 3 ? CODE128_X_MM : 2 * DOT_MM
      const { svg, widthMm } = code128Svg(v, xMm, 8)
      const clean = await decode(svg, 0, BarcodeFormat.CODE_128)
      const worn = await decode(svg, xDots === 3 ? 0.9 : 0.6, BarcodeFormat.CODE_128)
      report(clean === v && worn === v && widthMm <= LABEL_W_MM,
        `tube Code 128 ${v}: ${xDots} dots, ${widthMm.toFixed(1)} of ${LABEL_W_MM.toFixed(1)} mm, clean ${clean === v ? 'ok' : 'no read'}, worn ${worn === v ? 'ok' : 'no read'}`)
    }
  }
  // Wristband (19 mm, 2-module quiet zone) and ID card (21 mm, 3 modules) QR codes
  for (const [label, v, size, margin] of [
    ['wristband', 'UH-2026-00003', 19, 2], ['wristband, long UHID', 'KMCH-UH-2026-104587', 19, 2], ['ID card', 'UH-2026-00003', 21, 3],
  ] as const) {
    const n = qrPath(v, margin).total
    const dots = size / n / DOT_MM
    const clean = await decode(qrSvg(v, size, margin), 0, BarcodeFormat.QR_CODE)
    const worn = await decode(qrSvg(v, size, margin), 1.2, BarcodeFormat.QR_CODE)
    report(clean === v && worn === v && dots >= 4, `${label} QR ${v}: module ${(size / n).toFixed(2)} mm (${dots.toFixed(1)} dots), clean ${clean === v ? 'ok' : 'no read'}, worn ${worn === v ? 'ok' : 'no read'}`)
  }
  console.log(failed ? `\n${failed} check(s) failed at ${DPI} dpi` : `\nAll label barcodes decode at ${DPI} dpi`)
  process.exit(failed ? 1 : 0)
}
main()
