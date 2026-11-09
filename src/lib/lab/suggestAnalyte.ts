/**
 * Guessing what an analyzer's code means.
 *
 * An instrument has its own vocabulary. One calls haemoglobin HGB, another HB,
 * a third RBC-HGB. Somebody has to say which is which, once per machine — but
 * most of the time the answer is obvious, and making a technician search a
 * dropdown twenty-four times for answers a computer can see is how a five
 * minute job becomes an afternoon and a mis-click.
 *
 * ── Why this suggests and never decides ───────────────────────────────────
 *
 * A measurement filed under the wrong name is invisible. A missing one is not.
 * So nothing here writes anything: it offers an answer with how sure it is,
 * and a person confirms. The only thing offered for bulk confirmation is an
 * exact match, where the machine and the catalogue are using the same word.
 */

export type Confidence = 'exact' | 'alias' | 'similar'

export interface Analyte {
  id: string
  code: string
  name: string
  unit_ucum?: string | null
}

export interface Suggestion {
  analyte: Analyte
  confidence: Confidence
  /** Shown to the person, so they can judge the guess rather than trust it. */
  because: string
}

/**
 * Codes compared without the punctuation vendors sprinkle through them — except
 * the two marks that carry meaning: an H360 sends GRAN% and GRAN#, a percentage
 * and a count, and stripping both made them the same word.
 */
