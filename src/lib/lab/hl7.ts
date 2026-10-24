import type { AstmMessage, AstmResult } from './astm'
import { unframe } from './astm'

/**
 * Reading HL7 v2 from an analyzer.
 *
 * The other half of ASTM. Newer instruments — the Erba H360 among them, whose
 * only data port is Ethernet and which speaks HL7 over TCP/IP — send results
 * as an ORU^R01 message:
 *
 *   MSH|^~\&|H360|ERBA|LIS|HOSP|20261024120000||ORU^R01|9|P|2.3.1
 *   PID|1||UH-0042||RAVI^KUMAR||19900101|M
 *   OBR|1||2610240017|CBC^Complete Blood Count|||20261024115500
 *   OBX|1|NM|WBC^White Blood Cells||8.4|10*9/L|4.0-11.0|N|||F
 *   OBX|2|NM|HGB^Haemoglobin||14.1|g/dL|13-17|N|||F
 *
 *   MSH  who is talking, and the characters that separate everything
 *   PID  the patient
 *   OBR  the order, carrying the specimen id — our tube barcode
 *   OBX  one result each
 *
 * It returns the same shape the ASTM parser does, so everything downstream —
 * identifying the instrument, mapping codes, matching the sample, quarantine —
 * is shared. The protocol is a detail of how the numbers arrived, not of what
 * they mean.
 *
 * Lenient for the same reason as ASTM: a parser that refuses a message because
 * a vendor put a field somewhere unusual loses a real patient's result.
 *
 * ── Two traps specific to HL7 ──────────────────────────────────────────────
 *
 * The MSH segment is numbered differently from every other segment. MSH-1 IS
 * the field separator, so after splitting on it the array is shifted by one
 * against the field numbers: MSH-3 is index 2, while PID-5 is index 5. Getting
 * this wrong reads the wrong field and looks like it works.
 *
 * And a haematology analyzer sends its histograms in OBX segments alongside
 * the results, typed NA or ED. Those are waveform payloads, not measurements.
 * Treating them as results fills a patient's report with hundreds of numbers
 * and is the first thing that will happen on a real H360 if nobody is looking.
 */

interface Delims { field: string; component: string; repeat: string; escape: string; sub: string }

const DEFAULTS: Delims = { field: '|', component: '^', repeat: '~', escape: '\\', sub: '&' }

/**
 * MSH declares its own separators, as ASTM's header does: the character right
 * after "MSH" is the field separator, and the next field holds the rest.
 */
function readDelims(msh: string): Delims {
  const field = msh[3] ?? '|'
  const enc = msh.split(field)[1] ?? '^~\\&'
  return {
    field,
    component: enc[0] ?? '^',
    repeat: enc[1] ?? '~',
    escape: enc[2] ?? '\\',
    sub: enc[3] ?? '&',
  }
}

/**
 * HL7 escapes the delimiters inside values: \F\ for the field separator, \S\
 * for component, and so on. A result value rarely contains one, but a patient
 * name and a unit do — "10\S\9/L" is not a code anybody wants to map.
 */
