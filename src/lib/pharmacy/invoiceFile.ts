/**
 * Reading a distributor's invoice file.
 *
 * Every distributor exports a different shape — Marg, Tally, a shop's own Excel
 * sheet — but they all carry the same handful of columns under different names.
 * This reads the file, works out which column is which, and leaves the rest to
 * the person checking the screen.
 */

/** A column we can use. Everything else in the file is ignored. */
export type InvoiceField =
  | 'name' | 'batch' | 'expiry' | 'packs' | 'free'
  | 'rate' | 'mrp' | 'packSize' | 'hsn' | 'gst' | 'manufacturer'

export const INVOICE_FIELDS: Array<{ key: InvoiceField; label: string; needed?: boolean }> = [
  { key: 'name',         label: 'Medicine', needed: true },
  { key: 'batch',        label: 'Batch',    needed: true },
  { key: 'expiry',       label: 'Expiry',   needed: true },
  { key: 'packs',        label: 'Quantity', needed: true },
  { key: 'free',         label: 'Free' },
  { key: 'rate',         label: 'Rate / pack' },
  { key: 'mrp',          label: 'MRP' },
  { key: 'packSize',     label: 'Pack size' },
  { key: 'hsn',          label: 'HSN' },
  { key: 'gst',          label: 'GST %' },
  { key: 'manufacturer', label: 'Company' },
]

