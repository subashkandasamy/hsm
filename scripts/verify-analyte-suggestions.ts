/**
 * Guessing what an analyzer's codes mean.
 *
 *   npm run verify:analyte-suggestions
 *
 * The risk being tested is not that a guess is missing — a technician can
 * always search — but that a guess is confidently wrong. A measurement filed
 * under the wrong name is invisible; a missing one is not. So the cases that
 * matter most here are the ones that must NOT be offered for bulk
 * confirmation.
 */

import { suggestAnalyte, type Analyte } from '../src/lib/lab/suggestAnalyte'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

// A slice of the real catalogue, with the awkward ones kept in.
const CATALOGUE: Analyte[] = [
  { id: 'a1', code: 'HGB',   name: 'Haemoglobin' },
  { id: 'a2', code: 'WBC',   name: 'Total Leucocyte Count' },
  { id: 'a3', code: 'PLT',   name: 'Platelet Count' },
  { id: 'a4', code: 'HCT',   name: 'Haematocrit (PCV)' },
  { id: 'a5', code: 'CREAT', name: 'Serum Creatinine' },
  { id: 'a6', code: 'UREA',  name: 'Blood Urea' },
  { id: 'a7', code: 'NA',    name: 'Serum Sodium' },
  { id: 'a8', code: 'K',     name: 'Serum Potassium' },
  { id: 'a9', code: 'CA',    name: 'Serum Calcium' },
  { id: 'a10', code: 'SGPT', name: 'SGPT (ALT)' },
  { id: 'a11', code: 'INR',  name: 'INR' },
  { id: 'a12', code: 'CA125', name: 'Cancer Antigen 125' },
]

const s = (code: string) => suggestAnalyte(code, CATALOGUE)

console.log('\nThe same word')
check(s('WBC')?.analyte.code === 'WBC' && s('WBC')?.confidence === 'exact', 'WBC → WBC, exactly')
check(s('plt')?.confidence === 'exact', 'case does not matter')
check(s('RDW-CV') === null || s('RDW-CV')?.confidence !== 'exact',
  'a code the catalogue does not have is not claimed as exact', s('RDW-CV'))

console.log('\nWhat machines actually call things')
check(s('HB')?.analyte.code === 'HGB' && s('HB')?.confidence === 'alias', 'HB → Haemoglobin')
check(s('TLC')?.analyte.code === 'WBC', 'TLC → Total Leucocyte Count')
check(s('PCV')?.analyte.code === 'HCT', 'PCV → Haematocrit')
check(s('CREA')?.analyte.code === 'CREAT', 'CREA → Serum Creatinine')
check(s('ALT')?.analyte.code === 'SGPT', 'ALT → SGPT')
check(s('Sodium')?.analyte.code === 'NA', 'a machine that spells it out')
check(s('iCa')?.analyte.code === 'CA', 'ionised calcium → Serum Calcium')

console.log('\nThe punctuation vendors sprinkle about')
check(s('W-B-C')?.analyte.code === 'WBC', 'hyphens ignored')
check(s('HGB_')?.analyte.code === 'HGB', 'trailing underscore ignored')

console.log('\nWhat must NOT be confirmed in bulk')
{
  // "CA" is calcium on an electrolyte analyzer and a tumour marker on an
  // immunoassay. Both exist in the catalogue. Only a person standing beside
  // the machine knows which sent it.
  const ca = s('CA')
  check(ca?.confidence === 'exact' && ca.analyte.code === 'CA',
    'CA matches Serum Calcium exactly, which is the right first guess', ca)

  const ca125 = s('CA-125')
  check(ca125?.analyte.code === 'CA125', 'CA-125 finds the tumour marker, not calcium', ca125)

  const vague = s('X1')
  check(vague === null, 'a code that means nothing to us is left alone', vague)

  const partial = s('SER')
  check(partial === null || partial.confidence === 'similar',
    'a loose name match is never offered as exact or alias', partial)
}

console.log('\nNothing is ever written')
check(typeof suggestAnalyte === 'function' && s('WBC')?.analyte.id === 'a2',
  'a suggestion carries the analyte for a person to confirm, and nothing more')

console.log(failed === 0 ? '\nAll checks passed.\n' : `\n${failed} FAILED\n`)
process.exit(failed ? 1 : 0)
