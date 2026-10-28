/**
 * The patient-facing counter display (Bonrix BEI-CFD-001-USB, ~₹1,900).
 *
 * A 3.5" screen on a USB cable with no network of its own. The browser holds
 * the serial port and writes plain-text commands down the wire; the device
 * draws the QR itself from the `upi://` string we send. Uyirly's servers never
 * see it and there is nothing to pair, register or authenticate — which is
 * also why none of the display-token and PHI problems of a Wi-Fi tablet apply.
 *
 * Protocol (from the vendor's own WebSerial sample): 115200 8N1, fields
 * separated by `**`, each command newline-terminated.
 *
 * Browser support: WebSerial is Chromium-only (Chrome / Edge / Brave on
 * desktop) and needs a user gesture the first time. It is NOT available in the
 * Capacitor Android WebView, so the staff mobile app cannot drive the display —
 * every call here degrades to a clear "not supported" rather than throwing.
 *
 * The port lives in module scope on purpose: client-side navigation from one
 * bill to the next keeps it open, so a cashier connects once per browser and
 * not once per bill. A hard reload drops it and `adopt()` picks it back up.
 */

// Minimal WebSerial surface — the DOM lib does not ship these types.
interface SerialPortLike {
  open(options: { baudRate: number; dataBits: number; stopBits: number; parity: string }): Promise<void>
  close(): Promise<void>
  readonly writable: WritableStream<Uint8Array> | null
  readonly readable: ReadableStream<Uint8Array> | null
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>
  getPorts(): Promise<SerialPortLike[]>
}

const PORT_OPTIONS = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' } as const

let port: SerialPortLike | null = null

function serial(): SerialLike | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as unknown as { serial?: SerialLike }).serial ?? null
}

export function isSupported(): boolean {
  return serial() !== null
}

export function isConnected(): boolean {
  return port !== null
}

export type DisplayResult = { ok: true } | { ok: false; error: string }

const NOT_SUPPORTED =
  'This browser cannot talk to a USB display. Use Chrome or Edge on the counter computer.'

async function openPort(p: SerialPortLike): Promise<void> {
  await p.open(PORT_OPTIONS)
  port = p
  drain(p)
}

/**
 * The device can send bytes back. We read them only to stop the buffer filling
 * and stalling our writes, and deliberately act on none of them: a USB gadget
 * sitting on a public counter must never be able to tell Uyirly that a bill
 * was paid. Only a cashier with billing:write can do that.
 */
function drain(p: SerialPortLike): void {
  const readable = p.readable
  if (!readable) return
  void (async () => {
    const reader = readable.getReader()
    try {
      for (;;) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch {
      // Unplugged mid-shift. Writes will report it; nothing to do here.
    } finally {
      try { reader.releaseLock() } catch { /* already gone */ }
    }
  })()
}

/**
 * Re-adopt a port this browser was already granted, with no prompt. Safe to
 * call on every page load; returns false when there is nothing to adopt.
 */
export async function adopt(): Promise<boolean> {
  const s = serial()
  if (!s || port) return port !== null
  try {
    const [first] = await s.getPorts()
    if (!first) return false
    await openPort(first)
    return true
  } catch {
    port = null
    return false
  }
}

/** Needs a real user gesture — Chrome shows its device picker. */
export async function connect(): Promise<DisplayResult> {
  const s = serial()
  if (!s) return { ok: false, error: NOT_SUPPORTED }
  try {
    await openPort(await s.requestPort())
    return { ok: true }
  } catch (e) {
    port = null
    const msg = e instanceof Error ? e.message : String(e)
    // Closing the picker is a normal thing to do, not an error worth shouting.
    if (/No port selected|cancelled|aborted/i.test(msg)) return { ok: false, error: '' }
    return { ok: false, error: `Could not open the display: ${msg}` }
  }
}

export async function disconnect(): Promise<void> {
  const p = port
  port = null
  if (!p) return
  try { await p.close() } catch { /* already unplugged */ }
}

async function send(command: string): Promise<DisplayResult> {
  if (!serial()) return { ok: false, error: NOT_SUPPORTED }
  if (!port) return { ok: false, error: 'No counter display connected.' }
  const writable = port.writable
  if (!writable) return { ok: false, error: 'The counter display is not accepting data.' }
  try {
    const writer = writable.getWriter()
    try {
      await writer.write(new TextEncoder().encode(`${command}\n`))
    } finally {
      writer.releaseLock()
    }
    return { ok: true }
  } catch (e) {
    // Almost always the cable. Drop the handle so the next attempt re-adopts.
    port = null
    return { ok: false, error: `The counter display disconnected: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** `**` is the field separator, so it cannot survive inside a field. */
function field(value: string | number): string {
  return String(value).replace(/\*/g, ' ').replace(/[\r\n]+/g, ' ').trim()
}

function money(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2)
}

/** dd-mm-yyyy, the format the device's own sample uses. */
function deviceDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function showWelcome(hospitalName: string): Promise<DisplayResult> {
  return send(`WelcomeScreen**${field(hospitalName || 'Welcome')}`)
}

export function showTotal(input: {
  total: number; discount?: number; tax?: number; net: number
}): Promise<DisplayResult> {
  return send([
    'DisplayTotalScreen',
    money(input.total), money(input.discount ?? 0), money(input.tax ?? 0), money(input.net),
  ].join('**'))
}

export function showQr(input: { intent: string; amount: number; vpa: string }): Promise<DisplayResult> {
  return send(`DisplayQRCodeScreen**${field(input.intent)}**${money(input.amount)}**${field(input.vpa)}`)
}

/**
 * Shows "paid" on the patient's screen. Worth being clear-eyed about: without a
 * payment gateway this is only ever as true as the cashier who pressed the
 * button, because nothing told us the money arrived.
 */
export function showSuccess(input: {
  reference: string; billNo: string; at?: Date
}): Promise<DisplayResult> {
  return send([
    'DisplaySuccessQRCodeScreen',
    field(input.reference || '-'), field(input.billNo), deviceDate(input.at ?? new Date()),
  ].join('**'))
}

export function showCancelled(input: {
  reference?: string; billNo: string; at?: Date
}): Promise<DisplayResult> {
  return send([
    'DisplayCancelQRCodeScreen',
    field(input.reference || '-'), field(input.billNo), deviceDate(input.at ?? new Date()),
  ].join('**'))
}
