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

import { suggestAnalyte, ALIASES, type Analyte } from '../src/lib/lab/suggestAnalyte'

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
  { id: 'a13', code: 'ICA',  name: 'Ionised Calcium' },
  { id: 'a14', code: 'NEUT_PCT', name: 'Neutrophils' },
  { id: 'a15', code: 'NEUT_ABS', name: 'Absolute Neutrophil Count' },
  { id: 'a16', code: 'TRIG', name: 'Triglycerides' },
  { id: 'a17', code: 'PT_SEC', name: 'Prothrombin Time' },
  { id: 'a18', code: 'TROP_I', name: 'Troponin I' },
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
check(s('iCa')?.analyte.code === 'ICA', 'ionised calcium → Ionised Calcium, never total calcium', s('iCa'))
check(s('TG')?.analyte.code === 'TRIG', 'TG → Triglycerides (the key was once a code that did not exist)', s('TG'))
check(s('PT')?.analyte.code === 'PT_SEC', 'PT → Prothrombin Time', s('PT'))
check(s('Tn-I')?.analyte.code === 'TROP_I', 'Tn-I (iChroma) → Troponin I', s('Tn-I'))

console.log('\nA percentage and a count are different words')
check(s('GRAN%')?.analyte.code === 'NEUT_PCT', 'GRAN% → Neutrophils %', s('GRAN%'))
check(s('GRAN#')?.analyte.code === 'NEUT_ABS', 'GRAN# → Absolute Neutrophil Count', s('GRAN#'))

console.log('\nEvery alias points at a code the catalogue really has')
{
  // The catalogue's codes as of migration 0278. A key outside it is a word
  // list that silently suggests nothing.
  const REAL = new Set(('ALB ALP BASO_ABS BASO_PCT BUN CL CREAT DBIL EOS_ABS EOS_PCT ESR FBG FT3 FT4 GLOB HBA1C HCT HDL HGB IBIL K LDL ' +
    'LYMPH_ABS LYMPH_PCT MCH MCHC MCV MENTZER MONO_ABS MONO_PCT MPV NA NEUT_ABS NEUT_PCT P_LCC P_LCR PCT PDW_CV PDW_SD PLT PPBG RBC RBSG ' +
    'RDW_CV RDW_SD RDWI SGOT SGPT TBIL TC TP TRIG TSH UA UREA WBC ' +
    'PT_SEC INR APTT_SEC FIB TROP_I T3 T4 BG_PH PCO2 PO2 HCO3 HCO3_STD BE_ECF BE_B TCO2 SO2 BG_THB BG_HCT BG_GLU LACT ICA AGAP OSMO').split(' '))
  const bad = Object.keys(ALIASES).filter((k) => !REAL.has(k))
  check(bad.length === 0, 'no alias key is a made-up code', bad)
}

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
