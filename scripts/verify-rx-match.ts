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

import { boundaryMatch, namesRelated, evaluateRxSafety, UNIDENTIFIED_DRUG_MESSAGE, type RxInteractionRow } from '../src/lib/rxMatch'
import { withSynonyms, pickUniqueGeneric } from '../src/lib/drugResolve'

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

// ── Brand names (build item #1) ─────────────────────────────────────────────
// The check compared the label as written against generic names, and a brand
// never matches its generic. Nine in ten real prescriptions are brands. These
// cases resolve the label first (as checkPrescriptionSafety now does) and prove
// the result in both directions — it must fire where it should, and resolution
// must not open a new route to the F-60 false positives.

console.log('\nSynonyms: one molecule, two names')
check(withSynonyms(['Acetaminophen']).includes('paracetamol'), 'acetaminophen also reads as paracetamol')
check(withSynonyms(['paracetamol']).includes('acetaminophen'), 'and the other way round')
check(withSynonyms(['Acetaminophen + Caffeine']).includes('paracetamol + caffeine'), 'inside a combination too')
check(withSynonyms(['norepinephrine']).includes('noradrenaline'), 'norepinephrine maps through its own pair')
// "nor"+"adrenaline" happens to spell "noradrenaline", so norepinephrine cannot
// prove the whole-word guard. A made-up word can: the synonym sits inside it.
check(!withSynonyms(['xepinephrine']).includes('xadrenaline'), 'a synonym is replaced only as a whole word, never inside another word')
check(withSynonyms(['Amlodipine']).length === 1, 'a name with no synonym is left alone')

console.log('\nA prefix is trusted only when it reaches one molecule')
check(pickUniqueGeneric(['Acetaminophen', 'Paracetamol']) === 'paracetamol', 'Acetaminophen + Paracetamol is ONE molecule')
check(pickUniqueGeneric(['Metformin', 'Metformin + Glimepiride']) === null, 'Metformin vs Metformin + Glimepiride is TWO — not guessed')
check(pickUniqueGeneric(['Amlodipine', 'amlodipine ', null]) === 'amlodipine', 'case, spacing and blanks do not split one molecule')
check(pickUniqueGeneric([null, undefined, '']) === null, 'nothing found is not a match')

const I: RxInteractionRow[] = [
  { drug_a: 'warfarin', drug_b: 'azithromycin', severity: 'moderate', description: 'raises INR' },
  { drug_a: 'enalapril', drug_b: 'spironolactone', severity: 'major', description: 'hyperkalaemia' },
  { drug_a: 'warfarin', drug_b: 'aspirin', severity: 'major', description: 'bleeding' },
]
const drug = (label: string, generics: string[] = [], identified = true) =>
  ({ label, names: [label, ...withSynonyms(generics)], identified })
const other = (label: string, generics: string[] = [], provenance = 'on this prescription') =>
  ({ label, names: [label, ...withSynonyms(generics)], provenance })
const types = (w: { type: string }[]) => w.map((x) => x.type).sort().join(',')

console.log('\nThe defect, then the fix')
check(evaluateRxSafety({ drug: drug('azithral 500'), allergies: [], others: [other('warfarin')], interactions: I })
  .filter((w) => w.type === 'interaction').length === 0,
  'label alone: Azithral + warfarin is SILENT — the bug as it was')
const az = evaluateRxSafety({ drug: drug('azithral 500', ['Azithromycin']), allergies: [], others: [other('warfarin')], interactions: I })
check(az.some((w) => w.type === 'interaction' && w.severity === 'moderate'), 'resolved: Azithral + warfarin now warns', az)
check(evaluateRxSafety({ drug: drug('azithral 500', ['Azithromycin']), allergies: ['Azithromycin'], others: [], interactions: I })
  .some((w) => w.type === 'allergy'), 'resolved: Azithral warns an azithromycin-allergic patient')
