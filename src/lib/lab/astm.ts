/**
 * Reading what an analyzer actually sends.
 *
 * ASTM E1394 (LIS2-A2) is line-based and, usefully, self-describing: the header
 * record declares its own delimiters, so a parser does not have to be told what
 * they are. That is most of why a connector can identify an unknown instrument
 * rather than being configured for it.
 *
 * A transmission looks like this — the pipes and carets are only conventional,
 * which is exactly the point:
 *
 *   H|\^&|||BC-5130^Mindray|||||||P|1
 *   P|1||||PATIENT NAME
 *   O|1|2609230004||^^^CBC
 *   R|1|^^^WBC|8.4|10*9/L||N
 *   R|2|^^^HGB|14.1|g/dL||N
 *   L|1|N
 *
 *   H  who is talking, and which characters separate things
 *   P  the patient
 *   O  the order, carrying the sample barcode we printed
 *   R  one result each
 *   L  end of transmission
 *
 * Deliberately lenient. Vendors deviate from the standard constantly, and a
 * parser that refuses a message because a field is in the wrong place loses a
 * real patient's result. Anything not understood becomes a warning attached to
 * the parse, and the raw text is kept regardless.
 */

export interface AstmResult {
  /** The code the machine uses — HGB, WBC, GLU. Mapped to an analyte later. */
  code: string
  value: string
  unit: string | null
  /** The instrument's own flag: N normal, H high, L low, and vendor variants. */
  abnormalFlag: string | null
  /**
   * The standard identifier, where the machine sent one beside its own name.
   *
   * An Erba H360 reports MCV as `787-2^MCV^LN` — a LOINC number, the name,
   * and the coding system. The number is the stable identity and the name is
   * what a technician recognises, so both are kept.
   */
  standardCode?: string | null
  /**
   * The instrument's own normal range for this result, when it sends one —
   * HL7 OBX-7 or ASTM R-5, e.g. "3.50-9.50". An Erba H360 sends one with
   * every value. Used as the hospital's range when the hospital has not set
   * its own (lib/lab/ingest.ts), so results are flagged high/low.
   */
  refLow?: number | null
  refHigh?: number | null
}

export interface AstmMessage {
  /** Identity the instrument announces: "BC-5130^Mindray". The library key. */
  fingerprint: string | null
  manufacturer: string | null
  model: string | null
  /** The barcode the analyzer read off the tube. How results find a patient. */
  sampleId: string | null
  patientName: string | null
  results: AstmResult[]
  warnings: string[]
}

const EOT = '\x04'
const ENQ = '\x05'
const ACK = '\x06'

/** Strip the low-level framing so the records underneath can be read. */
export function unframe(raw: string): string {
  return raw
    // Each frame is <STX> seq … <ETX> checksum <CR><LF>; the sequence digit and
    // the checksum are transport concerns and mean nothing to the records.
    .replace(/\x02\d?/g, '')
    .replace(/\x03[0-9A-Fa-f]{0,2}/g, '')
    .replace(new RegExp(`[${EOT}${ENQ}${ACK}\\x17]`, 'g'), '')
    .replace(/\r/g, '\n')
}

/** ASTM or HL7? The first meaningful record says so. */
export function detectProtocol(raw: string): 'astm' | 'hl7' | null {
  const text = unframe(raw)
  for (const line of text.split('\n')) {
    const l = line.trim()
    if (!l) continue
    if (/^MSH[|^]/.test(l)) return 'hl7'
    if (/^H[|!~^]/.test(l)) return 'astm'
    // Some instruments lead with the patient or order record.
    if (/^[POQRLC]\|/.test(l)) return 'astm'
    break
  }
  return null
}

interface Delims { field: string; repeat: string; component: string; escape: string }

/**
 * The header declares its own delimiters, so read them rather than assume.
 * H|\^&  — the character after H is the field separator, then repeat,
 * component and escape. Instruments that differ are not broken; the standard
 * says to look.
 */
