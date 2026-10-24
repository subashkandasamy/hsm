/**
 * Which patients a scanner is shown, and which it is not.
 *
 *   npm run verify:worklist
 *
 * The filtering happens here, in Uyirly, rather than on the hospital's own
 * computer — the connector only passes on the code the machine asked for. So
 * this is where a mistake hides a patient, and hiding a patient is the one
 * failure that matters: a technologist who cannot find a name on the list goes
 * back to typing it in by hand, which is the practice this exists to end.
 *
 * Written as a script rather than a unit test for the same reason the HL7
 * checks are: every case below came off a real console's log, and a new
 * hospital's machine can be added to the table in a minute.
 */

import { toDicomModality, modalityMatches } from '../src/lib/radiology/modality'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nOur words for a machine, and DICOM\'s')
for (const [ours, dicom] of [
  ['X-Ray', 'DX'], ['xray', 'DX'], ['x-ray', 'DX'],
  ['Ultrasound', 'US'], ['usg', 'US'], ['CT', 'CT'], ['ct', 'CT'], ['MRI', 'MR'],
] as const) {
  check(toDicomModality(ours) === dicom, `"${ours}" is ${dicom}`, toDicomModality(ours))
}

console.log('\nWhat a console is shown')
// A flat-panel announces DX and a plate reader CR; both take the chest X-ray
// somebody ordered, and neither should be shown the ultrasound list.
check(modalityMatches('DX', 'DX'), 'an X-ray console sees X-ray work')
check(modalityMatches('DX', 'CR'), 'a plate reader sees work scheduled as DX')
check(modalityMatches('CR', 'DX'), 'and the other way round')
check(!modalityMatches('US', 'DX'), 'an X-ray console is NOT shown an ultrasound')
check(!modalityMatches('CT', 'DX'), 'nor a CT')
check(modalityMatches('DX', null), 'a console that does not filter gets everything')
check(modalityMatches(null, 'DX'), 'an order whose modality we cannot read is never hidden')

console.log('\nWhen the machine asks for something we do not recognise')
// The E-COM console in Karur queries by several things in turn, its own AE
// title among them — "all worklist items assigned to this modality: DROC".
// Taking that literally would empty the department's list behind a screen that
// looks like it is working, which is far worse than one ultrasound too many.
for (const nonsense of ['DROC', 'XRAY', 'CHEST', '']) {
  check(modalityMatches('DX', nonsense),
    `"${nonsense || '(blank)'}" is not a filter, so nobody is hidden`)
}

console.log(failed === 0
  ? '\nAll worklist checks passed.\n'
  : `\n${failed} FAILED\n`)
process.exit(failed ? 1 : 0)
