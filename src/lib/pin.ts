/**
 * Counter PIN rules (PIN switch, 0272). Shared by the screens and the server,
 * so a PIN the screen accepts is one the server accepts.
 *
 * Four digits is short by design — it is typed many times a day at a counter.
 * What keeps it safe is not its length but where it works: only on a computer
 * an admin approved, with five wrong tries locking it. So the rules here only
 * refuse the PINs anyone would try first.
 *
 * Pure, so it can be tested: `npm run verify:pin`.
 */

export const PIN_LENGTH = 4
export const PIN_MAX_ATTEMPTS = 5
/** Wrong PINs on one computer, across all staff, before it pauses. */
export const DEVICE_MAX_ATTEMPTS = 20
export const DEVICE_LOCK_MINUTES = 15
/** Minutes without a click or key before a shared counter locks itself. */
export const COUNTER_IDLE_MINUTES = 5

/** Why a PIN cannot be used, or null when it is fine. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `The PIN must be exactly ${PIN_LENGTH} digits.`
  if (/^(\d)\1+$/.test(pin)) return 'All the same digit is too easy to guess.'
  const d = pin.split('').map(Number)
  const step = d[1] - d[0]
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) {
    return 'A run like 1234 or 4321 is too easy to guess.'
  }
  if (pin.slice(0, 2) === pin.slice(2)) return 'A repeated pair like 1212 is too easy to guess.'
  return null
}
