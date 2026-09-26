import { promises as fs } from 'node:fs'
import { PNG } from 'pngjs'

/**
 * Turning a DICOM image into something a browser can show.
 *
 * ── There is no "unchanged" picture ────────────────────────────────────────
 *
 * A DICOM image is not a picture. A CT slice holds about four thousand
 * distinct values — Hounsfield units, roughly -1000 for air to +3000 for bone
 * — and a screen shows 256 greys. Something must map one onto the other, and
 * the scanner's own console does exactly the same thing: what the radiographer
 * looked at was already windowed.
 *
 * So the goal is not to leave the image alone, which is impossible. It is to
 * apply the same window the machine applied, and to say plainly when we could
 * not — because a wrong window does not look broken, it looks like a different
 * finding.
 *
 * In order of preference:
 *   1. a window the viewer asked for, from the image's own list or a preset
 *   2. the window the image states it was displayed with
 *   3. a VOI lookup table, if the image carries one instead
 *   4. the actual range of the data, which is a guess and is declared as one
 *
 * PNG rather than JPEG deliberately: it is lossless, and JPEG ringing around
 * the sharp edges of a chest X-ray looks exactly like something a radiologist
 * would want to ask about.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * Not a diagnostic display. A radiologist reading a CT properly uses the
 * scanner console or their teleradiology platform whatever we build. This is
 * for the referring doctor, the casualty officer at two in the morning, and
 * eventually the patient — the people who otherwise get handed a CD.
 */

export interface WindowChoice {
  /** 'As scanned', 'Lung', or whatever the image called it. */
  name: string
  centre: number
  width: number
}

export interface RenderedImage {
  png: Buffer
  width: number
  height: number
  /** What was applied, so the page can say so beside the image. */
  applied: string
  /** True when nothing in the image said how it should be displayed. */
  guessed: boolean
  /** Windows the image itself offers, for the viewer to switch between. */
  offered: WindowChoice[]
  /** Whether presets in Hounsfield units mean anything for this image. */
  isCt: boolean
  colour: boolean
}

export interface RenderOptions {
  /** Index into the image's own windows, or a preset key. */
  window?: string
}

/**
 * The windows a radiologist actually names, in Hounsfield units. Offered only
 * for CT: a "lung window" on an ultrasound is meaningless, and showing it
 * would invite somebody to trust a number that means nothing there.
 */
const CT_PRESETS: Record<string, WindowChoice> = {
  lung:  { name: 'Lung',        centre: -600, width: 1500 },
  soft:  { name: 'Soft tissue', centre: 40,   width: 400 },
  bone:  { name: 'Bone',        centre: 300,  width: 1500 },
  brain: { name: 'Brain',       centre: 40,   width: 80 },
}

type Dict = Record<string, unknown>

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])

