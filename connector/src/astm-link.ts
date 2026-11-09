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
 *
 * ── MLLP, for the machines that speak HL7 ──────────────────────────────────
 *
 * Newer instruments do not use the ASTM handshake at all. They open a socket
 * and send HL7 wrapped in MLLP — <VT> message <FS><CR> — and expect an HL7
 * acknowledgement back.
 *
 * This matters more than it looks. Without MLLP the bytes fall through to the
 * unframed path, where nothing marks the end of a message, so it is only
 * released on the idle timeout: fifteen seconds late, and if a second sample
 * is sent inside that window **both patients' results are concatenated into
 * one message**. That is precisely the failure this class exists to prevent.
 *
 * The Erba H360 is the instrument that forced this. It sends HL7 over MLLP,
 * and its own "Communication Acknowledgement" setting is normally turned off
 * because it cannot read a standard ACK — but we send one regardless, because
 * an instrument waiting for an acknowledgement that never comes stalls, and
 * sending one costs nothing.
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
/** MLLP: <VT> message <FS><CR>. How HL7 is framed on a TCP socket. */
export const VT = 0x0b
export const FS = 0x1c

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

/**
 * Bytes as a person can read them: printable text as is, control characters
 * named (<ENQ>, <STX>, <VT>…), anything else as <xx>. For the log, so a new
 * analyzer's way of talking can be read off a photograph of the screen.
 */
const NAMES: Record<number, string> = {
  0x02: 'STX', 0x03: 'ETX', 0x04: 'EOT', 0x05: 'ENQ', 0x06: 'ACK', 0x0a: 'LF',
  0x0b: 'VT', 0x0d: 'CR', 0x15: 'NAK', 0x17: 'ETB', 0x1c: 'FS',
}
export function readable(bytes: Buffer, max = 240): string {
  let out = ''
  for (const b of bytes.subarray(0, max)) {
    out += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `<${NAMES[b] ?? b.toString(16).padStart(2, '0')}>`
  }
  return bytes.length > max ? `${out}… (${bytes.length} bytes)` : out
}

export class AstmLink {
  private buf: Buffer = Buffer.alloc(0)
  private assembled: string[] = []
  private idleTimer: NodeJS.Timeout | null = null
  /** The first bytes this connection sent, kept for the log at close. */
  private opening: Buffer = Buffer.alloc(0)
  private total = 0

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
    this.total += chunk.length
    if (this.opening.length < 512) this.opening = Buffer.concat([this.opening, chunk]).subarray(0, 512)
    this.buf = Buffer.concat([this.buf, chunk])
    this.drain()
    this.resetIdle()
  }

  /** How many bytes arrived, and how they began — for the log at close. */
  summary(): { bytes: number; began: string } {
    return { bytes: this.total, began: readable(this.opening) }
  }

  /**
   * The line dropped. Anything held is still a real measurement.
   *
   * Including bytes that never made a complete frame — an MLLP message with
   * no <FS>, a frame with no <ETX>, text with no line ending. Those used to be
   * thrown away here without a word, which is how a new analyzer (the Erba
   * ECL 105 at Karur, 9 Nov 2026) could connect, send, disconnect and leave
   * nothing behind to say what it had sent. Now they are queued as a message
   * like any other, so the raw text reaches Uyirly and can be read.
   */
  close(): void {
    this.clearIdle()
    if (this.buf.length) {
      const leftover = this.buf
      this.buf = Buffer.alloc(0)
      this.events.onWarn?.(`Connection closed with ${leftover.length} unrecognised byte(s), kept: ${readable(leftover)}`)
      this.assembled.push(leftover.toString('latin1'))
    }
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

      // MLLP: everything up to <FS><CR> is one complete HL7 message, and the
      // end marker is explicit — no idle timeout, no risk of two samples
      // running together.
      if (b === VT) {
        const end = this.findMllpEnd()
        if (end < 0) return                      // message still arriving
        const body = this.buf.subarray(1, end).toString('latin1')
        this.buf = this.buf.subarray(end + (this.buf[end + 1] === CR ? 2 : 1))
        this.emitHl7(body)
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
      //
      // The terminator is put back on. flush() joins with '' because a FRAMED
      // record arrives carrying its own CR, and without one here every record
      // ran into the next: an analyzer that simply dumps ASTM produced a
      // single unsplittable line, and a parser that splits on newlines found
      // one header and no results. Every measurement in the message was lost,
      // and the test only checked that a code appeared somewhere in the text.
      const nl = this.buf.indexOf(LF)
      if (nl < 0) {
        const cr = this.buf.indexOf(CR)
        if (cr < 0) return
        this.assembled.push(`${this.buf.subarray(0, cr).toString('latin1')}\r`)
        this.buf = this.buf.subarray(cr + 1)
        continue
      }
      this.assembled.push(`${this.buf.subarray(0, nl).toString('latin1').replace(/\r$/, '')}\r`)
      this.buf = this.buf.subarray(nl + 1)
    }
  }

  /** Index of the <FS> that ends an MLLP message, or -1 while it arrives. */
  private findMllpEnd(): number {
    for (let i = 1; i < this.buf.length; i++) if (this.buf[i] === FS) return i
    return -1
  }

  /**
   * One HL7 message, complete.
   *
   * Released immediately rather than appended to `assembled`, because MLLP
   * said where it ended and waiting would only risk the next one joining it.
   */
  private emitHl7(body: string): void {
    this.clearIdle()
    const text = body.replace(/\r/g, '\n').trim()
    if (!text) return
    this.events.onMessage(text)
    this.events.send(this.hl7Ack(text))
  }

  /**
   * An HL7 acknowledgement, wrapped in MLLP.
   *
   * MSA|AA means "accepted". It is echoed against the message control id from
   * MSH-10 so the instrument can match it to what it sent; an instrument that
   * cannot read our ACK ignores it, which is the H360's documented behaviour
   * and harmless. Not sending one at all is what makes a machine stall.
   */
  private hl7Ack(message: string): Buffer {
    const msh = message.split('\n').find((l) => l.startsWith('MSH')) ?? ''
    const sep = msh[3] ?? '|'
    const f = msh.split(sep)
    // MSH is numbered from its own separator, so MSH-10 is index 9.
    const controlId = (f[9] ?? '').trim() || '1'
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const ack = [
      ['MSH', '^~\\&', 'UYIRLY', 'CONNECTOR', f[2] ?? '', f[3] ?? '',
       stamp, '', 'ACK', controlId, 'P', (f[11] ?? '2.3').trim() || '2.3'].join('|'),
      ['MSA', 'AA', controlId].join('|'),
    ].join('\r')
    return Buffer.concat([
      Buffer.from([VT]),
      Buffer.from(ack, 'latin1'),
      Buffer.from([CR, FS, CR]),
    ])
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
