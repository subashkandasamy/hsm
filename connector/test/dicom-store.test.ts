import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startDicom, type ReceivedStudy } from '../src/dicom/server.js'
import type { Config } from '../src/config.js'

/**
 * Images arriving from a scanner.
 *
 * The other half of radiology, and the half with the patient's study in it.
 * The worklist is what gets the identifiers onto the image; this is what
 * catches the image once the machine has taken it.
 *
 * What matters here is not that bytes move — dcmjs-dimse does that — but that
 * a study arrives as ONE study. A scanner sends each image as its own
 * association, in any order, sometimes across several series, and if the
 * connector counts those as separate studies the hospital gets forty entries
 * for one chest X-ray and nothing matches the order.
 */

const PORT = 11198
let failures = 0
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

const STUDY = '1.2.826.0.1.3680043.8.498.100000000000000000000000000001'
const SERIES_A = `${STUDY}.1`
const SERIES_B = `${STUDY}.2`
const ACCESSION = 'RAD-2610-0042'

async function main(): Promise<void> {
  // Somewhere temporary, so a test never writes into a real connector's store.
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-dicom-'))
  process.env.UYIRLY_DATA_DIR = dataDir

  console.log('\nDICOM images')

  const completed: ReceivedStudy[] = []
  const server = await startDicom(
    { dicomPort: PORT, dicomAeTitle: 'UYIRLY' } as unknown as Config,
    { getWorklist: async () => [], onStudyComplete: (s) => completed.push(s) },
  )

  const dimse = ((await import('dcmjs-dimse')) as unknown as {
    default: typeof import('dcmjs-dimse')
  }).default
  const { Client, Dataset, requests, constants } = dimse
  const { CStoreRequest } = requests
  const { StorageClass, Status } = constants

  /** One image, the way a digital X-ray sends it. */
  async function sendImage(seriesUid: string, instance: number, seriesNumber: number) {
    const ds = new Dataset({
      SOPClassUID: StorageClass.DigitalXRayImageStorageForPresentation,
      SOPInstanceUID: `${seriesUid}.${instance}`,
      StudyInstanceUID: STUDY,
      SeriesInstanceUID: seriesUid,
      SeriesNumber: seriesNumber,
      InstanceNumber: instance,
      Modality: 'DX',
      AccessionNumber: ACCESSION,
      PatientID: 'DEMO-UH-2026-00007',
      PatientName: 'Kumar^Ravi',
      PatientSex: 'M',
      StudyDate: '20261024',
      StudyDescription: 'Chest PA',
      SeriesDescription: seriesNumber === 1 ? 'PA view' : 'Lateral view',
      Manufacturer: 'Adonis Medical',
      ManufacturerModelName: 'ECORAD-PS',
      StationName: 'XRAY-1',
      Rows: 4, Columns: 4, BitsAllocated: 8, BitsStored: 8, HighBit: 7,
      SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2',
      PixelRepresentation: 0,
      PixelData: [new Uint8Array(16).fill(instance * 10).buffer],
    })

    const req = new CStoreRequest(ds)
    let status: number | undefined
    req.on('response', (r: { getStatus: () => number }) => { status = r.getStatus() })

    const client = new Client()
    client.addRequest(req)
    await new Promise<void>((resolve, reject) => {
      client.on('closed', () => resolve())
      client.on('networkError', (e: Error) => reject(e))
      client.send('127.0.0.1', PORT, 'XRAY-1', 'UYIRLY')
    })
    return status
  }

  await test('accepts an image and says so', async () => {
    const status = await sendImage(SERIES_A, 1, 1)
    assert.equal(status, Status.Success, 'a refusal makes the scanner report a failure in the room')
  })

  await test('writes it to disk, under its study and series', async () => {
    const file = path.join(dataDir, 'dicom', STUDY, SERIES_A, `${SERIES_A}.1.dcm`)
    const { size } = await fs.stat(file)
    assert.ok(size > 0, 'the file must have something in it')
  })

  await test('several images across two series stay ONE study', async () => {
    // Each arrives on its own association, which is how a scanner sends them.
    await sendImage(SERIES_A, 2, 1)
    await sendImage(SERIES_B, 1, 2)
    await sendImage(SERIES_B, 2, 2)

    const studyDirs = await fs.readdir(path.join(dataDir, 'dicom'))
    assert.deepEqual(studyDirs, [STUDY], 'one folder, not one per image')
    const seriesDirs = (await fs.readdir(path.join(dataDir, 'dicom', STUDY))).sort()
    assert.deepEqual(seriesDirs, [SERIES_A, SERIES_B].sort())
  })

  await test('reports the study once it is complete, with what it holds', async () => {
    // close() flushes anything still open rather than waiting out the idle
    // timer, which is also what happens when the connector is stopped.
    server.close()
    await new Promise((r) => setTimeout(r, 200))

    assert.equal(completed.length, 1, `expected one completed study, got ${completed.length}`)
    const s = completed[0]
    assert.equal(s.studyInstanceUid, STUDY)
    assert.equal(s.accessionNumber, ACCESSION, 'the accession is how the study finds its order')
    assert.equal(s.instanceCount, 4, 'all four images counted')
    assert.equal(s.series.length, 2, 'both series described')
    assert.equal(s.modality, 'DX')
    assert.equal(s.patientIdRaw, 'DEMO-UH-2026-00007')
    assert.equal(s.aeTitle, 'XRAY-1', 'which machine sent it')
    assert.equal(s.model, 'ECORAD-PS')
    assert.ok(s.sizeBytes > 0, 'and how much disk it is using')

    const bySeries = [...s.series].sort((a, b) => (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0))
    assert.equal(bySeries[0].instanceCount, 2)
    assert.equal(bySeries[1].instanceCount, 2)
    assert.equal(bySeries[0].description, 'PA view')
  })

  await fs.rm(dataDir, { recursive: true, force: true })
  console.log(failures === 0 ? '\nAll DICOM image checks passed.\n' : `\n${failures} FAILED\n`)
  process.exit(failures ? 1 : 0)
}

main()
