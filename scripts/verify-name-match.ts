/**
 * Matching an invoice line to a catalogue entry — both halves of the job.
 *
 *   npm run verify:name-match
 *
 * Every case below is real: taken from a hospital's 1,127-row opening stock and
 * from the catalogue rows I looked up by hand while working out why the import
 * matched only 42 of 712 names.
 *
 * The second half matters as much as the first. A matcher that links more lines
 * is only an improvement if the extra links are right — and the obvious loose
 * rule ("first word starts with") produced three confident, wrong answers on
 * this data, each of which would have pointed a pharmacy at the wrong record.
 */

import { nameMatchScore, SURE, LIKELY, WEAK } from '../src/lib/pharmacy/nameMatch'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}
const score = (a: string, b: string) => nameMatchScore(a, b)

console.log('\nMust match — these are in the catalogue and were being missed')
for (const [q, c] of [
  ['glymiprl m1', 'Glymiprl M 1mg/500mg Tablet'],
  ['telmiprl 20mg', 'Telmiprl 20mg Tablet'],
  ['amoxprl cv 625mg', 'Amoxprl CV 625mg Tablet'],
  ['aziprl 500mg', 'Aziprl 500mg Tablet'],
  ['cefiprl 200mg', 'Cefiprl 200mg Tablet'],
  ['urimax 0.4mg', 'Urimax 0.4 Capsule MR'],
  ['evion 400mg', 'Evion 400 Capsule'],
  ['ecosprin 150mg', 'Ecosprin 150 Tablet'],
  ['aldactone 25mg', 'Aldactone 25 Tablet'],
  ['amlong 5mg', 'Amlong 5 Tablet'],
] as [string, string][]) {
  const s = score(q, c)
  check(s >= LIKELY, `${q}  →  ${c}`, s)
}

console.log('\nMust NOT match — the wrong answers a looser rule produced')
for (const [q, c] of [
  ['accu chek active', 'Accuzon 1g Injection'],
  ['aero neb mask adult', 'Aerocort Inhaler'],
  ['airway gudel 1 white', 'Airway 5mg/60mg Tablet'],
  ['ambu bag adult resq bag', 'Ambrolite D Syrup'],
  ['alice tissue forceps 6', 'Alice 10mg Tablet'],
  ['nitrile large gloves', 'Nitrofur 100mg Tablet'],
] as [string, string][]) {
  const s = score(q, c)
  check(s === 0, `${q}  ✗  ${c}`, s)
}

console.log('\nThe brand word must agree exactly, not merely start the same')
check(score('accu chek', 'accuzon') === 0, '"accu" is not "accuzon"')
check(score('aero neb', 'aerocort') === 0, '"aero" is not "aerocort"')
check(score('dolo 650', 'Dolo 650 Tablet') >= SURE, 'but "dolo" is "dolo"')

console.log('\nStrength decides sure vs needs-checking')
check(score('telmiprl 20mg', 'Telmiprl 20mg Tablet') >= SURE,
  'same strength → sure', score('telmiprl 20mg', 'Telmiprl 20mg Tablet'))
check(score('telmiprl 20mg', 'Telmiprl 40mg Tablet') === LIKELY,
  'different strength → same brand, but flagged', score('telmiprl 20mg', 'Telmiprl 40mg Tablet'))
check(score('cardivas cr 10', 'Cardivas 3.125 Tablet') === 0,
  'CARDIVAS CR is not plain CARDIVAS — "cr" is a word and is absent')
check(score('aldactone', 'Aldactone 50 Tablet') === LIKELY,
  'no strength given → brand match, flagged', score('aldactone', 'Aldactone 50 Tablet'))

console.log('\nSpacing and punctuation must not matter')
check(score('GLYMIPRL M1', 'glymiprl m 1mg') >= LIKELY, 'case is ignored')
check(score('amoxprl- cv 625mg', 'Amoxprl CV 625mg Tablet') >= SURE, 'a hyphen is ignored')
check(score('ecosprin av 75mg', 'Ecosprin AV 75/20 Capsule') >= LIKELY, 'a slash is ignored')
check(score('zolfresh 5mg', 'Zolfresh 5 Tablet') >= SURE, 'trailing words are ignored')

console.log('\nA bare unit word must not block a correct match')
check(score('aciclovir 400 mg', 'Aciclovir 400 Tablet') >= SURE,
  'ACICLOVIR 400 MG → Aciclovir 400', score('aciclovir 400 mg', 'Aciclovir 400 Tablet'))
check(score('anxit 0.5 mg', 'Anxit 0.5 Tablet') >= SURE, 'ANXIT 0.5 MG → Anxit 0.5')
check(score('azee 500 mg', 'Azee 500 Tablet') >= SURE, 'AZEE 500 MG → Azee 500')
check(score('acceptik hc 1 lit', 'Aceptik 500ml') === 0,
  'but a real word still blocks it — "hc" is absent')

console.log('\nNothing silly')
check(score('', 'Dolo 650') === 0, 'an empty query')
check(score('dolo', '') === 0, 'an empty candidate')
check(score('ns 100ml', 'NS 100ml') === 100, 'identical once squashed')
check(score('ab', 'Abzorb Powder') === 0, 'a two-letter query matches nothing')

console.log(failed === 0
  ? '\nMatching links what it should and refuses what it should not.\n'
  : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