function readDelims(headerLine: string): Delims {
  const field = headerLine[1] ?? '|'
  const rest = headerLine.slice(2, 5)
  return {
    field,
    repeat: rest[0] ?? '\\',
    component: rest[1] ?? '^',
    escape: rest[2] ?? '&',
  }
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export function parseAstm(raw: string): AstmMessage {
  const out: AstmMessage = {
    fingerprint: null, manufacturer: null, model: null,
    sampleId: null, patientName: null, results: [], warnings: [],
  }

  const lines = unframe(raw).split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) {
    out.warnings.push('Message was empty once framing was removed')
    return out
  }

  const header = lines.find((l) => /^H[|!~^]/.test(l))
  const d = header ? readDelims(header) : { field: '|', repeat: '\\', component: '^', escape: '&' }
  const parts = (line: string) => line.split(d.field)
  const comps = (v: string | undefined) => (v ?? '').split(d.component)

  for (const line of lines) {
    const f = parts(line)
    switch (line[0]) {
      case 'H': {
        // Field 5 is NAME^VENDOR^VERSION on most instruments; some put the
        // model in 12 instead, so take whichever is present.
        const sender = comps(f[4])
        // The Erba ECL 105 sends `H|\\^&|||||||ECL 105`: H-5 empty, its name
        // in H-10. Fall back to the first field after the delimiters that reads
        // like a name (has a letter, is not a date or a version stamp), so the
        // machine is "ECL 105" rather than "?" (Karur, 9 Nov 2026).
        const named = f.slice(5, 14).map((x) => clean(comps(x)[0]))
          .find((x) => !!x && /[a-z]/i.test(x) && !/^\d{8,14}$/.test(x))
        const model = clean(sender[0]) ?? clean(f[11]) ?? named ?? null
        const vendor = clean(sender[1])
        out.model = model
        out.manufacturer = vendor
        out.fingerprint = [model, vendor].filter(Boolean).join('^') || null
        if (!out.fingerprint) out.warnings.push('Header did not identify the instrument')
        break
      }
      case 'P': {
        // Name lands in different fields across vendors; 5 is the common one.
        out.patientName = clean(f[5]) ?? clean(f[3])
        break
      }
      case 'O': {
        // The specimen id. Field 2 is the instrument's own number, field 3 the
        // one the laboratory gave it — our tube barcode — so prefer 3.
        out.sampleId = clean(comps(f[2])[0]) ?? clean(comps(f[3])[0])
        if (!out.sampleId) out.warnings.push('Order record carried no sample id')
        break
      }
      case 'R': {
        // Universal test id is ^^^CODE; some send the code bare.
        const idComps = comps(f[2])
        const code = clean(idComps[3]) ?? clean(idComps[0]) ?? clean(f[2])
        const value = clean(f[3])
        if (!code) { out.warnings.push('Result with no test code, skipped'); break }
        if (value === null) { out.warnings.push(`${code} had no value, skipped`); break }
        const range = parseRange(clean(f[5]))
        out.results.push({
          code,
          value,
          unit: clean(f[4]),
          abnormalFlag: clean(f[6]),
          ...range,
        })
        break
      }
      default:
        break
    }
  }

  out.results = distinctCodes(out.results)
  if (!out.results.length) out.warnings.push('No result records found')
  return out
}

/**
 * A reference range as instruments write it: "3.50-9.50", "0.108 - 0.282",
 * "<5", ">10", "3.5^9.5". Anything else — text, "-", a single number — is no
 * range at all, never a guess.
 */
export function parseRange(raw: string | null | undefined): { refLow: number | null; refHigh: number | null } {
  const none = { refLow: null, refHigh: null }
  if (!raw) return none
  const t = raw.trim().replace(/\s+/g, '')
  const num = '(-?\\d*\\.?\\d+)'
  let m = new RegExp(`^${num}[-^~]${num}$`).exec(t)
  if (m) {
    const lo = Number(m[1]); const hi = Number(m[2])
    return Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? { refLow: lo, refHigh: hi } : none
  }
  m = new RegExp(`^<=?${num}$`).exec(t)
  if (m) return { refLow: null, refHigh: Number(m[1]) }
  m = new RegExp(`^>=?${num}$`).exec(t)
  if (m) return { refLow: Number(m[1]), refHigh: null }
  return none
}

/**
 * One code per measurement within a message.
 *
 * The Erba ECL 105 reports a clotting test as three results that all carry
 * the same code — `APTT` 36.9 Sec, `APTT` 0.0 Ratio, `APTT` 0.0 No Unit (for
 * PT: seconds, ratio, INR). Mapped by code, all three landed on one analyte
 * and the LAST one won: a real 36.9 seconds overwritten by 0.0. Seen at Karur,
 * 9 Nov 2026, before any were mapped.
 *
 * The first keeps the plain code, so existing mappings are unchanged; each
 * repeat is told apart by its unit — `APTT (Ratio)`, `APTT (No Unit)` — and
 * can be mapped to its own analyte or left unmapped.
 */
export function distinctCodes<T extends { code: string; unit: string | null }>(results: T[]): T[] {
  const seen = new Map<string, number>()
  return results.map((r) => {
    const n = seen.get(r.code) ?? 0
    seen.set(r.code, n + 1)
    if (n === 0) return r
    let code = `${r.code} (${r.unit?.trim() || 'no unit'})`
    // Same code AND same unit twice: number them so neither is lost.
    if (seen.has(code)) code = `${code} #${n + 1}`
    seen.set(code, 1)
    return { ...r, code }
  })
}
