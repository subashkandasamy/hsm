/**
 * The conversation an analyzer expects before it will give you anything.
 *
 * ASTM E1381 is the low-level half of the standard — the handshake, not the
 * content. It is a strict back-and-forth, and a machine that does not hear the
 * right byte back will retry a few times and then give up, usually printing
 * "HOST NO RESPONSE" and throwing the results away.
 *
 *   analyzer          us
 *   ────────────────────────────
 *   <ENQ>          →              may I speak?
 *                  ←  <ACK>       go ahead
 *   <STX>1 …<ETX>C1C2<CR><LF> →   one frame
 *                  ←  <ACK>       got it, checksum matches
 *   …more frames…
 *   <EOT>          →              finished
 *
 * Two rules this file exists to keep:
 *
 * 1. Verify the checksum and answer honestly. A frame that fails gets <NAK>,
 *    and the analyzer sends it again. Acknowledging a corrupt frame would turn
 *    a transmission error into a wrong number on a patient's report — the one
 *    failure mode worth being slow about.
 *
 * 2. Understand nothing else. We assemble the text and hand it on. The records
 *    inside are the server's problem, which is what lets the raw message be
 *    stored before anything tries to interpret it.
 *
 * Deliberately lenient about everything that is not safety: frame numbers are
 * not checked in sequence, and a machine that simply dumps text with no
 * handshake at all still works, because some do.
 */

export const ENQ = 0x05
export const ACK = 0x06
export const NAK = 0x15
export const STX = 0x02
export const ETX = 0x03
export const ETB = 0x17
export const EOT = 0x04
export const CR = 0x0d
export const LF = 0x0a

export interface LinkEvents {
  /** A complete transmission, as text, ready to be queued. */
  onMessage: (raw: string) => void
  /** Bytes to send back to the instrument. */
  send: (data: Buffer) => void
  onWarn?: (message: string) => void
}

/**
 * Checksum of a frame's contents: every byte after STX up to and including the
 * terminator, summed modulo 256, written as two uppercase hex digits.
 */
export function checksum(bytes: Buffer): string {
  let sum = 0
  for (const b of bytes) sum = (sum + b) & 0xff
  return sum.toString(16).toUpperCase().padStart(2, '0')
}

export class AstmLink {
  private buf: Buffer = Buffer.alloc(0)
  private assembled: string[] = []
  private idleTimer: NodeJS.Timeout | null = null

  /**
   * How long to wait, holding text but with no <EOT>, before giving up and
   * queueing what we have. Some instruments never send EOT, and losing a real
   * measurement because a machine skipped a byte is the wrong trade.
   */
  private readonly idleMs: number

  constructor(private events: LinkEvents, idleMs = 15_000) {
    this.idleMs = idleMs
  }

  /** Feed bytes as they arrive off the socket or serial port. */
  push(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk])
    this.drain()
    this.resetIdle()
  }

  /** The line dropped. Anything held is still a real measurement. */
  close(): void {
    this.clearIdle()
    this.flush('connection closed')
  }

  private drain(): void {
    for (;;) {
      if (this.buf.length === 0) return

      const b = this.buf[0]

      if (b === ENQ) {
        this.buf = this.buf.subarray(1)
        this.events.send(Buffer.from([ACK]))
        continue
      }

      if (b === EOT) {
        this.buf = this.buf.subarray(1)
        this.flush('EOT')
        continue
      }

      // ACK/NAK from the other side, and stray line endings between frames.
      if (b === ACK || b === NAK || b === CR || b === LF) {
        this.buf = this.buf.subarray(1)
        continue
      }

      if (b === STX) {
        const end = this.findFrameEnd()
        if (end < 0) return                      // frame still arriving
        const frame = this.buf.subarray(0, end)
        this.buf = this.buf.subarray(end)
        this.handleFrame(frame)
        continue
      }

      // Not framed at all. Some analyzers open a socket and write plain record
      // lines. Take a whole line if we have one, otherwise wait for more.
      const nl = this.buf.indexOf(LF)
      if (nl < 0) {
        const cr = this.buf.indexOf(CR)
        if (cr < 0) return
        this.assembled.push(this.buf.subarray(0, cr).toString('latin1'))
        this.buf = this.buf.subarray(cr + 1)
        continue
      }
      this.assembled.push(this.buf.subarray(0, nl).toString('latin1').replace(/\r$/, ''))
      this.buf = this.buf.subarray(nl + 1)
    }
  }

  /**
   * Where the current frame ends: the terminator plus its two checksum digits.
   * Returns -1 while the frame is still on the wire.
   */
  private findFrameEnd(): number {
    for (let i = 1; i < this.buf.length; i++) {
      const b = this.buf[i]
      if (b === ETX || b === ETB) {
        // terminator + 2 checksum characters
        if (this.buf.length < i + 3) return -1
        return i + 3
      }
    }
    return -1
  }

  private handleFrame(frame: Buffer): void {
    // <STX> FN text <ETX|ETB> C1 C2
    const termIndex = frame.length - 3
    const terminator = frame[termIndex]
    const body = frame.subarray(1, termIndex + 1)    // includes the terminator
    const given = frame.subarray(termIndex + 1).toString('latin1').toUpperCase()
    const want = checksum(body)

    if (given !== want) {
      // Say so. The analyzer will send it again.
      this.events.onWarn?.(`Frame checksum ${given} did not match ${want}; asked for a resend`)
      this.events.send(Buffer.from([NAK]))
      return
    }

    // Drop the frame number, keep the records.
    let text = frame.subarray(2, termIndex).toString('latin1')

    // ETB means this frame is the middle of a record that is still arriving,
    // so the next frame's text continues it and nothing may be inserted.
    //
    // ETX means the record ended here. Records are supposed to carry their own
    // trailing CR, and most instruments send it — but some do not, and joining
    // frames end to end then fuses "…|P|1" and "P|1||||NAME" into one line
    // that parses as a single record. The sample id disappears and results
    // arrive attached to nobody. So on ETX, guarantee the separator.
    if (terminator === ETX && !text.endsWith('\r') && !text.endsWith('\n')) {
      text += '\r'
    }

    this.assembled.push(text)
    this.events.send(Buffer.from([ACK]))
  }

  private flush(reason: string): void {
    this.clearIdle()
    if (!this.assembled.length) return
    const raw = this.assembled.join('').replace(/\r/g, '\n')
    this.assembled = []
    if (reason !== 'EOT') this.events.onWarn?.(`Message closed by ${reason}, not EOT`)
    this.events.onMessage(raw)
  }

  private resetIdle(): void {
    this.clearIdle()
    if (!this.assembled.length) return
    this.idleTimer = setTimeout(() => this.flush('silence'), this.idleMs)
  }

  private clearIdle(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
  }
}
