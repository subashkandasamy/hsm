import assert from 'node:assert/strict'
import {
  machineName, verdict, analyzerConnected, analyzerDisconnected, analyzerResult,
  analyzerProblem, liveAnalyzers, type AnalyzerLive,
} from '../src/analyzers-live.js'

/** The status page's per-analyzer rows: names from headers only, plain verdicts. */

let failures = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${name}`) } catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

console.log('\nAnalyzer rows on the status page\n')

test('H360 named from MSH-3/4', () => {
  assert.equal(machineName('MSH|^~\\&|H360|ERBA|UYIRLY|KMC|2026||ORU^R01|9|P|2.3.1\nPID|||x||Divya'), 'H360 ERBA')
})
test('iChroma: numeric MSH-3 skipped, MSH-4 used', () => {
  assert.equal(machineName('MSH|^~\\&|1|ichroma2|RL630||2026||OUL^R24|1|T|2.6\nPID||jeevitha'), 'ichroma2')
})
test('ASTM named from H-5, never from the patient record', () => {
  assert.equal(machineName('1H|\\^&|||ECL105^Erba^1.2|||||||P|1\nP|1||||Kumar^Ravi'), 'ECL105 Erba')
})
test('unknown format → no name, not a guess', () => {
  assert.equal(machineName('APTT;27.1;sec'), null)
})

test('a network analyzer that sends a result is "Working"', () => {
  analyzerConnected('tcp 192.168.1.60')
  analyzerResult('tcp 192.168.1.60', 'MSH|^~\\&|H360|ERBA|||2026||ORU^R01|9|P|2.3.1')
  const a = liveAnalyzers().find((x) => x.address === '192.168.1.60')!
  assert.equal(a.name, 'H360 ERBA')
  const v = verdict(a)
  assert.equal(v.ok, true)
  assert.match(v.text, /^Working — last result just now/)
})

test('connected but no result yet → waiting (not an error)', () => {
  analyzerConnected('tcp 192.168.1.61')
  const v = verdict(liveAnalyzers().find((x) => x.address === '192.168.1.61')!)
  assert.equal(v.ok, null)
  assert.match(v.text, /waiting for the first result/)
})

test('connects then leaves without a byte → says what to check', () => {
  analyzerConnected('tcp 192.168.1.119')
  analyzerDisconnected('tcp 192.168.1.119', 0)
  const v = verdict(liveAnalyzers().find((x) => x.address === '192.168.1.119')!)
  assert.equal(v.ok, false)
  assert.match(v.text, /sends nothing/)
})

test('an incomplete message is flagged, not called working', () => {
  analyzerConnected('tcp 192.168.1.62')
  analyzerResult('tcp 192.168.1.62', '\x0bMSH|^~\\&|X|Y', true)
  analyzerDisconnected('tcp 192.168.1.62', 14)
  const v = verdict(liveAnalyzers().find((x) => x.address === '192.168.1.62')!)
  assert.equal(v.ok, null)
  assert.match(v.text, /incomplete/)
})

test('a cable port that cannot open is red, with a reason', () => {
  analyzerProblem('serial COM3', 'Cannot open COM3 — is the cable plugged in and no other program using it?')
  const a = liveAnalyzers().find((x) => x.address === 'COM3')!
  assert.equal(a.kind, 'cable')
  assert.equal(verdict(a).ok, false)
})

test('a working analyzer that later disconnects still reads as working', () => {
  analyzerDisconnected('tcp 192.168.1.60', 900)
  const v = verdict(liveAnalyzers().find((x) => x.address === '192.168.1.60')! as AnalyzerLive)
  assert.equal(v.ok, true)
})

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
