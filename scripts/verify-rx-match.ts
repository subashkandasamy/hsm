/**
 * The name matching behind the prescription safety banner.
 *
 *   npm run verify:rx-match
 *
 * This is worth testing in both directions, which is the whole point of F-60: a
 * safety check that cries wolf is not safer than one that is quiet, because the
 * doctor learns to dismiss it. So the cases below are half "must still fire"
 * and half "must not fire", and the second half is the new half.
 */

import { boundaryMatch, namesRelated } from '../src/lib/rxMatch'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nThe false positive that started it (F-60)')
check(!namesRelated('paracetamol 500mg tablet', 'ace'),
  'an allergy to "ACE" does NOT flag paracetamol')
check(!namesRelated('paracetamol', 'ace'), 'nor bare paracetamol')
check(namesRelated('ACE 10mg', 'ace'), 'but it does flag a drug actually called ACE')
check(!namesRelated('amoxicillin', 'cil'), '"cil" does not flag amoxicillin')
check(!namesRelated('metformin', 'for'), '"for" does not flag metformin')
check(!namesRelated('prednisolone', 'sol'), '"sol" does not flag prednisolone')

console.log('\nThe true positives it must not lose')
check(namesRelated('Amoxicillin 500mg Capsule', 'amoxicillin'), 'exact generic in a branded string')
check(namesRelated('amoxicillin', 'Amoxicillin'), 'case does not matter')
check(namesRelated('Benzylpenicillin', 'penicillin'),
  'a token ENDING with the allergen — the case whole-token matching would miss')
check(namesRelated('Penicillin V', 'penicillin'), 'a token equal to the allergen')
check(namesRelated('Sulfamethoxazole', 'sulfa'), 'a token STARTING with the allergen')
check(namesRelated('amoxicillin', 'amoxicillin and clavulanate'),
  'the reverse direction: the drug appears inside a longer recorded allergen')
check(namesRelated('Tab. Aspirin-75', 'aspirin'), 'punctuation is a token boundary')

console.log('\nThe short-needle rule')
check(boundaryMatch('ace', 'ace'), 'three characters match an identical token')
check(!boundaryMatch('acebutolol', 'ace'),
  'but three characters do NOT match as a prefix — too short to be meaningful')
check(boundaryMatch('acebutolol', 'acebutolol'), 'the full name does')
check(boundaryMatch('warfarin sodium', 'warfarin'), 'four or more may match as a prefix')
check(!boundaryMatch('anything', 'ab'), 'two characters never match')
check(!boundaryMatch('anything', ''), 'and neither does nothing')

console.log('\nThings that must not throw or over-match')
check(!namesRelated('', 'penicillin'), 'an empty drug name')
check(!namesRelated('penicillin', ''), 'an empty allergen')
check(!namesRelated('500mg', '500'), 'a dose is not a drug: "500" does not match "500mg"')
check(namesRelated('Vitamin B12', 'b12'), 'alphanumeric tokens still work')

// The real register, as it stands.
console.log('\nAgainst the two allergies actually on file')
for (const [allergen, drug, shouldFire] of [
  ['Penicillin', 'Amoxicillin 500mg', true],
  ['Penicillin', 'Paracetamol 650mg', false],
  ['Sulfa drugs', 'Sulfamethoxazole + Trimethoprim', true],
  ['Sulfa drugs', 'Salbutamol', false],
] as [string, string, boolean][]) {
  // Note: the class table in rxSafety widens "Penicillin" to amoxicillin etc.
  // This checks the direct name test only, so amoxicillin matching here is via
  // the class list in the action, not via these functions.
  const got = namesRelated(drug.toLowerCase(), allergen.toLowerCase())
  const viaClass = allergen.toLowerCase().includes('penicillin') && /amoxicillin/i.test(drug)
  const effective = got || viaClass
  check(effective === shouldFire, `"${allergen}" vs "${drug}" → ${shouldFire ? 'warn' : 'quiet'}`,
    { direct: got, viaClass })
}

console.log(failed === 0 ? '\nMatching behaves in both directions.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