/** Header names seen on Indian pharmacy invoices, lowercase and punctuation-free. */
const SYNONYMS: Record<InvoiceField, string[]> = {
  name:         ['item', 'itemname', 'item name', 'product', 'product name', 'description', 'particulars', 'medicine', 'drug', 'name', 'prodname', 'article'],
  batch:        ['batch', 'batch no', 'batchno', 'bno', 'b no', 'batch number', 'lot'],
  expiry:       ['exp', 'expiry', 'exp date', 'expdate', 'expdt', 'expiry date', 'exp dt'],
  packs:        ['qty', 'quantity', 'packs', 'pack qty', 'qnty', 'no of packs', 'bill qty', 'qty pack'],
  free:         ['free', 'free qty', 'fr qty', 'scheme', 'sch', 'bonus'],
  rate:         ['rate', 'ptr', 'purchase rate', 'net rate', 'price', 'unit rate', 'rate pack', 'basic rate', 'nett rate'],
  mrp:          ['mrp', 'm r p', 'mrp unit', 'mrp rs'],
  packSize:     ['pack', 'pack size', 'packing', 'conv', 'unit per pack', 'units per pack', 'qty per pack'],
  hsn:          ['hsn', 'hsn code', 'hsncode', 'hsn sac'],
  gst:          ['gst', 'gst %', 'gstp', 'tax', 'tax %', 'igst', 'cgst'],
  manufacturer: ['company', 'company name', 'mfr', 'manufacturer', 'mfg', 'marketed by', 'comp'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()

/** Which delimiter the file uses — a comma, a tab (pasted from Excel) or a semicolon. */
function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const counts: Array<[string, number]> = [
    ['\t', (line.match(/\t/g) ?? []).length],
    [',', (line.match(/,/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

/** Splits delimited text into rows, honouring "quoted, fields" and embedded newlines. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? sniffDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else quoted = false
      } else cell += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === d) { row.push(cell); cell = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += c
  }
  row.push(cell)
  rows.push(row)

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''))
}

export type ColumnMap = Partial<Record<InvoiceField, number>>

/** Scores one row as a possible header: how many of our fields it names. */
function mapRow(cells: string[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<number>()
  // Exact header names first, so a "Rate" column is not stolen by a loose match.
  for (const pass of [0, 1]) {
    for (const [field, names] of Object.entries(SYNONYMS) as Array<[InvoiceField, string[]]>) {
      if (map[field] != null) continue
      for (let i = 0; i < cells.length; i++) {
        if (used.has(i)) continue
        const c = norm(cells[i])
        if (!c) continue
        const hit = pass === 0
          ? names.includes(c)
          : names.some((n) => c.startsWith(n) || (n.length >= 4 && c.includes(n)))
        if (hit) { map[field] = i; used.add(i); break }
      }
    }
  }
  return map
}

/**
 * Finds the header row. Invoice exports often start with the shop's name and
 * address, so the header is rarely the first line.
 */
export function detectHeader(rows: string[][]): { headerIndex: number; map: ColumnMap } {
  let best = { headerIndex: -1, map: {} as ColumnMap, score: 0 }
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = mapRow(rows[i])
    const score = Object.keys(map).length
    if (score > best.score) best = { headerIndex: i, map, score }
  }
  return best.score >= 2 ? { headerIndex: best.headerIndex, map: best.map } : { headerIndex: -1, map: {} }
}

/** Words on an invoice line that describe the pack, not the medicine. */
const PACK_WORDS = /\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|inj|injection|syp|syr|syrup|susp|suspension|drop|drops|oint|ointment|cream|gel|lotion|soln|solution|kit|strip|strips|bott|bottle|vial|amp|ampoule|sachet|powder|pd)\b\.?/gi

/**
 * "DOLO 650 TAB 15'S" → "dolo 650". Invoice lines carry pack and form noise that
 * a catalogue search would trip over.
 */
export function cleanDrugName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ')          // (10 tab)
    .replace(/\b\d+\s*[x*]\s*\d+\b/gi, ' ') // 1x10, 10*15
    .replace(/\b\d+\s*'?\s*s\b/gi, ' ')  // 15'S, 10 S
    .replace(PACK_WORDS, ' ')
    .replace(/[,._|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Any of the ways an expiry is printed, as the MM/YY the form expects. */
export function parseExpiryCell(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

  // 2028-09-30 / 2028/09/30
  let m = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/.exec(s)
  if (m) return `${m[2].padStart(2, '0')}/${m[1].slice(2)}`

  // 30-09-2028 / 30/09/28 — a leading day only if it cannot be a month.
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s)
  if (m) return `${m[2].padStart(2, '0')}/${m[3].slice(-2)}`

  // 09/28, 09-2028, 0928
  m = /^(\d{1,2})[-/\s]?(\d{2}|\d{4})$/.exec(s)
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[1].padStart(2, '0')}/${m[2].slice(-2)}`

  // SEP-28 / Sep 2028 / 28-SEP
  m = /^([a-z]{3,})[-/\s]+(\d{2,4})$/i.exec(s)
  if (m) {
    const i = months.indexOf(m[1].slice(0, 3).toLowerCase())
    if (i >= 0) return `${String(i + 1).padStart(2, '0')}/${m[2].slice(-2)}`
  }
  m = /^(\d{2,4})[-/\s]+([a-z]{3,})$/i.exec(s)
  if (m) {
    const i = months.indexOf(m[2].slice(0, 3).toLowerCase())
    if (i >= 0) return `${String(i + 1).padStart(2, '0')}/${m[1].slice(-2)}`
  }
  return ''
}

/** "1,250.00" / "₹80" / "12%" → "1250.00" / "80" / "12"; anything else → ''. */
export function parseNumberCell(raw: string): string {
  const s = raw.replace(/[₹,%\s]/g, '').replace(/[^\d.-]/g, '')
  if (!s || !/\d/.test(s)) return ''
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : ''
}

export interface ParsedInvoiceRow {
  name: string
  batch: string
  expiry: string
  packs: string
  free: string
  rate: string
  mrp: string
  packSize: string
  hsn: string
  gst: string
  manufacturer: string
}

/** Reads the data rows under the header using the column map. */
export function readRows(rows: string[][], headerIndex: number, map: ColumnMap): ParsedInvoiceRow[] {
  const at = (r: string[], f: InvoiceField) => {
    const i = map[f]
    return i == null ? '' : (r[i] ?? '').trim()
  }
  const out: ParsedInvoiceRow[] = []
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]
    const name = at(r, 'name')
    if (!name) continue
    // Totals and section lines carry no batch and no quantity.
    if (/^(total|grand total|sub total|subtotal|net|amount)\b/i.test(name)) continue
    out.push({
      name,
      batch: at(r, 'batch'),
      expiry: parseExpiryCell(at(r, 'expiry')),
      packs: parseNumberCell(at(r, 'packs')),
      free: parseNumberCell(at(r, 'free')),
      rate: parseNumberCell(at(r, 'rate')),
      mrp: parseNumberCell(at(r, 'mrp')),
      packSize: parseNumberCell(at(r, 'packSize')),
      hsn: at(r, 'hsn').replace(/\D/g, ''),
      gst: parseNumberCell(at(r, 'gst')),
      manufacturer: at(r, 'manufacturer'),
    })
  }
  return out
}

export type MrpBasis = 'unit' | 'pack'

/**
 * Whether the file's MRP column is per tablet or per strip.
 *
 * Distributors print it both ways, and getting it wrong sets a selling price ten
 * or fifteen times off. The rate is per pack, so whichever reading leaves a
 * believable margin (a pharmacy buys at 10–60% below MRP) is the one meant.
 */
export function detectMrpBasis(rows: ParsedInvoiceRow[]): MrpBasis {
  let unitLikely = 0, packLikely = 0
  for (const r of rows) {
    const rate = Number(r.rate), mrp = Number(r.mrp), size = Number(r.packSize)
    if (!rate || !mrp || !size || size <= 1) continue
    const believable = (retail: number) => retail > rate && (retail - rate) / rate <= 1.5
    if (believable(mrp * size)) unitLikely++
    if (believable(mrp)) packLikely++
  }
  return packLikely > unitLikely ? 'pack' : 'unit'
}

/** Restates a pack MRP as the per-unit MRP the form stores. */
export function applyMrpBasis(rows: ParsedInvoiceRow[], basis: MrpBasis): ParsedInvoiceRow[] {
  if (basis === 'unit') return rows
  return rows.map((r) => {
    const mrp = Number(r.mrp), size = Number(r.packSize)
    if (!mrp || !size || size <= 1) return r
    return { ...r, mrp: String(Math.round((mrp / size) * 100) / 100) }
  })
}