function unescape(v: string, d: Delims): string {
  const e = d.escape
  return v
    .split(`${e}F${e}`).join(d.field)
    .split(`${e}S${e}`).join(d.component)
    .split(`${e}R${e}`).join(d.repeat)
    .split(`${e}T${e}`).join(d.sub)
    .split(`${e}E${e}`).join(e)
    // \X0D\ and friends: hex escapes, most often a line break inside a comment.
    .replace(new RegExp(`${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}X([0-9A-Fa-f]+)${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
      (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Value types that are not measurements.
 *
 *   NA  numeric array  — a histogram's points
 *   ED  encapsulated   — an embedded image or blob
 *   RP  reference      — a pointer to something stored elsewhere
 *
 * Skipped silently rather than warned about, because on a haematology analyzer
 * they arrive on every single sample and a warning per histogram would bury
 * the warnings that matter.
 */
const NOT_A_RESULT = new Set(['NA', 'ED', 'RP'])

export function parseHl7(raw: string): AstmMessage {
  const out: AstmMessage = {
    fingerprint: null, manufacturer: null, model: null,
    sampleId: null, patientName: null, results: [], warnings: [],
  }

  // MLLP wraps a message in <VT> … <FS><CR>; unframe() already drops the ASTM
  // control characters, and these two are all that is left.
  const text = unframe(raw).replace(/[\x0b\x1c]/g, '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) {
    out.warnings.push('Message was empty once framing was removed')
    return out
  }

  const msh = lines.find((l) => l.startsWith('MSH'))
  const d = msh ? readDelims(msh) : DEFAULTS
  const parts = (line: string) => line.split(d.field)
  const comps = (v: string | undefined) => (v ?? '').split(d.component)
  const clean = (v: string | undefined): string | null => {
    const t = unescape((v ?? '').trim(), d)
    return t === '' ? null : t
  }

  for (const line of lines) {
    const seg = line.slice(0, 3)
    const f = parts(line)

    switch (seg) {
      case 'MSH': {
        // Shifted by one against the field numbers — see the note above.
        // MSH-3 sending application, MSH-4 sending facility, MSH-9 type.
        const app = comps(f[2])
        const model = clean(app[0])
        const vendor = clean(comps(f[3])[0])
        out.model = model
        out.manufacturer = vendor
        // Same shape as the ASTM fingerprint so one library serves both.
        out.fingerprint = [model, vendor].filter(Boolean).join('^') || null
        if (!out.fingerprint) out.warnings.push('MSH did not identify the instrument')

        const type = comps(f[8])
        const kind = [clean(type[0]), clean(type[1])].filter(Boolean).join('^')
        // ORU is a result. An ACK or a query is not, and saying so is more use
        // than parsing it into an empty message.
        if (kind && !kind.startsWith('ORU')) {
          out.warnings.push(`Message type ${kind} is not a result message`)
        }
        break
      }

      case 'PID': {
        // PID-5 is the name, as XPN: family^given^middle.
        const n = comps(f[5]).map((c) => clean(c)).filter(Boolean)
        // Printed given-name-first, which is how a technician reads it.
        out.patientName = n.length ? [n[1], n[0]].filter(Boolean).join(' ') : null
        break
      }

      case 'OBR': {
        // OBR-3 is the filler order number — the laboratory's own id, which is
        // our tube barcode. OBR-2 is the placer's. Prefer 3, fall back to 2,
        // matching how the ASTM side prefers the laboratory's number.
        out.sampleId = out.sampleId
          ?? clean(comps(f[3])[0])
          ?? clean(comps(f[2])[0])
        break
      }

      case 'SPM': {
        // HL7 2.5 moved the specimen id here. Only used if OBR had none, so an
        // instrument that sends both does not get its sample id overwritten by
        // the later segment.
        if (!out.sampleId) out.sampleId = clean(comps(comps(f[2])[0])[0])
        break
      }

      case 'OBX': {
        const valueType = (clean(f[2]) ?? '').toUpperCase()
        if (NOT_A_RESULT.has(valueType)) break

        // How the machine was set up, not what it measured.
        //
        // An H360 reports its take mode, blood mode, test mode, reference
        // group and a free-text remark as observations, typed IS and coded in
        // the vendor's own private table. They are configuration — "CBC+3DIFF",
        // "General", "W" — and every one of them would otherwise land in a
        // technician's queue asking what it measures.
        //
        // Narrow on purpose: IS is HL7's type for a code from a user-defined
        // table, and a coding system numbered 99-something is by definition
        // local to the vendor. A measurement is neither. The raw message is
        // stored regardless, so a machine that surprises us can be replayed.
        if (valueType === 'IS' && /^99/.test((clean(comps(f[3])[2]) ?? ''))) break

        // OBX-3 is the observation identifier: id^text^system.
        //
        // A real Erba H360 sends `787-2^MCV^LN` — a LOINC number, the name,
        // and the coding system. Taking the first component would record two
        // dozen measurements as 787-2, 785-6, 786-4, leaving a technician to
        // work out which is which from a catalogue they do not have.
        //
        // So when the identifier is a standard code rather than the machine's
        // own mnemonic, the NAME is used as the code and the number is kept
        // beside it. Where a machine sends its own vocabulary — WBC, HGB —
        // nothing changes.
        const id = comps(f[3])
        const first = clean(id[0])
        const text = clean(id[1])
        const system = (clean(id[2]) ?? '').toUpperCase()

        // An identifier made only of digits says nothing to anybody: it is a
        // LOINC number (787-2) or the vendor's own channel (11003), and in
        // both cases the name sits beside it. A real H360 sends
        // `11003^PCT^99MRC` and `6690-2^WBC^LN` in the same message.
        //
        // Where the identifier is already a mnemonic — WBC, HGB — it stays,
        // because the text beside it is usually a long description nobody
        // wants as a code.
        const numeric = !!first && /^[\d-]+$/.test(first)
        const code = (numeric ? text ?? first : first) ?? clean(f[3])
        // Kept only when it is a real standard, not a vendor channel number.
        const standardCode = (system === 'LN' || system === 'LOINC') ? first : null
        const value = clean(f[5])

        if (!code) { out.warnings.push('Result with no test code, skipped'); break }
        if (value === null) {
          // A result the machine could not produce — a flagged sample, a short
          // draw. Worth a warning, because a technician will be looking for it.
          out.warnings.push(`${code} had no value, skipped`)
          break
        }

        const result: AstmResult = {
          code,
          standardCode,
          // A repeat separator in a value means several answers to one
          // question; the first is the reportable one.
          value: value.split(d.repeat)[0],
          unit: clean(comps(f[6])[0]),
          // Flags repeat too: the H360 sends `L~A` for a low result on an
          // abnormal sample. The first is the one about this measurement.
          abnormalFlag: clean((clean(f[8]) ?? '').split(d.repeat)[0]),
        }
        out.results.push(result)
        break
      }

      default:
        break
    }
  }

  if (!out.results.length) out.warnings.push('No result records found')
  return out
}
