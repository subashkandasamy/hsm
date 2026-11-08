import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * Counter PIN hashing (0272): scrypt with a per-PIN random salt, so a copied
 * table still costs real work per PIN, and compared in constant time.
 * Stored as "s1$<salt>$<hash>" (base64). Tested by `npm run verify:pin`.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 32)
  return ['s1', salt.toString('base64'), hash.toString('base64')].join('$')
}

export function verifyPin(pin: string, stored: string): boolean {
  const [v, saltB64, hashB64] = (stored ?? '').split('$')
  if (v !== 's1' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  if (expected.length !== 32) return false
  const actual = scryptSync(String(pin), Buffer.from(saltB64, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}
