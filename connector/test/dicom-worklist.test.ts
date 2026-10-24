import assert from 'node:assert/strict'
import { startDicom, type WorklistItem } from '../src/dicom/server.js'
import type { Config } from '../src/config.js'

/**
 * The worklist, answered the way an X-ray console asks for it.
 *
 * This is the half of radiology integration that has nothing to do with
 * images and all of the value: without it a technologist types the patient's
 * name and hospital number into the machine by hand, and a typo files the
 * study against the wrong patient. With it they pick a line off a list.
 *
 * We have been telling a hospital that this works today. It should be true
 * before it is said again, so this stands up the real server and queries it
 * with a real DICOM client — C-ECHO, which is the first thing every engineer
 * tries, and C-FIND on the worklist.
 */

const PORT = 11199
let failures = 0
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

const PATIENTS: WorklistItem[] = [
  {
    accessionNumber: 'RAD-2610-0042', patientId: 'DEMO-UH-2026-00007',
    patientName: 'Ravi Kumar', patientBirthDate: '1990-01-01', patientSex: 'M',
    modality: 'DX', studyDescription: 'Chest PA',
    scheduledFor: '2026-10-24T10:30:00+05:30', referringPhysician: 'Dr Arun Prakash',
  },
  {
    accessionNumber: 'RAD-2610-0043', patientId: 'DEMO-UH-2026-00008',
    patientName: 'Lakshmi Narayanan', patientBirthDate: null, patientSex: 'F',
    modality: 'CT', studyDescription: 'CT Brain plain',
    scheduledFor: '2026-10-24T11:00:00+05:30', referringPhysician: null,
  },
]

async function main(): Promise<void> {
  console.log('\nDICOM worklist')

  let askedFor: string | null | undefined
  const server = await startDicom(
    { dicomPort: PORT, dicomAeTitle: 'UYIRLY' } as unknown as Config,
    {
      getWorklist: async (modality) => {
        askedFor = modality
        return modality ? PATIENTS.filter((p) => p.modality === modality) : PATIENTS
      },
      onStudyComplete: () => {},
    },
  )

  const dimse = ((await import('dcmjs-dimse')) as unknown as {
    default: typeof import('dcmjs-dimse')
  }).default
  const { Client, requests, constants } = dimse
  const { CEchoRequest, CFindRequest } = requests

  // ── C-ECHO ───────────────────────────────────────────────────────────────
  await test('answers C-ECHO — what every engineer tries first', async () => {
    const client = new Client()
    const req = new CEchoRequest()
    let status: number | undefined
    req.on('response', (r: { getStatus: () => number }) => { status = r.getStatus() })
    client.addRequest(req)
    await new Promise<void>((resolve, reject) => {
      client.on('closed', () => resolve())
      client.on('networkError', (e: Error) => reject(e))
      client.send('127.0.0.1', PORT, 'CONSOLE', 'UYIRLY')
    })
    assert.equal(status, constants.Status.Success, 'the console must get a success back')
  })

  // ── C-FIND, everything ───────────────────────────────────────────────────
  await test('returns the whole list when the machine asks for everything', async () => {
    const got = await find(null)
    assert.equal(got.length, 2, `expected two patients, got ${got.length}`)
    const names = got.map((d) => String(d.PatientName))
    assert.ok(names.some((n) => /Kumar/.test(n)), `names were ${JSON.stringify(names)}`)
  })

  // ── C-FIND, filtered ─────────────────────────────────────────────────────
  await test('a CT console is not shown the X-ray list', async () => {
    const got = await find('CT')
    assert.equal(askedFor, 'CT', 'the modality asked for must reach the handler')
    assert.equal(got.length, 1)
    assert.equal(String(got[0].AccessionNumber), 'RAD-2610-0043')
  })

  // ── The fields a console actually reads ──────────────────────────────────
  await test('each entry carries what the console puts into the image', async () => {
    const [d] = await find('DX')
    assert.equal(String(d.AccessionNumber), 'RAD-2610-0042', 'accession — how the study finds its order')
    assert.equal(String(d.PatientID), 'DEMO-UH-2026-00007', 'the hospital number')
    assert.match(String(d.PatientName), /Kumar/, 'the name, in DICOM form')
    assert.equal(String(d.PatientSex), 'M')
    assert.equal(String(d.PatientBirthDate), '19900101', 'date of birth as DICOM writes it')

    // A console reads the modality and time from inside the scheduled step,
    // not from the top level. Getting this wrong shows an empty worklist on
    // the machine while the query itself looks like it succeeded.
    const step = (d.ScheduledProcedureStepSequence as Array<Record<string, unknown>>)?.[0]
    assert.ok(step, 'the scheduled step sequence must be present')
    assert.equal(String(step.Modality), 'DX')
    assert.equal(String(step.ScheduledProcedureStepStartDate), '20261024')
    assert.match(String(step.ScheduledProcedureStepStartTime), /^1030/, 'start time in IST')
    assert.equal(String(step.ScheduledProcedureStepID), 'RAD-2610-0042')
  })

  await test('an empty list is a success, not a failure', async () => {
    // A machine that gets an error here often stops asking until somebody
    // restarts it, so nothing scheduled must still be a clean answer.
    const got = await find('MR')
    assert.equal(got.length, 0)
  })

  async function find(modality: string | null): Promise<Array<Record<string, unknown>>> {
    const client = new Client()
    const req = CFindRequest.createWorklistFindRequest(
      modality
        ? { ScheduledProcedureStepSequence: [{ Modality: modality }], Modality: modality }
        : {},
    )
    const out: Array<Record<string, unknown>> = []
    req.on('response', (r: { getStatus: () => number; getDataset: () => { getElements: () => Record<string, unknown> } | undefined }) => {
      if (r.getStatus() === constants.Status.Pending) {
        const ds = r.getDataset()
        if (ds) out.push(ds.getElements())
      }
    })
    client.addRequest(req)
    await new Promise<void>((resolve, reject) => {
      client.on('closed', () => resolve())
      client.on('networkError', (e: Error) => reject(e))
      client.send('127.0.0.1', PORT, 'CONSOLE', 'UYIRLY')
    })
    return out
  }

  server.close()
  console.log(failures === 0 ? '\nAll DICOM worklist checks passed.\n' : `\n${failures} FAILED\n`)
  process.exit(failures ? 1 : 0)
}

main()
