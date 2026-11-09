import type { AstmMessage, AstmResult } from './astm'
import { namedResults, unframe } from './astm'

/**
 * Urine strip readers that send their printout as plain text.
 *
 * Read at Karur, 9 Nov 2026: an Erba Lachema LAURA Smart, on a USB-serial
 * cable at 115200 baud, sends exactly what it prints — no ASTM records, no
 * HL7 — wrapped in <STX> … <ETX>:
 *
 *   DekaPHAN LAURA
 *   Seq.No:  0002
 *   ID:  A
 *   09.11.2026 16:13
 *   ................
 *   *BLD     10 Ery/µl
 *    LEU     NEG
 *    UBG     NORM
 *   *PRO     TRACE
 *    pH      6.5
 *   *NIT     POS
 *    SG      1.015
 *
 * A leading * is the reader's own "outside normal" mark. The ID is whatever
 * the technician typed before the strip — the tube's barcode, when the
 * laboratory is set up for Uyirly.
 *
 * Values are kept as the machine wrote them, with only its abbreviations
 * spelled out (NEG → Negative). A concentration such as "10 Ery/µl" is NOT
 * turned into a grade: that conversion depends on the strip lot's chart, and
 * a wrong "1+" looks exactly like a right one.
 */

const WORDS: Record<string, string> = {
  NEG: 'Negative', NEGATIVE: 'Negative',
  POS: 'Positive', POSITIVE: 'Positive',
  NORM: 'Normal', NORMAL: 'Normal',
  TRACE: 'Trace', TR: 'Trace',
  '+': '1+', '++': '2+', '+++': '3+', '++++': '4+',
}

/** One result line: optional *, a 2–4 letter code, then the value. */
const RESULT = /^(\*)?\s*([A-Za-z]{2,4})\s+(\S.*?)\s*$/

export function parseStripText(raw: string): AstmMessage {
  const out: AstmMessage = {
    fingerprint: null, manufacturer: null, model: null,
    sampleId: null, patientName: null, results: [], warnings: [],
  }
  const lines = unframe(raw).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())

  const header = lines[0]?.trim() ?? ''
  out.fingerprint = header || null
  out.model = header || null

  const results: AstmResult[] = []
  for (const line of lines.slice(1)) {
    const t = line.trim()
    const id = /^ID\s*:\s*(.*)$/i.exec(t)
    if (id) { out.sampleId = id[1].trim() || null; continue }
    // Seq.No:, Name:, Color: … — labels, not measurements.
    if (t.includes(':')) continue
    const m = RESULT.exec(t)
    if (!m) continue
    const [, star, code, given] = m
    // The printout pads columns with spaces: "30  mg/dl" is "30 mg/dl".
    const tidy = given.replace(/\s+/g, ' ')
    const value = WORDS[tidy.toUpperCase()] ?? tidy
    results.push({ code, value, unit: null, abnormalFlag: star ? 'A' : null, refLow: null, refHigh: null })
  }

  if (!out.sampleId) out.warnings.push('No sample ID was entered on the strip reader')
  out.results = namedResults(results)
  if (!out.results.length) out.warnings.push('No result lines found')
  return out
}
