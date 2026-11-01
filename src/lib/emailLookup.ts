/**
 * Validating an email that will be used to LOOK SOMEBODY UP.
 *
 * `partnerAuth.ts` validated a login email with `e.includes('@')` and then
 * passed it to `.ilike('email', e)`, where `%` and `_` are wildcards. So `%@%`
 * matched every partner. It did not grant a login — `.maybeSingle()` errors on
 * more than one row, so the sign-in failed closed — but the same check guarded
 * the existence test in `registerPartner`, where a pattern matching several
 * rows reads as "no existing partner" and inserts a junk row.
 *
 * Two separate jobs, and both are needed:
 *
 * `isLookupEmail` rejects the metacharacters. Note that a plain email regex is
 * NOT sufficient here: `%@%.%` satisfies the usual
 * `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` and still matches every row, because `%` is a
 * perfectly ordinary character to that pattern. This one also excludes `%`,
 * `*` and `\` — none of which occurs in a real address people type — where `*`
 * matters because PostgREST treats it as an alias for `%` in `like`/`ilike`.
 *
 * `likeEscape` then makes what remains literal. `_` cannot simply be rejected:
 * `john_doe@example.com` is an everyday address, so it has to be escaped
 * instead. Postgres LIKE uses backslash as its default escape character, so
 * `\_` is a literal underscore with no ESCAPE clause needed.
 *
 * Why `ilike` at all, rather than `.eq()`: partner emails are not reliably
 * lowercase in storage. `registerPartner` lowercases before inserting, but
 * `platform.ts` (admin-created partners) stores `input.email?.trim()` with its
 * case intact — so an exact match would silently fail to find them. Fixing that
 * properly means normalising on write and backfilling existing rows, which is a
 * data change; neutralising the pattern needs neither.
 */

export const LOOKUP_EMAIL_PATTERN = /^[^\s@%*\\]+@[^\s@%*\\]+\.[^\s@%*\\]+$/

/** True when this is a plausible address AND carries no pattern metacharacters. */
export function isLookupEmail(value: string): boolean {
  return value.length <= 254 && LOOKUP_EMAIL_PATTERN.test(value)
}

/** Make every LIKE/ILIKE metacharacter in `value` literal. */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}
