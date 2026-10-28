/**
 * The UPI payment instruction.
 *
 * A payment QR holds no picture and no account details — only one line of text
 * that a UPI app knows how to read: pay this id, this much. Both the counter
 * display (which draws the QR itself from this string) and the on-screen QR
 * read from here, so the instruction is built in exactly one place.
 *
 * Fields are the NPCI UPI deep-link ones: pa = payee address, pn = payee name,
 * am = amount, cu = currency, tn = note, tr = our own reference.
 */

/** tn is capped by the spec; longer notes are silently dropped by some apps. */
const MAX_NOTE = 50
/** tr is alphanumeric only, and some apps reject anything longer. */
const MAX_REF = 35

/** Mirrors the tenant_profiles_upi_vpa_shape check in migration 0233. */
export const VPA_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/

/**
 * On-screen QR size in px. Not a taste decision: measured in verify:upi, which
 * rasterises the longest realistic instruction and reads it back through a
 * camera-grade blur. 180px gave 3.2 pixels per module and failed; this gives
 * 4.2 and holds. Shrink it and the QR stops scanning on a glossy monitor.
 */
export const ON_SCREEN_QR_PX = 240

export function isValidVpa(vpa: string): boolean {
  return VPA_PATTERN.test(vpa.trim())
}

export interface UpiIntentInput {
  /** The hospital's own VPA — never Uyirly's. */
  vpa: string
  /** Shown to the patient in their UPI app before they confirm. */
  payeeName: string
  amount: number
  /** Free text the patient sees, and which lands in the bank narration. */
  note?: string | null
  /** Our reference, so the hospital can find this payment in their statement. */
  ref?: string | null
}

/**
 * Returns the `upi://pay?…` string, or null when the hospital has not set a
 * valid UPI id or the amount is not something we are willing to ask for.
 * Null is the signal to the UI that there is nothing to show — never a
 * half-built string, which would silently pay the wrong payee.
 */
export function buildUpiIntent(input: UpiIntentInput): string | null {
  const vpa = input.vpa?.trim() ?? ''
  if (!isValidVpa(vpa)) return null

  const amount = Math.round((input.amount ?? 0) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) return null

  const params = new URLSearchParams()
  params.set('pa', vpa)
  params.set('pn', (input.payeeName?.trim() || 'Hospital').slice(0, 99))
  params.set('am', amount.toFixed(2))
  params.set('cu', 'INR')

  const note = (input.note ?? '').trim().slice(0, MAX_NOTE)
  if (note) params.set('tn', note)

  // Alphanumeric only — a bill number with a dash or slash would otherwise be
  // echoed back mangled, or rejected outright.
  const ref = (input.ref ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, MAX_REF)
  if (ref) params.set('tr', ref)

  // URLSearchParams encodes spaces as '+', which UPI apps read literally.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
}
