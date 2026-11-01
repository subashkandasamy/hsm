/**
 * Name matching for the prescription safety checks.
 *
 * A pure module, separate from `actions/rxSafety.ts`, for two reasons: a
 * `'use server'` file may only export async functions, so these could not be
 * exported from there; and this is the arithmetic of a safety control, which
 * ought to be testable on its own. `npm run verify:rx-match` does that.
 */

/**
 * Does `needle` appear in `haystack` at a word boundary?
 *
 * Replaces plain `includes` in both directions (F-60). The old test was
 * `name.includes(allergen) || allergen.includes(name)` with a minimum length of
 * 3, so an allergy recorded as "ACE" matched par-**ace**-tamol. False positives
 * are not harmless in a safety system: they teach the doctor to dismiss the
 * banner, which is paid for by the true positives.
 *
 * Matching is per token, and a token may START or END with the needle rather
 * than only equal it — "benzylpenicillin" must still match an allergy to
 * "penicillin", which whole-token equality would have missed. The interior
 * match is what gets rejected, which is exactly the paracetamol case.
 *
 * A needle under 4 characters gets exact-token matching only, so "ACE" matches
 * a drug actually called "ACE" and nothing else.
 */
export function boundaryMatch(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (n.length < 3) return false
  const tokens = haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  for (const t of tokens) {
    if (t === n) return true
    if (n.length >= 4 && (t.startsWith(n) || t.endsWith(n))) return true
  }
  return false
}

/** Meaningful words in a free-text name. */
function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * Either direction, at a boundary, and phrase-aware.
 *
 * Allergens are recorded as free text, and the two on file are "Penicillin" and
 * **"Sulfa drugs"** — a phrase. Matching the whole phrase as one needle fails:
 * "sulfamethoxazole" does not start with "sulfa drugs". The old `includes` test
 * failed on it too and the class table in `rxSafety` happened to rescue it,
 * which is protection by coincidence rather than by design.
 *
 * So each side is also compared token by token. The token pass requires 4
 * characters, which is what keeps an allergy to "ACE inhibitors" from flagging
 * acebutolol — a beta blocker, not an ACE inhibitor — while still letting
 * "Sulfa drugs" reach sulfamethoxazole through its "sulfa" token.
 */
export function namesRelated(a: string, b: string): boolean {
  if (boundaryMatch(a, b) || boundaryMatch(b, a)) return true
  for (const t of tokens(b)) if (t.length >= 4 && boundaryMatch(a, t)) return true
  for (const t of tokens(a)) if (t.length >= 4 && boundaryMatch(b, t)) return true
  return false
}
