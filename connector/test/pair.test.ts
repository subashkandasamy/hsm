import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Pairing again (installer -Repair), the two ways it used to go wrong:
 * the chosen storage drive and analyzer cables were forgotten, and results
 * still waiting for the OLD hospital would have been sent to the NEW one.
 */

let failures = 0
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => console.log(`  ok    ${name}`))
    .catch((e: Error) => { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`) })
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-pair-'))
process.env.UYIRLY_DATA_DIR = tmp
const { pair } = await import('../src/pair.js')
const { loadConfig } = await import('../src/config.js')
type Config = import('../src/config.js').Config

const queueDir = path.join(tmp, 'queue')
const previous: Config = {
  token: 'old', serverUrl: 'https://demo.uyirly.com', connectorId: 'c-demo', connectorName: 'xray',
  hospital: 'Uyirly Demo Hospital', listenPort: 5150, statusPort: 5151,
  serial: [{ path: 'COM3', baudRate: 9600 }], watchFolders: ['D:\\LabResults'],
  pairedAt: '2026-10-01T00:00:00Z', storageRoot: 'D:\\Uyirly', dicomPort: 104, dicomAeTitle: 'XRAYPC',
}
const okFetch = (async () => new Response(JSON.stringify({
  token: 'new', connectorId: 'c-new', connectorName: 'X-ray room', hospital: 'KMCH', listenPort: 5150,
}))) as unknown as typeof fetch
const badFetch = (async () => new Response(JSON.stringify({ error: 'That pairing code is not valid.' }), { status: 404 })) as unknown as typeof fetch

async function seedQueue(n: number) {
  await fs.rm(queueDir, { recursive: true, force: true })
  await fs.mkdir(queueDir, { recursive: true })
  for (let i = 0; i < n; i++) await fs.writeFile(path.join(queueDir, `r${i}.json`), '{"raw":"demo result"}')
}

console.log('\nPairing again\n')

await test('same hospital: machine settings kept, queue kept', async () => {
  await seedQueue(2)
  const { config, setAside } = await pair('https://demo.uyirly.com/', 'ABCD-1234', previous, okFetch)
  assert.equal(setAside, null)
  assert.equal((await fs.readdir(queueDir)).length, 2, 'results for the same hospital still go')
  assert.equal(config.storageRoot, 'D:\\Uyirly')
  assert.deepEqual(config.serial, previous.serial)
  assert.deepEqual(config.watchFolders, previous.watchFolders)
  assert.equal(config.dicomPort, 104)
  assert.equal(config.dicomAeTitle, 'XRAYPC')
  assert.equal(config.token, 'new')
  assert.equal((await loadConfig())?.storageRoot, 'D:\\Uyirly', 'and it is what was saved')
})

await test('different hospital: waiting results set aside, NOT sent; settings kept', async () => {
  await seedQueue(3)
  const { config, setAside } = await pair('https://karur.uyirly.com', 'ABCD-1234', previous, okFetch)
  assert.ok(setAside, 'should have set results aside')
  assert.equal(setAside!.count, 3)
  assert.equal((await fs.readdir(queueDir)).length, 0, 'nothing left to send to the new hospital')
  const kept = await fs.readdir(setAside!.dir)
  assert.equal(kept.filter((f) => f.endsWith('.json')).length, 3, 'moved, not deleted')
  assert.ok(kept.includes('README.txt'))
  assert.ok((await fs.readFile(path.join(setAside!.dir, 'README.txt'), 'utf8')).includes('demo.uyirly.com'))
  assert.ok(setAside!.dir.includes('demo.uyirly.com'))
  assert.equal(config.storageRoot, 'D:\\Uyirly')
  assert.equal(config.hospital, 'KMCH')
})

await test('different hospital but nothing waiting: nothing to set aside', async () => {
  await seedQueue(0)
  const { setAside } = await pair('https://karur.uyirly.com', 'ABCD-1234', previous, okFetch)
  assert.equal(setAside, null)
})

await test('a wrong code puts the results back for the old hospital', async () => {
  await seedQueue(2)
  await fs.writeFile(path.join(tmp, 'config.json'), JSON.stringify(previous))
  await assert.rejects(pair('https://karur.uyirly.com', 'WRONG', previous, badFetch), /not valid/)
  const back = await fs.readdir(queueDir)
  assert.equal(back.filter((f) => f.endsWith('.json')).length, 2, 'results restored')
  assert.ok(!back.includes('README.txt'))
  assert.equal((await loadConfig())?.serverUrl, 'https://demo.uyirly.com', 'still paired to the old hospital')
})

await test('first ever pairing (no previous): plain defaults', async () => {
  await seedQueue(0)
  const { config } = await pair('https://karur.uyirly.com', 'ABCD-1234', null, okFetch)
  assert.equal(config.storageRoot, undefined, 'chosen on first start')
  assert.deepEqual(config.serial, [])
})

await fs.rm(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
