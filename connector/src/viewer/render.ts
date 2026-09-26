import { promises as fs } from 'node:fs'
import { PNG } from 'pngjs'

/**
 * Turning a DICOM image into something a browser can show.
 *
 * A DICOM image is not a picture. It is an array of measurements — a CT slice
 * holds signed 16-bit numbers in Hounsfield units, running from about -1000
 * for air to +3000 for bone. A screen shows 256 greys. Choosing which slice of
 * that range becomes those greys is called windowing, and it is why the same
 * scan can be read as "lung" or "bone" without the data changing.
 *
 * PNG rather than JPEG deliberately: it is lossless, and JPEG ringing around
 * the sharp edges of a chest X-ray looks exactly like something a radiologist
 * would want to ask about.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * Not a diagnostic viewer. There is no measuring, no comparison, no adjusting
 * the window by dragging. A radiologist reading a CT properly will use the
 * scanner console or their teleradiology platform whatever we build. This is
 * for the referring doctor, the casualty officer at two in the morning, and
 * eventually the patient — the people who otherwise get sent a CD.
 */

export interface RenderedImage {
  png: Buffer
  width: number
  height: number
}

/** A DICOM element, as dcmjs hands it over. */
type Dict = Record<string, unknown>

const num = (v: unknown, fallback: number): number => {
  if (Array.isArray(v)) v = v[0]
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Transfer syntaxes whose pixels are stored plainly. Anything else is
 * compressed — JPEG 2000, JPEG-LS, RLE — and needs a decoder we do not carry.
 */
const UNCOMPRESSED = new Set([
  '1.2.840.10008.1.2',      // Implicit VR Little Endian
  '1.2.840.10008.1.2.1',    // Explicit VR Little Endian
  '1.2.840.10008.1.2.1.99', // Deflated Explicit VR Little Endian
  '1.2.840.10008.1.2.2',    // Explicit VR Big Endian
])

export class UnsupportedImage extends Error {}

export async function renderDicomToPng(file: string): Promise<RenderedImage> {
  // Loaded here rather than at module scope: dcmjs is large, and a connector
  // with no scanners should never pay for it.
  const { data } = await import('dcmjs')
  const { DicomMessage, DicomMetaDictionary } = data

  const buf = await fs.readFile(file)
  const dicom = DicomMessage.readFile(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  )
  const meta = dicom.meta as Dict
  const ds = DicomMetaDictionary.naturalizeDataset(dicom.dict) as Dict

  const syntax = String((meta.TransferSyntaxUID as { Value?: string[] })?.Value?.[0] ?? '')
  if (syntax && !UNCOMPRESSED.has(syntax)) {
    throw new UnsupportedImage(
      'This image is stored compressed, which this preview cannot open yet. '
      + 'The image itself is safe and can be opened on the scanner or in any DICOM viewer.',
    )
  }

  const width = num(ds.Columns, 0)
  const height = num(ds.Rows, 0)
  if (!width || !height) throw new UnsupportedImage('The image has no size recorded.')

  const bits = num(ds.BitsAllocated, 16)
  const signed = num(ds.PixelRepresentation, 0) === 1
  const samples = num(ds.SamplesPerPixel, 1)
  const photometric = String(ds.PhotometricInterpretation ?? 'MONOCHROME2')
  const slope = num(ds.RescaleSlope, 1)
  const intercept = num(ds.RescaleIntercept, 0)

  const raw = ds.PixelData as ArrayBuffer[] | undefined
  if (!raw?.[0]) throw new UnsupportedImage('The image carries no pixel data.')
  const pixels = raw[0]

  // Read the measurements out at whatever width they were stored.
  const count = width * height * samples
  let values: Float64Array
  if (bits === 8) {
    const src = signed ? new Int8Array(pixels) : new Uint8Array(pixels)
    values = Float64Array.from(src.subarray(0, count))
  } else {
    const src = signed ? new Int16Array(pixels) : new Uint16Array(pixels)
    values = Float64Array.from(src.subarray(0, count))
  }

  // Hounsfield units, or whatever the machine's own scale is.
  if (slope !== 1 || intercept !== 0) {
    for (let i = 0; i < values.length; i++) values[i] = values[i] * slope + intercept
  }

  // ── Choose the window ────────────────────────────────────────────────────
  //
  // The machine usually says which one it was displaying. When it does not —
  // and ultrasound often does not — the actual range of the image is a better
  // guess than any fixed default, which would show a black or white rectangle.
  let centre = num(ds.WindowCenter, NaN)
  let widthW = num(ds.WindowWidth, NaN)
  if (!Number.isFinite(centre) || !Number.isFinite(widthW) || widthW <= 0) {
    let lo = Infinity, hi = -Infinity
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v }
    if (!Number.isFinite(lo) || hi <= lo) { lo = 0; hi = 255 }
    centre = (hi + lo) / 2
    widthW = Math.max(hi - lo, 1)
  }

  const low = centre - 0.5 - (widthW - 1) / 2
  const scale = 255 / (widthW - 1 || 1)
  // MONOCHROME1 counts the other way: its lowest value is white.
  const invert = photometric === 'MONOCHROME1'

  const png = new PNG({ width, height, colorType: 6 })
  const rgba = png.data

  for (let i = 0; i < width * height; i++) {
    let grey: number
    if (samples >= 3) {
      // Already a colour image — ultrasound Doppler, for one.
      const o = i * samples
      rgba[i * 4] = values[o]
      rgba[i * 4 + 1] = values[o + 1]
      rgba[i * 4 + 2] = values[o + 2]
      rgba[i * 4 + 3] = 255
      continue
    }
    const v = (values[i] - low) * scale
    grey = v < 0 ? 0 : v > 255 ? 255 : v
    if (invert) grey = 255 - grey
    rgba[i * 4] = grey
    rgba[i * 4 + 1] = grey
    rgba[i * 4 + 2] = grey
    rgba[i * 4 + 3] = 255
  }

  return { png: PNG.sync.write(png), width, height }
}
