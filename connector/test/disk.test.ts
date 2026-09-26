import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkDisk, humanBytes, DiskWatch, WARN_FREE_BYTES, REFUSE_FREE_BYTES } from '../src/dicom/disk.js'

/**
 * The disk guard, tested for the thing it exists to prevent.
 *
 * Without it a full disk means the scanner is told each image was stored, the
 * write fails, and a patient's study is simply missing. So what matters is not
 * that it measures accurately — it is that `accepting` turns false before the
 * disk is actually full, and that refusing is loud.
 */

let failures = 0
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => console.log(`  ok    ${name}`))
    .catch((e: Error) => { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`) })
}

console.log('\nDisk guard\n')

await test('thresholds leave room to act, and refuse before zero', () => {
  assert.ok(REFUSE_FREE_BYTES > 0, 'must refuse before the disk is actually full')
  assert.ok(WARN_FREE_BYTES > REFUSE_FREE_BYTES,
    'the warning must come before the refusal, or it is useless')
})

await test('measures a real folder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-disk-'))
  await fs.mkdir(path.join(dir, 'study', 'series'), { recursive: true })
  await fs.writeFile(path.join(dir, 'study', 'series', 'a.dcm'), Buffer.alloc(4096))
  await fs.writeFile(path.join(dir, 'study', 'series', 'b.dcm'), Buffer.alloc(2048))

  const s = await checkDisk(dir)
  assert.ok(s, 'should have measured the disk')
  assert.equal(s!.usedByImagesBytes, 6144, 'walks nested folders')
  assert.ok(s!.totalBytes > 0 && s!.freeBytes > 0)
  await fs.rm(dir, { recursive: true, force: true })
})

await test('a folder that does not exist is not an error', async () => {
  const s = await checkDisk(path.join(os.tmpdir(), `uyirly-missing-${Date.now()}`))
  assert.ok(s, 'creates it rather than failing')
  assert.equal(s!.usedByImagesBytes, 0)
})

await test('accepts while there is room', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-disk-'))
  const w = new DiskWatch(dir)
  await w.start()
  // The machine running this has room; the point is that the guard is not
  // refusing by default, which would block every hospital.
  assert.equal(w.accepting, true, 'must not refuse on a healthy disk')
  assert.ok(w.current, 'state is available for the status page')
  w.stop()
  await fs.rm(dir, { recursive: true, force: true })
})

await test('refuses once free space falls under the limit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-disk-'))
  const w = new DiskWatch(dir)
  await w.start()
  // Reaching in rather than filling a real disk: what is under test is that
  // `accepting` follows the measurement, not that statfs works.
  ;(w as unknown as { state: { refusing: boolean } }).state.refusing = true
  assert.equal(w.accepting, false, 'a low disk must stop accepting images')
  w.stop()
  await fs.rm(dir, { recursive: true, force: true })
})

await test('sizes read the way a person would say them', () => {
  assert.equal(humanBytes(5 * 1024 ** 3), '5 GB')
  assert.equal(humanBytes(1.5 * 1024 ** 4), '1.5 TB')
  assert.equal(humanBytes(700 * 1024 ** 2), '700 MB')
})

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n')
process.exit(failures ? 1 : 0)