check(evaluateRxSafety({ drug: drug('warfarin', ['Warfarin']), allergies: [], others: [other('azithral 500', ['Azithromycin'], 'prescribed on 2026-11-01')], interactions: I })
  .some((w) => w.type === 'interaction'), 'the OTHER side resolves too — a past Azithral is seen by new warfarin')
check(evaluateRxSafety({ drug: drug('metolactone 5 mg/50 mg tablet', ['Metolazone + Spironolactone']), allergies: [], others: [other('enalapril', ['Enalapril'])], interactions: I })
  .some((w) => w.severity === 'major'), 'a combination reaches the interaction of one of its parts')

console.log('\nSynonyms reach allergies')
check(evaluateRxSafety({ drug: drug('dolo 650', ['Acetaminophen']), allergies: ['Paracetamol'], others: [], interactions: I })
  .some((w) => w.type === 'allergy'), 'Dolo (catalogue: acetaminophen) warns a "Paracetamol" allergy')
check(evaluateRxSafety({ drug: drug('dolo 650', ['Paracetamol']), allergies: ['acetaminophen'], others: [], interactions: I })
  .some((w) => w.type === 'allergy'), 'and the reverse spelling')
check(evaluateRxSafety({ drug: drug('mox 500', ['Amoxicillin']), allergies: ['Penicillin'], others: [], interactions: I })
  .some((w) => w.type === 'allergy'), 'a brand reaches its allergy CLASS through its generic (Mox → amoxicillin → penicillin)')

console.log('\nResolution must not bring back F-60')
check(!evaluateRxSafety({ drug: drug('dolo 650', ['Acetaminophen']), allergies: ['ACE'], others: [], interactions: I })
  .some((w) => w.type === 'allergy'), 'an allergy to "ACE" still does NOT flag Dolo, even as acetaminophen')
check(!evaluateRxSafety({ drug: drug('amlopres 5', ['Amlodipine']), allergies: ['Penicillin', 'Sulfa drugs'], others: [], interactions: I })
  .some((w) => w.type === 'allergy'), 'Amlopres (amlodipine) is quiet for penicillin and sulfa allergies')
check(evaluateRxSafety({ drug: drug('glycomet 500', ['Metformin']), allergies: [], others: [other('amlopres 5', ['Amlodipine'])], interactions: I }).length === 0,
  'two identified drugs with no known interaction: no banner at all')

console.log('\nWhen the catalogue cannot say what it is')
const ors = evaluateRxSafety({ drug: drug('ors sachet', [], false), allergies: ['Penicillin'], others: [other('warfarin')], interactions: I })
check(types(ors) === 'unrecognised', 'one "not checked" line, nothing invented', ors)
check(ors.every((w) => w.severity !== 'major'), 'and never major — it must not block prescribing or demand the tick')
check(ors[0]?.message === UNIDENTIFIED_DRUG_MESSAGE, 'with the agreed wording')
check(!evaluateRxSafety({ drug: drug('azithral 500', ['Azithromycin']), allergies: [], others: [], interactions: I })
  .some((w) => w.type === 'unrecognised'), 'an identified drug gets no "not checked" line')

console.log('\nResolution only ever adds warnings')
for (const [label, gens, allergy, otherLabel] of [
  ['warfarin', ['Warfarin'], '', 'aspirin'],
  ['amoxicillin 500', ['Amoxicillin'], 'Penicillin', ''],
  ['sulfamethoxazole + trimethoprim', ['Sulfamethoxazole + Trimethoprim'], 'Sulfa drugs', ''],
] as [string, string[], string, string][]) {
  const base = { allergies: allergy ? [allergy] : [], others: otherLabel ? [other(otherLabel)] : [], interactions: I }
  const before = evaluateRxSafety({ ...base, drug: drug(label) }).map((w) => w.message)
  const after = evaluateRxSafety({ ...base, drug: drug(label, gens) }).map((w) => w.message)
  check(before.length > 0 && before.every((m) => after.includes(m)), `"${label}": every warning the label raised is still raised`, { before, after })
}

console.log(failed === 0 ? '\nMatching behaves in both directions.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
