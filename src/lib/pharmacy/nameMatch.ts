/**
 * Deciding whether an invoice line and a catalogue entry are the same medicine.
 *
 * The old test compared the two strings whole:
 *
 *   b === cleaned ? 100 : cleaned.startsWith(b) || b.startsWith(cleaned) ? 80 : …
 *
 * which fails on the ordinary case, because a hospital writes the strength
 * differently from the catalogue:
 *
 *   file      GLYMIPRL M1
 *   catalogue Glymiprl M 1mg/500mg Tablet       <- a space, so no substring
 *
 * Measured on a real migration: of 712 item names, the app matched 42. Looking
 * them up by hand showed the catalogue did hold `Glymiprl M 1mg/500mg`,
 * `Telmiprl 40mg`, `Amoxprl CV`, `Aziprl 500mg`, `Cefiprl 200mg`, `Urimax 0.4`,
 * `Evion LC` and `Ecosprin 75` — each with its HSN and GST rate. The catalogue
 * was not the problem; the comparison was.
 *
 * ## The rule
 *
 * Compare word by word, and treat the first word — the brand — as the thing
 * that must agree exactly.
 *
 * That single requirement is what keeps this honest. A looser "first word
 * starts with" rule produced, on this same data:
 *
 *   ACCU-CHEK ACTIVE STRIP  ->  Accuzon 1g Injection     (a glucose strip vs an antibiotic)
 *   AERO NEB MASK ADULT     ->  Aerocort Inhaler         (a plastic mask vs a drug)
 *   AIRWAY GUDEL -1 (WHITE) ->  Airway 5mg/60mg Tablet   (a plastic airway vs a tablet)
 *
 * all of them wrong, and all of them the kind of wrong that ends with the
 * pharmacy dispensing against the wrong record. `accu` is not `accuzon`.
 *
 * After the brand word agrees, every remaining WORD of the query must appear in
 * the candidate. Numbers are exempt, because the strength is exactly what the
 * two sides write differently — `M1` against `M 1mg/500mg`. That exemption is
 * what makes the match possible; requiring the words is what stops `AIRWAY
 * GUDEL` from matching `Airway`, since `gudel` appears nowhere in it.
 */

/** Lowercase alphanumeric words. */
export function tokens(value: string): string[] {
  return (value ?? '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
}

/** Everything that is not a letter or digit removed — "m 1mg" and "M1" converge. */
export function squash(value: string): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const hasDigit = (t: string) => /\d/.test(t)

/**
 * Unit words, exempt from the "every word must appear" rule for the same reason
 * numbers are: the two sides write the strength differently. A file says
 * "ACICLOVIR 400 MG" and the catalogue says "Aciclovir 400 Tablet" — insisting
 * that the bare word "mg" appear in the candidate would reject a correct match.
 */
const UNITS = new Set(['mg', 'mcg', 'ml', 'g', 'gm', 'gms', 'kg', 'iu', 'ius', 'mgs', 'lit', 'ltr', 'l', 'units', 'unit'])
const isUnit = (t: string) => UNITS.has(t)

/** The numbers written in a name: "Urimax 0.4 Capsule" -> ["0.4"]. */
export function numbers(value: string): string[] {
  return ((value ?? '').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))
}

export const SURE = 95
export const LIKELY = 80
export const WEAK = 65

/**
 * How strongly `query` (an invoice line, already cleaned) names `candidate`
 * (a brand or molecule from the catalogue). 0 means not the same thing.
 *
 * 100  the same string once punctuation and spacing are ignored
 *  95  same brand word, and every strength in the query is in the candidate
 *  80  same brand word, strengths differ or are absent — flag it for a human
 *  65  the candidate appears inside the query as whole words
 */
export function nameMatchScore(query: string, candidate: string): number {
  const q = tokens(query)
  const c = tokens(candidate)
  if (!q.length || !c.length) return 0

  const qs = squash(query)
  const cs = squash(candidate)
  if (!qs || !cs) return 0
  if (qs === cs) return 100

  // ── The brand word has to agree exactly ──
  if (q[0] === c[0] && q[0].length >= 3) {
    // Every other WORD of the query must be present. Numbers are exempt: the
    // strength is written differently on each side and is judged below.
    const words = q.slice(1).filter((t) => !hasDigit(t) && !isUnit(t))
    const inCandidate = (w: string) => c.some((t) => t === w || t.startsWith(w) || w.startsWith(t))
    if (!words.every(inCandidate)) return 0

    // Strengths, compared as NUMBERS rather than as text.
    //
    // Text comparison fails on the ordinary pair "5mg" against "5", because the
    // catalogue often drops the unit — and it fails the other way too, since
    // "0.4mg" has a dot that word-splitting would break into "0" and "4mg".
    // Reading the digits out of each side avoids both.
    const qn = numbers(query)
    if (!qn.length) return LIKELY
    const cn = new Set(numbers(candidate))
    return qn.every((n) => cn.has(n)) ? SURE : LIKELY
  }

  // ── Whole-string containment, for names written as one word ──
  // Long enough that a short code cannot drag in an unrelated product.
  if (qs.length >= 6 && (cs.startsWith(qs) || qs.startsWith(cs))) return LIKELY

  // ── The candidate sits inside the query as whole words ──
  if (c.length >= 1 && c[0].length >= 4) {
    const joined = ' ' + q.join(' ') + ' '
    if (joined.includes(' ' + c.join(' ') + ' ')) return WEAK
  }
  return 0
}

/** The best candidate for a line, or null when nothing is good enough. */
export function bestMatch<T>(
  query: string,
  candidates: T[],
  namesOf: (c: T) => string[],
): { item: T; name: string; score: number } | null {
  let best: { item: T; name: string; score: number } | null = null
  for (const item of candidates) {
    for (const name of namesOf(item)) {
      if (!name) continue
      const score = nameMatchScore(query, name)
      if (score && (!best || score > best.score)) best = { item, name, score }
    }
  }
  return best && best.score >= WEAK ? best : null
}
