/**
 * Generate a UUIDv7 — time-ordered, monotonically increasing within the same
 * millisecond, and compatible with UUID columns. Use for high-volume insert
 * tables (audit_logs, bill_items, lab_order_items) so B-tree pages stay hot.
 *
 * Layout (RFC 9562):
 *   bytes 0-5  : 48-bit Unix timestamp in milliseconds (big-endian)
 *   byte  6    : 0x7? — version nibble (7) + 4 random bits
 *   byte  7    : 4 random bits (rand_a, continued)
 *   byte  8    : 0x8? — variant nibble (10xx) + 6 random bits
 *   bytes 9-15 : 56 random bits (rand_b)
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16)
  const ms = Date.now()

  // 48-bit timestamp, big-endian
  bytes[0] = (ms / 0x10000000000) & 0xff
  bytes[1] = (ms / 0x100000000)   & 0xff
  bytes[2] = (ms / 0x1000000)     & 0xff
  bytes[3] = (ms / 0x10000)       & 0xff
  bytes[4] = (ms / 0x100)         & 0xff
  bytes[5] =  ms                  & 0xff

  // Fill bytes 6-15 with random data, then fix version/variant nibbles
  const rand = crypto.getRandomValues(new Uint8Array(10))
  bytes.set(rand, 6)

  bytes[6] = (bytes[6] & 0x0f) | 0x70   // version = 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80   // variant = 10xx

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