const norm = (s: string) => s.toLowerCase()
  .replace(/%/g, 'percent').replace(/#/g, 'abs')
  .replace(/[^a-z0-9]/g, '')

/**
 * What instruments call things, where it differs from our catalogue.
 *
 * Keyed by the catalogue's REAL codes. Until Nov 2026 half of these keys
 * (NEUT, LYMPH, CHOL, TG, RDW, CA, GLU, PT, INR, APTT) were codes the catalogue
 * did not have, so a machine's "TG" or "Neut%" was offered nothing at all.
 * scripts/verify-analyte-suggestions.ts now fails if a key is not a real code.
 *
 * Built from the vocabulary of the machines actually in front of us rather
 * than from a standard, because the standards are what the vendors already
 * deviate from. Add to it as each new instrument is met. A machine we have
 * fully read belongs in the shared library (device_library) instead, where
 * its codes map themselves.
 */
export const ALIASES: Record<string, string[]> = {
  // Haematology — the Erba H360 and anything of its family
  HGB:   ['hb', 'hgb', 'haemoglobin', 'hemoglobin'],
  RBC:   ['rbc', 'redbloodcells', 'erythrocytes'],
  WBC:   ['wbc', 'tlc', 'leucocytes', 'leukocytes', 'totalleucocytecount'],
  PLT:   ['plt', 'platelets', 'plateletcount'],
  HCT:   ['hct', 'pcv', 'haematocrit', 'hematocrit', 'packedcellvolume'],
  MCV:   ['mcv'],
  MCH:   ['mch'],
  MCHC:  ['mchc'],
  RDW_CV:['rdw', 'rdwcv'],
  RDW_SD:['rdwsd'],
  MPV:   ['mpv'],
  PCT:   ['pct', 'plateletcrit'],
  PDW_CV:['pdwcv', 'pdw'],
  PDW_SD:['pdwsd'],
  P_LCR: ['plcr'],
  P_LCC: ['plcc'],
  // Anaemia discriminant indices. A haematology analyzer that calculates them
  // marks them research-use-only; whether to report them is the hospital's
  // decision, so they are offered like any other code and confirmed by hand.
  MENTZER:['mentzr', 'mentzer', 'mentzerindex'],
  RDWI:  ['rdwi'],
  // Differential. A 3-part analyzer reports granulocytes and mid cells; the
  // convention every laboratory running one uses is neutrophils and
  // monocytes — offered as a guess, never confirmed in bulk.
  NEUT_PCT:  ['neutpercent', 'neut', 'neutrophils', 'granpercent', 'gran'],
  NEUT_ABS:  ['neutabs', 'granabs', 'anc'],
  LYMPH_PCT: ['lympercent', 'lymphpercent', 'lym', 'lymph', 'lymphocytes'],
  LYMPH_ABS: ['lymabs', 'lymphabs', 'alc'],
  MONO_PCT:  ['monopercent', 'mono', 'monocytes', 'midpercent', 'mid'],
  MONO_ABS:  ['monoabs', 'midabs', 'amc'],
  EOS_PCT:   ['eospercent', 'eos', 'eosinophils'],
  EOS_ABS:   ['eosabs', 'aec'],
  BASO_PCT:  ['basopercent', 'baso', 'basophils'],
  BASO_ABS:  ['basoabs', 'abc'],
  ESR:   ['esr'],

  // Biochemistry
  FBG:   ['fbs', 'fbg', 'fastingglucose'],
  RBSG:  ['rbs', 'randomglucose'],
  PPBG:  ['ppbs', 'ppbg'],
  UREA:  ['urea', 'bloodurea'],
  BUN:   ['bun', 'ureanitrogen'],
  CREAT: ['crea', 'creat', 'creatinine', 'scr'],
  UA:    ['ua', 'uricacid'],
  NA:    ['na', 'sodium'],
  K:     ['k', 'potassium'],
  CL:    ['cl', 'chloride'],
  // Ionised calcium only. Total calcium (mg/dL) and ionised (mmol/L) are
  // different tests; "Ca" alone is left for a person, who knows the machine.
  ICA:   ['ica', 'ionisedcalcium', 'ionizedcalcium'],
  TBIL:  ['tbil', 'tbili', 'totalbilirubin', 'bilt'],
  DBIL:  ['dbil', 'dbili', 'directbilirubin', 'bild'],
  SGPT:  ['alt', 'sgpt', 'gpt'],
  SGOT:  ['ast', 'sgot', 'got'],
  ALP:   ['alp', 'alkphos', 'alkalinephosphatase'],
  TP:    ['tp', 'totalprotein'],
  ALB:   ['alb', 'albumin'],
  TC:    ['chol', 'tc', 'totalcholesterol'],
  TRIG:  ['tg', 'trig', 'triglycerides'],
  HDL:   ['hdl'],
  LDL:   ['ldl'],
  HBA1C: ['hba1c', 'a1c', 'glycatedhaemoglobin'],

  // Coagulation — Erba ECL 105
  PT_SEC:   ['pt', 'prothrombintime', 'ptsec'],
  INR:      ['inr', 'ptinr'],
  APTT_SEC: ['aptt', 'ptt', 'apttsec'],
  FIB:      ['fib', 'fibrinogen'],

  // Immunoassay — Boditech iChroma II
  TROP_I: ['tni', 'ctni', 'tropi', 'troponini', 'hstni'],
  T3:     ['t3', 'tt3', 'totalt3'],
  T4:     ['t4', 'tt4', 'totalt4'],
  FT3:    ['ft3', 'freet3'],
  FT4:    ['ft4', 'freet4'],
  TSH:    ['tsh', 'hstsh'],

  // Blood gas — EDAN i15. Offered, never bulk-confirmed: "pH" is also urine.
  BG_PH:   ['ph'],
  PCO2:    ['pco2'],
  PO2:     ['po2'],
  HCO3:    ['hco3', 'hco3act', 'bicarbonate'],
  HCO3_STD:['hco3std', 'sbc'],
  BE_ECF:  ['beecf', 'be'],
  BE_B:    ['beb'],
  TCO2:    ['tco2', 'ctco2'],
  SO2:     ['so2', 'so2est'],
  BG_THB:  ['thb', 'thbest', 'cthb'],
  LACT:    ['lac', 'lact', 'lactate'],
  AGAP:    ['angap', 'aniongap'],
  OSMO:    ['mosm', 'osm', 'osmolarity'],
}

/** code in our catalogue → the words a machine might use for it. */
const ALIAS_LOOKUP = new Map<string, string>()
for (const [canonical, words] of Object.entries(ALIASES)) {
  for (const w of words) ALIAS_LOOKUP.set(w, canonical)
}

/**
 * The best guess for one analyzer code, or null when there isn't a sensible
 * one — which is a perfectly good answer and better than a confident wrong.
 */
export function suggestAnalyte(
  analyzerCode: string, analytes: Analyte[],
): Suggestion | null {
  const code = norm(analyzerCode)
  if (!code) return null

  // 1. The same word. Nothing to interpret.
  const exact = analytes.find((a) => norm(a.code) === code)
  if (exact) return { analyte: exact, confidence: 'exact', because: 'the same code' }

  // 2. A word we have met before on some instrument.
  const canonical = ALIAS_LOOKUP.get(code)
  if (canonical) {
    const hit = analytes.find((a) => norm(a.code) === norm(canonical))
    if (hit) return { analyte: hit, confidence: 'alias', because: `machines call this ${analyzerCode}` }
  }

  // 3. The catalogue's name contains the code as a whole word, or the other
  //    way round. Offered, never bulk-confirmed: "CA" matching "Calcium" is
  //    right, and "CA" matching "Cancer Antigen" is not, and only a person
  //    standing in the laboratory knows which machine sent it.
  const byName = analytes.find((a) => {
    const n = norm(a.name)
    return n === code || n.startsWith(code) || norm(a.code).startsWith(code)
  })
  if (byName) return { analyte: byName, confidence: 'similar', because: `looks like ${byName.name}` }

  return null
}

/** Suggestions for a whole queue of codes, keyed however the caller needs. */
export function suggestAll<T extends { mapping_id: string; analyzer_code: string }>(
  codes: T[], analytes: Analyte[],
): Map<string, Suggestion> {
  const out = new Map<string, Suggestion>()
  for (const c of codes) {
    const s = suggestAnalyte(c.analyzer_code, analytes)
    if (s) out.set(c.mapping_id, s)
  }
  return out
}
