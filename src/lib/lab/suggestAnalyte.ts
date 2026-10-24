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

/** Codes compared without the punctuation vendors sprinkle through them. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * What instruments call things, where it differs from our catalogue.
 *
 * Built from the vocabulary of the machines actually in front of us rather
 * than from a standard, because the standards are what the vendors already
 * deviate from. Add to it as each new instrument is met.
 */
const ALIASES: Record<string, string[]> = {
  // Haematology — the Erba H360 and anything of its family
  HGB:   ['hb', 'hgb', 'haemoglobin', 'hemoglobin'],
  RBC:   ['rbc', 'redbloodcells', 'erythrocytes'],
  WBC:   ['wbc', 'tlc', 'leucocytes', 'leukocytes', 'totalleucocytecount'],
  PLT:   ['plt', 'platelets', 'plateletcount'],
  HCT:   ['hct', 'pcv', 'haematocrit', 'hematocrit', 'packedcellvolume'],
  MCV:   ['mcv'],
  MCH:   ['mch'],
  MCHC:  ['mchc'],
  RDW:   ['rdw', 'rdwcv', 'rdwsd'],
  MPV:   ['mpv'],
  LYMPH: ['lym', 'lymph', 'lympercent', 'lymphocytes', 'lymphocyte'],
  NEUT:  ['neut', 'gran', 'granpercent', 'granulocytes', 'neutrophils'],
  MONO:  ['mono', 'mid', 'midpercent', 'monocytes'],
  EOS:   ['eos', 'eosinophils'],
  BASO:  ['baso', 'basophils'],
  ESR:   ['esr'],

  // Biochemistry — Chem 5x, ECL 105, the electrolyte analyzer
  GLU:   ['glu', 'glucose', 'rbs', 'fbs'],
  UREA:  ['urea', 'bloodurea'],
  BUN:   ['bun', 'ureanitrogen'],
  CREAT: ['crea', 'creat', 'creatinine', 'scr'],
  UA:    ['ua', 'uricacid'],
  NA:    ['na', 'sodium'],
  K:     ['k', 'potassium'],
  CL:    ['cl', 'chloride'],
  CA:    ['ca', 'calcium', 'ica', 'ionisedcalcium', 'ionizedcalcium'],
  TBIL:  ['tbil', 'tbili', 'totalbilirubin', 'bilt'],
  DBIL:  ['dbil', 'dbili', 'directbilirubin', 'bild'],
  SGPT:  ['alt', 'sgpt', 'gpt'],
  SGOT:  ['ast', 'sgot', 'got'],
  ALP:   ['alp', 'alkphos', 'alkalinephosphatase'],
  TP:    ['tp', 'totalprotein'],
  ALB:   ['alb', 'albumin'],
  CHOL:  ['chol', 'tc', 'totalcholesterol'],
  TG:    ['tg', 'trig', 'triglycerides'],
  HDL:   ['hdl'],
  LDL:   ['ldl'],

  // Coagulation — ECL 105
  PT:    ['pt', 'prothrombintime'],
  INR:   ['inr'],
  APTT:  ['aptt', 'ptt'],
  FIB:   ['fib', 'fibrinogen'],
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
