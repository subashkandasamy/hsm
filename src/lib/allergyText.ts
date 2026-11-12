// Allergies typed in the free-text box at registration ("Penicillin, sulfa
// drugs") as separate allergens, so they reach the same places a structured
// allergy does — the doctor's banner, the Allergies tab and the prescription
// check. Registration never asks for a severity, so these carry none.

/** Prefix of the ids given to allergies that exist only as registration text. */
export const REGISTRATION_ALLERGY = 'registration:'

/** Words people type to mean "no allergies" — these are not allergens. */
const NONE = /^(nil|none|no|na|n\/a|nkda|nkfa|no known( drug)? allerg(y|ies)|not known|unknown|-+)$/i

export function splitAllergyText(text: string | null | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  for (const raw of text.split(/[,;\n/]|\s+and\s+|\s+&\s+/i)) {
    const a = raw.replace(/\s+/g, ' ').replace(/^[\s.\-–—]+|[\s.]+$/g, '').trim()
    if (a.length < 2 || NONE.test(a)) continue
    if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a)
  }
  return out
}

/** The registration allergens not already recorded as a structured allergy. */
export function registrationOnly(text: string | null | undefined, recorded: string[]): string[] {
  const have = recorded.map((r) => r.toLowerCase())
  return splitAllergyText(text).filter((a) => {
    const l = a.toLowerCase()
    return !have.some((h) => h === l || h.includes(l) || l.includes(h))
  })
}
