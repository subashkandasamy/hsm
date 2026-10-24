/**
 * Our words for a machine, and DICOM's.
 *
 * The catalogue stores readable slugs — `usg`, `xray`, `mri` — which is right
 * for a doctor choosing a test. DICOM uses two-letter codes from a fixed list,
 * and a scanner asking for its worklist asks by that code: an ultrasound
 * queries for `US` and would match nothing at all against the string
 * "ULTRASOUND".
 *
 * Found by pointing the worklist endpoint at real demo data and reading what
 * came back, which is the only way this sort of mismatch shows itself.
 */

/** Our catalogue slug → the DICOM modality a machine calls itself. */
const TO_DICOM: Record<string, string> = {
  ct:             'CT',
  mri:            'MR',
  usg:            'US',
  echo:           'US',   // echocardiography is ultrasound to DICOM
  xray:           'DX',   // digital radiography; CR is treated as the same below
  mammography:    'MG',
  nuclear:        'NM',
  pet:            'PT',
  angiography:    'XA',
  interventional: 'XA',
  fluoroscopy:    'RF',
  ophthalmic:     'OP',
  dental:         'PX',   // panoramic; intra-oral (IO) treated as the same below
  dexa:           'BMD',
  special:        'OT',   // DICOM's own "other"
}

/**
 * Codes that mean the same thing to a hospital but differ by equipment age or
 * type. A plate reader announces CR and a flat-panel announces DX, and both are
 * taking the chest X-ray somebody ordered.
 */
const EQUIVALENT: Record<string, string[]> = {
  DX: ['DX', 'CR', 'RG'],
  PX: ['PX', 'IO', 'DX'],
  US: ['US'],
  BMD: ['BMD', 'DX'],
}

/**
 * The same modality written five ways.
 *
 * The master catalogue holds tidy slugs, but a hospital can type its own test
 * in and does: the demo tenant alone had "Ultrasound", "X-Ray", "ct", "CT" and
 * "xray" side by side. Normalising here is not tidiness — a value that fails to
 * map leaves the worklist unable to tell a CT order from an ultrasound.
 */
function canonical(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const ALIAS: Record<string, string> = {
    ultrasound: 'usg', us: 'usg', sonography: 'usg', usg: 'usg', scan: 'usg',
    xray: 'xray', dx: 'xray', cr: 'xray', radiograph: 'xray', radiography: 'xray',
    ctscan: 'ct', computedtomography: 'ct', ct: 'ct',
    mr: 'mri', mriscan: 'mri', magneticresonance: 'mri', mri: 'mri',
    mammogram: 'mammography', mg: 'mammography',
    echocardiography: 'echo', echo: 'echo',
    petct: 'pet', pet: 'pet',
    opg: 'dental', panoramic: 'dental',
    bonedensitometry: 'dexa', dexascan: 'dexa',
  }
  return ALIAS[k] ?? k
}

export function toDicomModality(slug: string | null | undefined): string | null {
  if (!slug) return null
  return TO_DICOM[canonical(slug)] ?? null
}

/**
 * Every code we are prepared to filter on. Built from the tables above rather
 * than written out again, so adding a modality in one place is enough.
 */
const KNOWN = new Set<string>([
  ...Object.values(TO_DICOM),
  ...Object.keys(EQUIVALENT),
  ...Object.values(EQUIVALENT).flat(),
])

/**
 * Would a machine announcing `asked` expect to be given work scheduled as
 * `scheduled`? Generous on purpose: a worklist that hides a patient because of
 * a code mismatch sends a technologist back to typing names by hand, which is
 * the problem this exists to remove.
 */
export function modalityMatches(scheduled: string | null, asked: string | null): boolean {
  if (!asked) return true            // a machine that does not filter gets everything
  if (!scheduled) return true        // we do not know, so do not hide it
  const a = asked.toUpperCase()
  const s = scheduled.toUpperCase()
  // A value we have never heard of is not a filter, it is a misunderstanding,
  // and acting on it would empty the list. The E-COM console asks by its own
  // AE title among other things — "Modality: DROC" — and taking that literally
  // would hide every patient in the department behind a blank screen, which is
  // far worse than showing one ultrasound too many.
  if (!KNOWN.has(a)) return true
  if (a === s) return true
  return (EQUIVALENT[s] ?? [s]).includes(a) || (EQUIVALENT[a] ?? [a]).includes(s)
}
