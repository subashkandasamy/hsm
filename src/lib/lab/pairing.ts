/**
 * Pairing codes, shaped for somebody reading one aloud in a laboratory.
 *
 * The alphabet omits every character that gets misread or mistyped: no O or 0,
 * no I, L or 1, no U against V, no S against 5. What is left is unambiguous in
 * the fonts an installer will use, which matters because the alternative is a
 * support call.
 *
 * Eight characters from a 24-letter alphabet is about 37 bits. That is thin for
 * a permanent secret and ample for one that is single-use, short-lived and
 * exchanged immediately for a real token.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRTWXY346789'

export const PAIRING_TTL_MINUTES = 60

/** Formatted for reading aloud: XXXX-XXXX. */
export function generatePairingCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  // Rejection-free but very slightly biased; irrelevant for a code that lives
  // an hour, and worth it to keep this dependency-free on both runtimes.
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

/**
 * What the user typed, as the database stores it.
 *
 * People add spaces, drop the hyphen, and hold shift inconsistently. None of
 * that should be the difference between a working install and a support call,
 * so it is all normalised away before the lookup.
 */
export function normalisePairingCode(input: string): string {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (stripped.length !== 8) return ''
  return `${stripped.slice(0, 4)}-${stripped.slice(4)}`
}
