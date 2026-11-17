/**
 * Printing on the hospital's own letterhead paper (migration 0307).
 *
 * With it on, a document leaves the top and bottom of every page blank for what
 * is already printed there, and draws no hospital header of its own. Portrait
 * A4 documents only: labels, wristbands and ID cards use their own stock, the
 * PC&PNDT returns are government formats, and the drug chart, OT list and ICU
 * chart print sideways, which a portrait letterhead does not fit.
 */

/** The documents that can go on letterhead, as the settings page lists them. */
export const LETTERHEAD_DOCS = [
  { key: 'prescription', label: 'OPD prescription' },
  { key: 'lab',          label: 'Lab report' },
  { key: 'radiology',    label: 'Radiology report' },
  { key: 'discharge',    label: 'Discharge / death summary' },
  { key: 'admission',    label: 'IPD admission record' },
  { key: 'bill',         label: 'Bills and IPD final bill' },
  { key: 'receipt',      label: 'Advance receipt' },
  { key: 'consent',      label: 'Declaration & consent' },
  { key: 'emergency',    label: 'Emergency record' },
  { key: 'operation',    label: 'Operation record' },
  { key: 'referral',     label: 'Referral letter' },
  { key: 'mlc',          label: 'Medico-legal sheets' },
] as const

export type LetterheadDoc = typeof LETTERHEAD_DOCS[number]['key']

export const LETTERHEAD_TOP_MM = { min: 0, max: 120, default: 40 }
export const LETTERHEAD_BOTTOM_MM = { min: 0, max: 80, default: 0 }

/** The blank space a page keeps for the letterhead, in mm and in PDF points. */
export interface Paper { topMm: number; bottomMm: number; top: number; bottom: number }

type Settings = {
  letterhead_paper?: boolean | null
  letterhead_top_mm?: number | null
  letterhead_bottom_mm?: number | null
  letterhead_plain_docs?: string[] | null
} | null | undefined

const PT_PER_MM = 72 / 25.4

export function paperOf(topMm: number, bottomMm: number): Paper {
  return { topMm, bottomMm, top: topMm * PT_PER_MM, bottom: bottomMm * PT_PER_MM }
}

/** The space to leave on this document, or null when it prints on plain paper with Uyirly's header. */
export function letterheadFor(profile: Settings, doc: LetterheadDoc): Paper | null {
  if (!profile?.letterhead_paper) return null
  if ((profile.letterhead_plain_docs ?? []).includes(doc)) return null
  return paperOf(profile.letterhead_top_mm ?? LETTERHEAD_TOP_MM.default, profile.letterhead_bottom_mm ?? LETTERHEAD_BOTTOM_MM.default)
}

/**
 * A copy that leaves as a file — downloaded to be sent on, or opened from the
 * patient portal — has no letterhead paper under it, so it keeps the full
 * hospital header whatever the setting says.
 */
export function asFileCopy<T extends Settings>(profile: T): T {
  return profile ? ({ ...profile, letterhead_paper: false } as T) : profile
}

/** The "Download PDF" link (?download=1), as opposed to opening it to print. */
export const isDownload = (request: Request) => new URL(request.url).searchParams.get('download') === '1'
