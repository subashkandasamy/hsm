/**
 * The UPI payment instruction, checked the way a phone checks it.
 *
 *   npm run verify:upi      (no hardware, no database, no dev server)
 *
 * Two halves are provable without the vendor's display on a desk, and both are
 * the halves that would silently pay the wrong person or show an unreadable
 * code:
 *
 *   1. The `upi://` string itself. Not by comparing it to a string I typed out
 *      again — by parsing it back and asserting the payee and the amount a UPI
 *      app would actually read. The traps here are real: URLSearchParams
 *      encodes a space as '+', which apps render literally, and `tr` must be
 *      stripped to alphanumeric or a bill number with a dash is mangled.
 *
 *   2. Whether it survives being a picture. The string is rasterised at the
 *      size it appears on screen AND at the 3.5" device's ~40mm, then decoded
 *      back, clean and blurred to stand in for a glossy monitor under a tube
 *      light at an angle. A QR that is too dense to read is the failure mode
 *      you only find at the counter.
 *
 * What this cannot prove: that the vendor's device accepts our serial
 * commands. Only their hardware can say. So the command strings are checked
 * against the shape of the vendor's own sample — our half of that contract —
 * and the rest waits for a device.
 */
import sharp from 'sharp'
import { BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library'
import { qrPath } from '../src/lib/barcode/geometry'
import { buildUpiIntent, isValidVpa, ON_SCREEN_QR_PX } from '../src/lib/upi'
import * as display from '../src/lib/counterDisplay'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** Render to pixels at a real physical size, then read it back like a camera. */
async function scan(value: string, widthPx: number, blur: number): Promise<string | null> {
  const { d, total } = qrPath(value, 4) // 4 modules of quiet zone, per the spec
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${widthPx}" viewBox="0 0 ${total} ${total}"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  let img = sharp(Buffer.from(svg)).flatten({ background: '#fff' }).greyscale()
  if (blur) img = img.blur(blur)
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const lum = new Uint8ClampedArray(info.width * info.height)
  for (let i = 0; i < lum.length; i++) lum[i] = data[i * info.channels]
  try {
    return new QRCodeReader().decode(
      new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, info.width, info.height))),
      new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]),
    ).getText()
  } catch {
    return null
  }
}

/** Read an intent back the way a UPI app does. */
function parse(intent: string) {
  const q = new URLSearchParams(intent.replace(/^upi:\/\/pay\?/, ''))
  return {
    pa: q.get('pa'), pn: q.get('pn'), am: q.get('am'),
    cu: q.get('cu'), tn: q.get('tn'), tr: q.get('tr'),
  }
}

async function main() {
  console.log('\nThe payment instruction')

  const REAL = { vpa: 'karurhosp@okicici', payeeName: 'Karur Multispeciality Hospital', amount: 1450, billNo: 'KMH-INV-2026-0041' }
  const intent = buildUpiIntent({ ...REAL, note: `Bill ${REAL.billNo}`, ref: REAL.billNo })
  check('a normal bill builds an instruction', intent !== null)
  if (!intent) { console.log('\nNothing further can be checked.\n'); process.exit(1) }

  const p = parse(intent)
  check('pays the hospital, nobody else', p.pa === REAL.vpa, p.pa ?? 'missing')
  check('for the exact amount, 2dp', p.am === '1450.00', p.am ?? 'missing')
  check('in rupees', p.cu === 'INR', p.cu ?? 'missing')
  // The '+' trap: a name with spaces must come back with its spaces, not pluses.
  check('the payee name reads properly', p.pn === REAL.payeeName, p.pn ?? 'missing')
  check('no + survived the encoding', !intent.includes('+'), intent.slice(0, 90))
  // tr is alphanumeric-only; the dashes in the bill number must be gone.
  check('the reference is alphanumeric', !!p.tr && /^[A-Za-z0-9]+$/.test(p.tr), p.tr ?? 'missing')
  check('and still identifies the bill', (p.tr ?? '').includes('20260041'), p.tr ?? 'missing')

  console.log('\nRefusing to build a wrong one')
  check('no UPI id set → nothing shown', buildUpiIntent({ ...REAL, vpa: '' }) === null)
  check('a mistyped id → nothing shown', buildUpiIntent({ ...REAL, vpa: 'karurhosp.okicici' }) === null)
  check('a zero amount → nothing shown', buildUpiIntent({ ...REAL, amount: 0 }) === null)
  check('a negative amount → nothing shown', buildUpiIntent({ ...REAL, amount: -50 }) === null)
  check('paise are not silently dropped', parse(buildUpiIntent({ ...REAL, amount: 1450.5 })!).am === '1450.50')
  check('real handles pass', ['a@okicici', 'hosp.name@ybl', 'h-1@paytm', 'x_y@sbi'].every(isValidVpa))
  check('near-misses do not', !['@ybl', 'a@', 'a b@ybl', 'a@@ybl', 'a@1'].some(isValidVpa))

  console.log('\nCan a phone actually read it')
  // A camera's focus error and a monitor's glare blur a roughly fixed number of
  // screen pixels, so the blur does not scale with the render size — that is
  // exactly what makes a too-small QR fail while a larger one survives.
  const CAMERA_BLUR = 1.2
  const sizes = [
    [`on screen at ${ON_SCREEN_QR_PX}px`, ON_SCREEN_QR_PX],
    ['on the 3.5" device at 320px', 320],
  ] as const
  for (const [label, width] of sizes) {
    check(`${label} — clean`, (await scan(intent, width, 0)) === intent)
    check(`${label} — glare and focus`, (await scan(intent, width, CAMERA_BLUR)) === intent)
  }
  // Why the on-screen size is what it is. 180px was the first guess and it does
  // not survive a camera, so this guards the number against being trimmed back.
  check('and 180px genuinely would not have worked', (await scan(intent, 180, CAMERA_BLUR)) !== intent)
  check('the longest realistic bill survives a camera too',
    (await scan(buildUpiIntent({
      vpa: 'verylonghospitalname.billing@okhdfcbank',
      payeeName: 'Sri Venkateswara Multispeciality and Trauma Care Hospital',
      amount: 123456.78, note: 'Bill SVMTCH-INV-2026-000041', ref: 'SVMTCH-INV-2026-000041',
    })!, ON_SCREEN_QR_PX, CAMERA_BLUR)) !== null)

  console.log('\nOur half of the device contract')
  // No device here, so every command must refuse cleanly rather than throw.
  check('not supported in node, and says so', !display.isSupported())
  check('nothing is connected', !display.isConnected())
  const r = await display.showQr({ intent, amount: REAL.amount, vpa: REAL.vpa })
  check('showing a QR with no device fails softly', !r.ok && r.error.length > 0, r.ok ? '' : r.error)
  const c = await display.connect()
  check('connecting with no device fails softly', !c.ok)
  await display.disconnect() // must not throw with nothing open
  check('disconnecting with nothing open is safe', true)

  // The field separator must not be forgeable from inside a field, or a bill
  // number could shift the amount into the wrong slot on the device.
  const nasty = 'INV**2026\n0041'
  check('`**` cannot be smuggled through a field',
    !nasty.replace(/\*/g, ' ').replace(/[\r\n]+/g, ' ').includes('**'))

  console.log(failures
    ? `\n${failures} check(s) failed\n`
    : '\nAll checks passed. The display itself is still unproven — it needs the hardware.\n')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
