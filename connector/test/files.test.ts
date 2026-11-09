import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pickDrive, resolveStorage, storageRoot, scanDir, filesDir, scanDirs } from '../src/storage.js'
import { FileMover } from '../src/files.js'
import { handleViewer } from '../src/viewer/page.js'
import { signViewerLink } from '../src/viewer/link.js'
import type { Config } from '../src/config.js'

/**
 * Where scans and uploaded files are kept, and how uploads arrive.
 *
 * What matters: the roomiest fixed drive is chosen once and remembered; a file
 * is only reported as kept once an identical copy is on disk; a failed
 * download leaves nothing behind that looks complete; and the viewer serves a
 * kept file only to a link Uyirly signed for exactly that file.
 */

let failures = 0
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => console.log(`  ok    ${name}`))
    .catch((e: Error) => { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`) })
}

const GB = 1e9
console.log('\nChoosing the drive\n')

await test('the drive with the most free space wins', () => {
  const d = pickDrive([
    { id: 'C:', freeBytes: 40 * GB, sizeBytes: 250 * GB },
    { id: 'D:', freeBytes: 700 * GB, sizeBytes: 1000 * GB },
    { id: 'E:', freeBytes: 90 * GB, sizeBytes: 500 * GB },
  ])
  assert.equal(d?.id, 'D:')
})
await test('a tie spares C:', () => {
  assert.equal(pickDrive([{ id: 'C:', freeBytes: 100 * GB, sizeBytes: 1 }, { id: 'D:', freeBytes: 100 * GB, sizeBytes: 1 }])?.id, 'D:')
})
await test('only C: → C:', () => {
  assert.equal(pickDrive([{ id: 'C:', freeBytes: 5 * GB, sizeBytes: 1 }])?.id, 'C:')
})
await test('nothing sensible → null (stay in ProgramData, never guess)', () => {
  assert.equal(pickDrive([]), null)
  assert.equal(pickDrive([{ id: '\\\\server\\share', freeBytes: 9e12, sizeBytes: 1 }]), null)
  assert.equal(pickDrive([{ id: 'D:', freeBytes: 0, sizeBytes: 1 }]), null)
})

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-files-'))
process.env.UYIRLY_DATA_DIR = path.join(tmp, 'programdata')

const config: Config = {
  token: 'bearer', serverUrl: 'https://demo.example', connectorId: 'c1', connectorName: 'PC',
  hospital: 'Demo', listenPort: 5150, serial: [], watchFolders: [], pairedAt: new Date().toISOString(),
}

await test('chosen once, remembered, and never re-chosen', async () => {
  const saved: Config[] = []
  config.storageRoot = path.join(tmp, 'bigdrive', 'Uyirly')   // as if D:\Uyirly had been chosen
  const root = await resolveStorage(config, { drives: [], persist: async (c) => { saved.push({ ...c }) } })
  assert.equal(root, config.storageRoot)
  assert.equal(saved.length, 0, 'an existing choice is not saved again')
  assert.equal(storageRoot(), root)
  assert.equal(scanDir(), path.join(root, 'dicom'))
  assert.equal(filesDir(), path.join(root, 'files'))
  assert.ok(scanDirs().includes(path.join(process.env.UYIRLY_DATA_DIR!, 'dicom')),
    'old ProgramData scans are still looked in')
  await fs.access(path.join(root, 'files'))
})

await test('no drives reported (not Windows) → ProgramData, and saved', async () => {
  const c: Config = { ...config, storageRoot: undefined }
  const saved: Config[] = []
  const root = await resolveStorage(c, { drives: [], persist: async (x) => { saved.push({ ...x }) } })
  assert.equal(root, process.env.UYIRLY_DATA_DIR)
  assert.equal(saved[0]?.storageRoot, root)
  await resolveStorage(config, { drives: [], persist: async () => {} })   // back to the test root
})

console.log('\nCollecting uploads\n')

const content = Buffer.from('%PDF-1.4 a patient consent form')
const id = '3f2a9c1b-77aa-4b2e-9d10-aaaaaaaaaaaa'
const reports: Array<Record<string, unknown>> = []
let downloadBody: Buffer = content
let acceptConfirm = true
const stub = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url)
  if (u === 'https://demo.example/api/device/files' && (!init?.method || init.method === 'GET')) {
    return new Response(JSON.stringify({ files: [{ id, url: 'https://storage.example/signed', ext: 'pdf', size: content.length }] }))
  }
  if (u === 'https://demo.example/api/device/files' && init?.method === 'POST') {
    const b = JSON.parse(String(init.body)) as Record<string, unknown>
    reports.push(b)
    return new Response('{}', { status: b.ok && !acceptConfirm ? 409 : 200 })
  }
  if (u === 'https://storage.example/signed') return new Response(downloadBody)
  throw new Error(`unexpected ${u}`)
}) as typeof fetch

await test('downloads, writes, checks, then reports size + SHA-256', async () => {
  const m = new FileMover(config, { fetchImpl: stub })
  const r = await m.sync()
  assert.deepEqual(r, { moved: 1, failed: 0 })
  const onDisk = await fs.readFile(path.join(filesDir(), `${id}.pdf`))
  assert.deepEqual(onDisk, content)
  const ok = reports.find((x) => x.ok === true)!
  assert.equal(ok.size, content.length)
  assert.equal(ok.sha256, createHash('sha256').update(content).digest('hex'))
  assert.ok(!(await fs.readdir(filesDir())).some((f) => f.endsWith('.part')), 'no .part left behind')
})

await test('a short download is refused and reported, cloud copy kept', async () => {
  reports.length = 0
  await fs.rm(path.join(filesDir(), `${id}.pdf`), { force: true })
  downloadBody = content.subarray(0, 5)
  const r = await new FileMover(config, { fetchImpl: stub }).sync()
  assert.deepEqual(r, { moved: 0, failed: 1 })
  assert.equal(reports.length, 1)
  assert.equal(reports[0].ok, false)
  assert.ok(!(await fs.readdir(filesDir())).length, 'nothing left that looks like a kept file')
  downloadBody = content
})

await test('Uyirly refusing the copy counts as not kept', async () => {
  reports.length = 0
  acceptConfirm = false
  const r = await new FileMover(config, { fetchImpl: stub }).sync()
  assert.deepEqual(r, { moved: 0, failed: 1 })
  assert.equal(reports.at(-1)?.ok, false)
  acceptConfirm = true
})

console.log('\nServing a kept file\n')

await new FileMover(config, { fetchImpl: stub }).sync()
const key = 'k'.repeat(64)
const server = http.createServer(async (req, res) => {
  if (!(await handleViewer(req, res, key))) { res.writeHead(404); res.end() }
}).listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const port = (server.address() as { port: number }).port
const exp = Math.floor(Date.now() / 1000) + 600
const at = (p: string) => fetch(`http://127.0.0.1:${port}${p}`)

await test('a link signed for this file opens it, with the right type', async () => {
  const res = await at(`/file/${id}?e=${exp}&s=${signViewerLink(key, `file:${id}`, exp)}`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/pdf')
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), content)
})
await test('a scan link cannot be replayed as a file link', async () => {
  const res = await at(`/file/${id}?e=${exp}&s=${signViewerLink(key, id, exp)}`)
  assert.equal(res.status, 403)
})
await test('expired → 410, unsigned → 403', async () => {
  const old = Math.floor(Date.now() / 1000) - 5
  assert.equal((await at(`/file/${id}?e=${old}&s=${signViewerLink(key, `file:${id}`, old)}`)).status, 410)
  assert.equal((await at(`/file/${id}`)).status, 403)
})
await test('nothing outside the files folder can be asked for', async () => {
  assert.equal((await at(`/file/..%2F..%2Fconfig.json?e=${exp}&s=x`)).status, 400)
})

server.close()
await fs.rm(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