const num = (v: unknown, fallback: number): number => {
  if (Array.isArray(v)) v = v[0]
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Transfer syntaxes whose pixels are stored plainly. */
const UNCOMPRESSED = new Set([
  '1.2.840.10008.1.2',
  '1.2.840.10008.1.2.1',
  '1.2.840.10008.1.2.1.99',
  '1.2.840.10008.1.2.2',
])

export class UnsupportedImage extends Error {}

/** The windows an image declares, with the names it gives them. */
function offeredWindows(ds: Dict): WindowChoice[] {
  const centres = asArray(ds.WindowCenter).map((v) => num(v, NaN)).filter(Number.isFinite)
  const widths = asArray(ds.WindowWidth).map((v) => num(v, NaN)).filter(Number.isFinite)
  const names = asArray(ds.WindowCenterWidthExplanation).map(String)

  return centres.map((centre, i) => ({
    centre,
    width: widths[i] ?? widths[0] ?? 1,
    // The machine usually labels them. When it does not, the first is the one
    // it was displaying, so calling that "as scanned" is truthful.
    name: names[i]?.trim() || (i === 0 ? 'As scanned' : `Window ${i + 1}`),
  })).filter((w) => w.width > 0)
}

/** Colour tables, for images that index into a palette rather than being grey. */
function palette(ds: Dict): { r: Uint8Array; g: Uint8Array; b: Uint8Array; first: number } | null {
  const descr = asArray(ds.RedPaletteColorLookupTableDescriptor).map((v) => num(v, 0))
  if (descr.length < 3) return null

  const bits = descr[2] || 8
  const read = (raw: unknown): Uint8Array | null => {
    const buf = asArray(raw)[0]
    if (!(buf instanceof ArrayBuffer)) return null
    if (bits === 16) {
      // A 16-bit table carries the useful byte in the high half.
      const src = new Uint16Array(buf)
      const outArr = new Uint8Array(src.length)
      for (let i = 0; i < src.length; i++) outArr[i] = src[i] >> 8
      return outArr
    }
    return new Uint8Array(buf)
  }

  const r = read(ds.RedPaletteColorLookupTableData)
  const g = read(ds.GreenPaletteColorLookupTableData)
  const b = read(ds.BluePaletteColorLookupTableData)
  if (!r || !g || !b) return null
  // The descriptor's second value is the pixel value the table starts at.
  return { r, g, b, first: descr[1] }
}

/** A lookup table some images carry instead of a centre and width. */
function voiLut(ds: Dict): { table: Uint16Array; first: number; bits: number } | null {
  const seq = asArray(ds.VOILUTSequence)[0] as Dict | undefined
  if (!seq) return null
  const descr = asArray(seq.LUTDescriptor).map((v) => num(v, 0))
  const raw = asArray(seq.LUTData)[0]
  if (descr.length < 3 || !(raw instanceof ArrayBuffer)) return null
  return {
    table: descr[2] > 8 ? new Uint16Array(raw) : Uint16Array.from(new Uint8Array(raw)),
    first: descr[1],
    bits: descr[2] || 16,
  }
}

export async function renderDicomToPng(
  file: string, opts: RenderOptions = {},
): Promise<RenderedImage> {
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
  const photometric = String(ds.PhotometricInterpretation ?? 'MONOCHROME2').trim().toUpperCase()
  const slope = num(ds.RescaleSlope, 1)
  const intercept = num(ds.RescaleIntercept, 0)
  const isCt = String(ds.Modality ?? '').toUpperCase() === 'CT'

  const rawPixels = asArray(ds.PixelData)[0]
  if (!(rawPixels instanceof ArrayBuffer)) {
    throw new UnsupportedImage('The image carries no pixel data.')
  }

  const stored = bits === 8
    ? (signed ? new Int8Array(rawPixels) : new Uint8Array(rawPixels))
    : (signed ? new Int16Array(rawPixels) : new Uint16Array(rawPixels))

  const png = new PNG({ width, height, colorType: 6 })
  const out = png.data
  const offered = offeredWindows(ds)

  // ── Colour, in the two ways DICOM does it ────────────────────────────────

  if (samples >= 3) {
    for (let i = 0; i < width * height; i++) {
      const o = i * samples
      out[i * 4] = stored[o]
      out[i * 4 + 1] = stored[o + 1]
      out[i * 4 + 2] = stored[o + 2]
      out[i * 4 + 3] = 255
    }
    return { png: PNG.sync.write(png), width, height, applied: 'Colour, as scanned',
             guessed: false, offered, isCt, colour: true }
  }

  if (photometric === 'PALETTE COLOR') {
    const p = palette(ds)
    if (!p) {
      // Rendering an indexed image as grey would silently drop the colour that
      // carries the meaning — Doppler flow, for one — and the result would look
      // like a perfectly good picture. Better to refuse than to mislead.
      throw new UnsupportedImage(
        'This image uses a colour table this preview cannot read. Showing it in grey '
        + 'would lose the colour, which may be the finding — open it on the scanner.',
      )
    }
    for (let i = 0; i < width * height; i++) {
      const idx = Math.max(0, Math.min(p.r.length - 1, stored[i] - p.first))
      out[i * 4] = p.r[idx]
      out[i * 4 + 1] = p.g[idx]
      out[i * 4 + 2] = p.b[idx]
      out[i * 4 + 3] = 255
    }
    return { png: PNG.sync.write(png), width, height, applied: 'Colour, as scanned',
             guessed: false, offered, isCt, colour: true }
  }

  // ── Greyscale ────────────────────────────────────────────────────────────

  const values = new Float64Array(width * height)
  for (let i = 0; i < values.length; i++) values[i] = stored[i]
  if (slope !== 1 || intercept !== 0) {
    for (let i = 0; i < values.length; i++) values[i] = values[i] * slope + intercept
  }

  const invert = photometric === 'MONOCHROME1'
  const write = (i: number, grey: number) => {
    const g = invert ? 255 - grey : grey
    out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = 255
  }

  // A lookup table, when the image carries one and nothing else was asked for.
  const lut = opts.window ? null : voiLut(ds)
  if (lut) {
    const max = (1 << lut.bits) - 1
    for (let i = 0; i < values.length; i++) {
      const idx = Math.max(0, Math.min(lut.table.length - 1, Math.round(values[i]) - lut.first))
      write(i, Math.round((lut.table[idx] / max) * 255))
    }
    return { png: PNG.sync.write(png), width, height,
             applied: 'As scanned (lookup table)', guessed: false, offered, isCt, colour: false }
  }

  // Which window: asked for, declared, or guessed — in that order.
  let chosen: WindowChoice | null = null
  let guessed = false

  if (opts.window) {
    const preset = isCt ? CT_PRESETS[opts.window] : undefined
    const byIndex = offered[Number.parseInt(opts.window, 10)]
    chosen = preset ?? byIndex ?? null
  }
  if (!chosen) chosen = offered[0] ?? null
  if (!chosen) {
    let lo = Infinity, hi = -Infinity
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v }
    if (!Number.isFinite(lo) || hi <= lo) { lo = 0; hi = 255 }
    chosen = {
      name: 'Brightness chosen automatically',
      centre: (hi + lo) / 2,
      width: Math.max(hi - lo, 1),
    }
    guessed = true
  }

  const low = chosen.centre - 0.5 - (chosen.width - 1) / 2
  const scale = 255 / (chosen.width - 1 || 1)
  for (let i = 0; i < values.length; i++) {
    const v = (values[i] - low) * scale
    write(i, v < 0 ? 0 : v > 255 ? 255 : v)
  }

  return {
    png: PNG.sync.write(png), width, height,
    applied: chosen.name, guessed, offered, isCt, colour: false,
  }
}

/** The presets worth offering for an image, given what it is. */
export function presetsFor(isCt: boolean): Array<{ key: string; name: string }> {
  if (!isCt) return []
  return Object.entries(CT_PRESETS).map(([key, w]) => ({ key, name: w.name }))
}
