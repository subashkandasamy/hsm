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

/**
 * Headers that must win when a file carries both a general and a specific one.
 *
 * A stock report can have `MRP` (per pack) AND `Unit MRP` (per tablet) side by
 * side. `mapRow` takes the first column that matches a field, and `MRP` is
 * usually printed first — so the pack price was being read as the unit price
 * and a 6.68 tablet was priced at 100.13. The MRP basis control can only
 * correct that when a pack size is present, and a stock report rarely has one.
 *
 * The same applies to cost: a report often prints a selling price and a
 * purchase value, and `rate` means what the pharmacy PAID.
 */
const PREFERRED: Partial<Record<InvoiceField, string[]>> = {
  mrp:  ['unit mrp', 'mrp unit', 'mrp per unit', 'rate per unit mrp'],
  rate: ['unit purchase value', 'purchase value', 'unit purchase price', 'purchase price', 'unit cost', 'cost price'],
}

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

  // The specific header wins before anything else looks. A report carrying both
  // `MRP` and `Unit MRP` must map the unit one, whichever is printed first.
  for (const [field, names] of Object.entries(PREFERRED) as Array<[InvoiceField, string[]]>) {
    for (let i = 0; i < cells.length; i++) {
      if (used.has(i)) continue
      if (names.includes(norm(cells[i]))) { map[field] = i; used.add(i); break }
    }
  }

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
  /** 1-based line in the file, so a problem can name the row to open and fix. */
  line: number
  /** The expiry exactly as the file wrote it, kept for the error message. */
  expiryRaw: string
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
    //
    // "item count" is here because a SWIFTEHR stock report ends with
    // `,Item Count,1127,,40417,...` — a trailer that is not called a total, so
    // it imported as a medicine with 40,417 units and a batch of "1127".
    if (/^(total|grand total|sub total|subtotal|net|amount|item count|count|no of items|records?)\b/i.test(name)) continue
    out.push({
      line: i + 1,
      expiryRaw: at(r, 'expiry'),
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

// ── Checking the file before anything is loaded ──────────────────────────────

export type IssueLevel = 'blocking' | 'fix' | 'note'

export interface FileIssue {
  level: IssueLevel
  /** What is wrong, in the words of the person who has to fix it. */
  title: string
  /** The file's own line numbers, so they can be opened and corrected. */
  lines: number[]
  /** One concrete example, quoted from the file. */
  example?: string
}

/**
 * Batch numbers Excel has damaged.
 *
 * Narrow on purpose. A first attempt flagged any five-digit batch as a date
 * serial and called out 21 rows of a real file, including "50924" — an ordinary
 * batch number. A check that cries wolf on good data gets ignored on bad data,
 * so only the two shapes that cannot be a batch number are flagged:
 *
 *   45597.229166666664   a date AND time serial — no batch has a fraction
 *   6.26e+60             scientific notation — Excel ate an alphanumeric code
 *
 * A plain integer is left alone: it may well be the real batch, and the file
 * cannot tell us otherwise.
 */
const EXCEL_DATETIME_SERIAL = /^\d{4,6}\.\d+$/
// Needs a decimal point or an explicit sign in the exponent. Without that it
// also matched "26E80110" and "5253E68501" — ordinary alphanumeric batch codes
// that merely contain an E, which is the second false positive this check
// produced before it was narrowed.
const SCIENTIFIC = /^\d+\.\d+e[+-]?\d+$|^\d+e[+-]\d+$/i

/**
 * Everything wrong with the file, found in one pass and reported together.
 *
 * The import used to load whatever it could parse and let the problems surface
 * one at a time at the very end — the save refuses on the first bad line, so a
 * 1,127-row file told you about row 3, then row 40, then row 112. Worse, some
 * problems never surfaced at all: a batch number Excel had mangled imported
 * silently and only looked wrong on a shelf months later.
 *
 * Three levels, because they need different actions:
 *   blocking  nothing can be imported until the file changes
 *   fix       these rows will be refused at save — correct them in the file
 *   note      handled automatically; said out loud so it is not a surprise
 */
export function checkFile(
  rows: ParsedInvoiceRow[],
  map: ColumnMap,
  opts: { skipped?: number } = {},
): FileIssue[] {
  const issues: FileIssue[] = []
  const add = (level: IssueLevel, title: string, lines: number[], example?: string) => {
    if (lines.length) issues.push({ level, title, lines, example })
  }

  // ── Columns ──
  const missing = INVOICE_FIELDS.filter((f) => f.needed && map[f.key] == null)
  if (missing.length) {
    issues.push({
      level: 'blocking',
      title: `${missing.map((m) => m.label).join(', ')} — no column in the file holds this. Pick it above, or add the column to the file.`,
      lines: [],
    })
  }
  if (map.mrp == null) {
    issues.push({
      level: 'blocking',
      title: 'MRP — no column is mapped, and a batch cannot be saved without a selling price.',
      lines: [],
    })
  }

  // ── Rows ──
  const noBatch: number[] = [], badExp: number[] = [], pastExp: number[] = []
  const noQty: number[] = [], noMrp: number[] = [], oddBatch: number[] = []
  let badExpEg = '', oddBatchEg = '', pastExpEg = ''

  const now = new Date()
  const thisMonth = now.getFullYear() * 12 + now.getMonth()

  for (const r of rows) {
    if (!r.batch.trim()) noBatch.push(r.line)
    else if (EXCEL_DATETIME_SERIAL.test(r.batch) || SCIENTIFIC.test(r.batch)) {
      oddBatch.push(r.line)
      oddBatchEg ||= `${r.name} → batch "${r.batch}"`
    }

    if (!r.expiry) {
      badExp.push(r.line)
      badExpEg ||= `${r.name} → expiry "${r.expiryRaw}"`
    } else {
      const [mm, yy] = r.expiry.split('/').map(Number)
      const m = (2000 + yy) * 12 + (mm - 1)
      if (m < thisMonth) { pastExp.push(r.line); pastExpEg ||= `${r.name} → ${r.expiry}` }
    }

    if (!(Number(r.packs) > 0)) noQty.push(r.line)
    if (!(Number(r.mrp) > 0)) noMrp.push(r.line)
  }

  add('fix', 'Batch number is empty. Every batch needs one.', noBatch)
  add('fix', 'Expiry could not be read. Write it as MM/YY, or DD-MM-YYYY.', badExp, badExpEg)
  add('fix', 'This expiry has already passed — expired stock cannot be received.', pastExp, pastExpEg)
  add('fix', 'Quantity is missing or zero.', noQty)
  add('fix', 'MRP is missing or zero.', noMrp)
  add('fix',
    'Batch number looks like Excel damaged it — a date serial or a number in scientific notation. Open the original and retype it as text.',
    oddBatch, oddBatchEg)

  // ── Duplicates: the same batch of the same medicine twice ──
  const seen = new Map<string, number>()
  const dup: number[] = []
  for (const r of rows) {
    const k = `${r.name.toLowerCase()}|${r.batch.toLowerCase()}|${r.expiry}`
    if (seen.has(k)) dup.push(r.line)
    else seen.set(k, r.line)
  }
  add('note', 'The same medicine, batch and expiry appears more than once. The quantities will be added together.', dup)

  if (opts.skipped) {
    issues.push({
      level: 'note',
      title: `${opts.skipped} line${opts.skipped === 1 ? '' : 's'} skipped — totals and report footers, not medicines.`,
      lines: [],
    })
  }

  return issues
}

/** True when the file cannot be imported at all until it is changed. */
export function hasBlocking(issues: FileIssue[]): boolean {
  return issues.some((i) => i.level === 'blocking')
}

/**
 * The kind of thing a line names, read out of its own wording.
 *
 * Used when a line matches nothing in the catalogue and the hospital chooses to
 * add it to their own list as it is written. `drugs.form` is a free-text label
 * shown beside the name, so the honest value is the word the file already uses
 * — "SYRINGE", "RESPULES", "SUPPOSITORY" — not a guess at a dosage class.
 *
 * Returns null rather than inventing one. A null form is a blank field the
 * pharmacist can fill; a wrong form is a wrong record.
 */
const FORM_WORDS: Array<[RegExp, string]> = [
  // Equipment and consumables first: "IV SET" must not be read as an injection,
  // and "DISPOSABLE CAP" is not a capsule. Both are real lines from a migration.
  [/\b(syringe|needle|lancet)\b/i, 'Syringe / needle'],
  [/\b(catheter|foley|sheath|drain|stent|urobag|urine bag)\b/i, 'Catheter / drain'],
  [/\b(mask|oxy|oxygen|nebuli[sz]er|airway|ett|tracheostomy|bougie|stylet|lma|suction)\b/i, 'Airway / respiratory'],
  [/\b(gauze|bandage|dressing|plaster|tape|cotton|pad|swab|crepe)\b/i, 'Dressing / adhesive'],
  [/\b(suture|stapler|prolene|vicryl|catgut|silk)\b/i, 'Suture / stapler'],
  // "BP HANDLE SIZE 3" is a Bard-Parker scalpel handle, not a blood-pressure
  // anything. The blood-pressure rule below used to claim it, and did — in a
  // real hospital's data, filed under Diagnostic device. Tested before it,
  // because the two spellings are identical up to the last word.
  [/\bb\.?\s?p\.?\s*(handle|blade)\b/i, 'Surgical instrument'],
  // `forc` because invoices abbreviate: "DISSECTING TOOTH FORC" is a forceps.
  [/\b(forceps?|forc|scissor|clamp|retractor|trocar|scalpel|blade|probe|speculum)\b/i, 'Surgical instrument'],
  [/\b(glove|gloves)\b/i, 'Gloves'],
  // Device words the first pass over a real stock file showed were missing.
  // `b.p` only ever as part of a named part, never bare: a line is far more
  // likely to be a medicine than a sphygmomanometer.
  [/\b(ambu\s*bag|resuscitator)\b/i, 'Airway / respiratory'],
  [/\b(accu[\s-]?chek|glucometer|glucose strip|test strip)\b/i, 'Diagnostic device'],
  [/\bb\.?\s?p\.?(?:\s+\w+){0,3}\s+(apparatus|stand|bulb|cuff|monitor)\b/i, 'Diagnostic device'],
  // An air bed is a pressure-relieving mattress — it belongs with the other
  // things that hold a patient's body, not with the trays and bowls.
  [/\b(air\s*bed|water\s*bed|mattress)\b/i, 'Orthopaedic / support'],
  [/\b(restrainer|restraint)\b/i, 'Orthopaedic / support'],
  [/\b(tray|bowl|bowel|bedpan|bedfan|kidney tray|jar|container)\b/i, 'Hospital ware'],
  [/\b(iv set|infusion set|blood set|burette|three way|3 way|cannula|venflon)\b/i, 'IV administration'],
  [/\b(apron|gown|cap|sheet|linen|shoe cover)\b/i, 'Protective wear / linen'],
  [/\b(binder|splint|collar|support|sling|crepe|traction)\b/i, 'Orthopaedic / support'],
  // Ultrasound gel sits with the scanner it is used on, and must be tested
  // before the bare `jelly` rule below.
  [/\b(ultra\s*sound|ultrasound|usg)\b/i, 'Diagnostic device'],
  [/\b(monitor|thermometer|scale|meter|transducer|stethoscope|sphygmo)\b/i, 'Diagnostic device'],
  [/\b(jelly|lubricant|lignocaine jelly)\b/i, 'Lubricant gel'],
  [/\b(sterillium|bacillocid|disinfectant|handrub|sanitiser|sanitizer)\b/i, 'Antiseptic / disinfectant'],
  // Dosage forms.
  [/\b(respule|respules|resp)\b/i, 'Respules'],
  [/\b(suppositor\w*|supposit)\b/i, 'Suppository'],
  [/\b(tablet|tablets|tabs?)\b/i, 'Tablet'],
  [/\b(capsule|capsules|caps?)\b/i, 'Capsule'],
  [/\b(injection|inj|ampoule|amp|vial)\b/i, 'Injection'],
  [/\b(syrup|syp|syr|suspension|susp|elixir)\b/i, 'Syrup'],
  [/\b(ointment|oint|cream|gel|lotion)\b/i, 'Ointment / cream'],
  [/\b(drops?|eye drop|ear drop)\b/i, 'Drops'],
  [/\b(spray|inhaler|rotacap|puff)\b/i, 'Inhaler / spray'],
  [/\b(sachet|granules|powder)\b/i, 'Sachet / powder'],
  [/\b(solution|soln|infusion|fluid|ns|rl|dns)\b/i, 'IV fluid'],
]

export function guessForm(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  for (const [re, form] of FORM_WORDS) if (re.test(s)) return form
  return null
}
