/**
 * Name matching for the prescription safety checks.
 *
 * A pure module, separate from `actions/rxSafety.ts`, for two reasons: a
 * `'use server'` file may only export async functions, so these could not be
 * exported from there; and this is the arithmetic of a safety control, which
 * ought to be testable on its own. `npm run verify:rx-match` does that.
 */

import type { RxWarning } from '@/lib/types'

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

// ── The check itself ────────────────────────────────────────────────────────

/**
 * Common allergy classes → member generics, so an allergy to "penicillin" flags
 * amoxicillin. Keyword matching — a safety aid, not exhaustive. Moved here from
 * `actions/rxSafety.ts` unchanged, so the whole decision can be tested.
 */
export const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'cloxacillin', 'augmentin', 'amoxiclav', 'piperacillin'],
  sulfa: ['sulfa', 'sulfamethoxazole', 'cotrimoxazole', 'septran', 'bactrim'],
  nsaid: ['ibuprofen', 'diclofenac', 'aspirin', 'naproxen', 'aceclofenac', 'ketorolac', 'nimesulide', 'indomethacin'],
  cephalosporin: ['cephalexin', 'cefixime', 'ceftriaxone', 'cefuroxime', 'cefpodoxime', 'cefepime'],
}

export interface RxInteractionRow { drug_a: string; drug_b: string; severity: string; description: string }

/** A drug in the check: the label as written, and every name it is known by (label + resolved generics, lower-case). */
export interface RxDrugNames { label: string; names: string[] }

/** Shown when the catalogue could not say what the drug is. Never 'major' — it must not block prescribing. */
export const UNIDENTIFIED_DRUG_MESSAGE =
  'Not found in the drug catalogue — allergy and interaction checks could not run for this name. Check it yourself.'

/**
 * The allergy / interaction decision, given everything already fetched.
 *
 * Every name a drug is known by is tested, not just its label — the label is
 * always one of them, so any warning the label alone would raise is still
 * raised. Resolution can only add warnings, never take one away. The matching
 * rules themselves (boundaryMatch, namesRelated, the class table) are unchanged.
 */
export function evaluateRxSafety(input: {
  drug: RxDrugNames & { identified: boolean }
  allergies: string[]
  others: Array<RxDrugNames & { provenance: string }>
  interactions: RxInteractionRow[]
}): RxWarning[] {
  const { drug, allergies, others, interactions } = input
  const names = drug.names.map((n) => n.toLowerCase().trim()).filter((n) => n.length >= 3)
  const warnings: RxWarning[] = []

  // ---- Allergy ----
  for (const recorded of allergies) {
    const allergen = (recorded || '').toLowerCase().trim()
    if (allergen.length < 3) continue
    let hit = names.some((n) => namesRelated(n, allergen))
    if (!hit) {
      for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
        const allergenInClass = allergen.includes(cls) || members.some((m) => allergen.includes(m))
        if (allergenInClass && names.some((n) => members.some((m) => n.includes(m)))) { hit = true; break }
      }
    }
    if (hit) warnings.push({ type: 'allergy', severity: 'major', message: `Patient is allergic to "${recorded}"` })
  }

  // ---- Interactions ----
  for (const row of interactions) {
    const a = row.drug_a.toLowerCase(), b = row.drug_b.toLowerCase()
    const hasA = names.some((n) => boundaryMatch(n, a))
    const hasB = names.some((n) => boundaryMatch(n, b))
    if (!hasA && !hasB) continue
    for (const other of others) {
      const otherNames = other.names.map((n) => n.toLowerCase().trim()).filter((n) => n.length >= 3)
      if ((hasA && otherNames.some((n) => boundaryMatch(n, b))) || (hasB && otherNames.some((n) => boundaryMatch(n, a)))) {
        warnings.push({
          type: 'interaction',
          severity: row.severity as RxWarning['severity'],
          message: `Interacts with ${other.label} (${other.provenance}): ${row.description}`,
        })
        break
      }
    }
  }

  // ---- Could not check ----
  if (!drug.identified) {
    warnings.push({ type: 'unrecognised', severity: 'minor', message: UNIDENTIFIED_DRUG_MESSAGE })
  }

  const seen = new Set<string>()
  return warnings.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)))
}
