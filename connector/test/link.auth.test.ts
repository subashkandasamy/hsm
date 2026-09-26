import assert from 'node:assert/strict'
import { signViewerLink, verifyViewerLink, VIEWER_LINK_TTL_SECONDS } from '../src/viewer/link.js'

/**
 * Link signing, tested for the ways it could quietly let somebody in.
 *
 * The failure that matters is a link being accepted when it should not be —
 * the images behind it are a patient's scans, on a port the whole hospital can
 * reach.
 */
let failures = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

const KEY = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const STUDY = '1.2.840.113619.2.55.3.1234'
const soon = () => Math.floor(Date.now() / 1000) + 3600

console.log('\nViewer link signing\n')

test('a link Uyirly signed is accepted', () => {
  const e = soon()
  assert.equal(verifyViewerLink(KEY, STUDY, e, signViewerLink(KEY, STUDY, e)), true)
})

test('an unsigned link is refused', () => {
  assert.equal(verifyViewerLink(KEY, STUDY, soon(), ''), false)
})

test('a signature for a DIFFERENT study is refused', () => {
  const e = soon()
  const stolen = signViewerLink(KEY, '1.2.840.999', e)
  assert.equal(verifyViewerLink(KEY, STUDY, e, stolen), false,
    'a link to one patient must not open another')
})

test('a signature from another hospital is refused', () => {
  const e = soon()
  assert.equal(verifyViewerLink(KEY, STUDY, e, signViewerLink(OTHER, STUDY, e)), false)
})

test('an expired link is refused', () => {
  const past = Math.floor(Date.now() / 1000) - 60
  assert.equal(verifyViewerLink(KEY, STUDY, past, signViewerLink(KEY, STUDY, past)), false,
    'a forwarded or bookmarked link must stop working')
})

test('the expiry cannot be extended without the key', () => {
  const e = soon()
  const sig = signViewerLink(KEY, STUDY, e)
  // Same signature, later expiry — the obvious thing an attacker would try.
  assert.equal(verifyViewerLink(KEY, STUDY, e + 86400, sig), false)
})

test('a connector with no key refuses everything', () => {
  const e = soon()
  assert.equal(verifyViewerLink('', STUDY, e, signViewerLink(KEY, STUDY, e)), false,
    'no images shown beats images readable by anyone')
})

test('rubbish in the signature does not throw', () => {
  assert.equal(verifyViewerLink(KEY, STUDY, soon(), 'not-a-signature'), false)
  assert.equal(verifyViewerLink(KEY, STUDY, Number.NaN, 'x'), false)
})

test('the link lasts a shift, not a moment', () => {
  assert.ok(VIEWER_LINK_TTL_SECONDS >= 3600, 'too short and a ward round breaks')
  assert.ok(VIEWER_LINK_TTL_SECONDS <= 24 * 3600, 'too long and a leaked link is a standing key')
})

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n')
process.exit(failures ? 1 : 0)
