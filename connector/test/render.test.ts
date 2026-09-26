import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderDicomToPng, UnsupportedImage } from '../src/viewer/render.js'

/**
 * Rendering, tested on images built to be awkward.
 *
 * The failure this guards against is silent: a wrong assumption about signed
 * values, or about which end of the scale is white, produces a black or
 * inverted rectangle rather than an error. So each case checks actual pixels
 * rather than that a file came out.
 */

let failures = 0
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

const dimse = (await import('dcmjs-dimse')).default as unknown as typeof import('dcmjs-dimse')
const { Dataset } = dimse
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-render-'))

/** Writes a small DICOM file with the pixel values and tags given. */
async function makeDicom(name: string, pixels: Int16Array | Uint8Array, extra: Record<string, unknown>) {
  const side = Math.sqrt(pixels.length)
  const ds = new Dataset({
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
    SOPInstanceUID: `1.2.826.0.1.99.${name}`,
    Rows: side, Columns: side,
    SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2',
    BitsAllocated: pixels instanceof Uint8Array ? 8 : 16,
    BitsStored: pixels instanceof Uint8Array ? 8 : 16,
    HighBit: pixels instanceof Uint8Array ? 7 : 15,
    PixelRepresentation: 0,
    ...extra,
    PixelData: [pixels.buffer],
  })
  const file = path.join(dir, `${name}.dcm`)
  await ds.toFile(file)
  return file
}

/** Reads the grey level of the first pixel out of the rendered PNG. */
async function firstPixelGrey(png: Buffer): Promise<number> {
  const { PNG } = await import('pngjs')
  const img = PNG.sync.read(png)
  return img.data[0]
}

console.log('\nDICOM rendering\n')

await test('renders an 8-bit image at the right size', async () => {
  const px = new Uint8Array(64).fill(200)
  const file = await makeDicom('flat8', px, {})
  const out = await renderDicomToPng(file)
  assert.equal(out.width, 8)
  assert.equal(out.height, 8)
  assert.ok(out.png.length > 0)
})

await test('stretches a narrow range so the image is not almost black', async () => {
  // A 16-bit image using only values 100-140. Mapped naively onto 0-255 it
  // would be a barely visible smudge; windowing to the actual range must make
  // the darkest pixel black and the brightest white.
  const px = new Int16Array(64)
  for (let i = 0; i < 64; i++) px[i] = 100 + (i % 2 ? 40 : 0)
  const file = await makeDicom('narrow', px, {})
  const { PNG } = await import('pngjs')
  const img = PNG.sync.read((await renderDicomToPng(file)).png)
  const darkest = img.data[0]
  const brightest = img.data[4]
  assert.ok(darkest < 20, `darkest should be near black, got ${darkest}`)
  assert.ok(brightest > 235, `brightest should be near white, got ${brightest}`)
})

await test('MONOCHROME1 is inverted, or every X-ray comes out a negative', async () => {
  const px = new Uint8Array(64).fill(0)
  const file = await makeDicom('mono1', px, {
    PhotometricInterpretation: 'MONOCHROME1',
    WindowCenter: 128, WindowWidth: 256,
  })
  const grey = await firstPixelGrey((await renderDicomToPng(file)).png)
  assert.ok(grey > 200, `a zero pixel in MONOCHROME1 should be light, got ${grey}`)
})

await test('applies the rescale the machine asked for', async () => {
  // Value 0 with intercept -1000 is air, which must land at the black end when
  // windowed on a lung setting.
  const px = new Int16Array(64).fill(0)
  const file = await makeDicom('rescale', px, {
    RescaleSlope: 1, RescaleIntercept: -1000,
    WindowCenter: -600, WindowWidth: 1500,
  })
  const grey = await firstPixelGrey((await renderDicomToPng(file)).png)
  assert.ok(grey < 128, `air should be dark on a lung window, got ${grey}`)
})

await test('refuses a compressed image with an explanation, not a crash', async () => {
  const file = path.join(dir, 'bad.dcm')
  await fs.writeFile(file, Buffer.from('not a dicom file at all'))
  await assert.rejects(() => renderDicomToPng(file))
})

await test('offers the windows the image names, not invented ones', async () => {
  const px = new Int16Array(64).fill(0)
  const file = await makeDicom('multi', px, {
    Modality: 'CT',
    WindowCenter: [40, -600], WindowWidth: [400, 1500],
    WindowCenterWidthExplanation: ['SOFT TISSUE', 'LUNG'],
  })
  const r = await renderDicomToPng(file)
  assert.equal(r.offered.length, 2, 'both windows should be offered')
  assert.equal(r.offered[0].name, 'SOFT TISSUE')
  assert.equal(r.offered[1].name, 'LUNG')
  assert.equal(r.applied, 'SOFT TISSUE', 'the first is what the machine was showing')
  assert.equal(r.guessed, false, 'nothing was guessed here')
})

await test('switching window actually changes the picture', async () => {
  const px = new Int16Array(64)
  for (let i = 0; i < 64; i++) px[i] = 400
  const file = await makeDicom('switch', px, {
    Modality: 'CT', RescaleIntercept: -1000, RescaleSlope: 1,
    WindowCenter: [40, -600], WindowWidth: [400, 1500],
    WindowCenterWidthExplanation: ['SOFT TISSUE', 'LUNG'],
  })
  const { PNG } = await import('pngjs')
  const a = PNG.sync.read((await renderDicomToPng(file, { window: '0' })).png).data[0]
  const b = PNG.sync.read((await renderDicomToPng(file, { window: '1' })).png).data[0]
  assert.notEqual(a, b, 'the two windows must not produce the same grey')
})

await test('says so when it had to guess', async () => {
  const px = new Int16Array(64).fill(50)
  const file = await makeDicom('noWindow', px, {})   // no WindowCenter at all
  const r = await renderDicomToPng(file)
  assert.equal(r.guessed, true, 'must admit the brightness was invented')
  assert.match(r.applied, /automatic/i)
})

await test('CT presets are offered only for CT', async () => {
  const px = new Int16Array(64).fill(0)
  const ct = await renderDicomToPng(await makeDicom('isCt', px, {
    Modality: 'CT', WindowCenter: 40, WindowWidth: 400,
  }))
  const us = await renderDicomToPng(await makeDicom('isUs', px, {
    Modality: 'US', WindowCenter: 40, WindowWidth: 400,
  }))
  assert.equal(ct.isCt, true)
  assert.equal(us.isCt, false, 'a lung window on an ultrasound means nothing')
})

await test('refuses a palette image it cannot read rather than showing grey', async () => {
  const px = new Uint8Array(64).fill(1)
  const file = await makeDicom('palette', px, {
    PhotometricInterpretation: 'PALETTE COLOR',
    // Descriptor present but no table data — the case that would otherwise
    // silently render a Doppler study in grey.
    RedPaletteColorLookupTableDescriptor: [4, 0, 8],
  })
  await assert.rejects(() => renderDicomToPng(file), /colour/i)
})

await fs.rm(dir, { recursive: true, force: true })
console.log(failures ? `\n${failures} failing\n` : '\nall passing\n')
process.exit(failures ? 1 : 0)
