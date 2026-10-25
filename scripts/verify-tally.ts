/**
 * Vouchers Tally will actually accept.
 *
 *   npm run verify:tally
 *
 * The failure mode here is unusually unforgiving. Tally does not partially
 * import a voucher: if the debits and credits do not match to the paisa it
 * refuses the whole thing with "Voucher totals do not match!" and drops it
 * into an Exceptions report that a hospital will not look at until it is
 * reconciling a month later and a figure is short.
 *
 * None of that is visible from our side. The file looks fine, the download
 * works, and the hospital believes the export succeeded. So the arithmetic is
 * checked here, against the rules rather than against a snapshot: every
 * voucher sums to zero, every date is YYYYMMDD, every amount has two decimals,
 * and the XML is well-formed with its ledger names escaped.
 */

import { buildTallyXml, saleTotal, type TallySale, type TallyReceipt } from '../src/lib/accounting/tally'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

const PARTY = 'Sundry Debtors - Patients'

const SALE: TallySale = {
  date: '2026-10-23',
  voucherNo: 'UDH/B2627/00009',
  narration: 'Saraswathi Devi (DEMO-UH-2026-00006) — Dr. Arun Prakash',
  credits: [
    { ledger: 'Room Rent', amount: 1200 },
    { ledger: 'Nursing Charges', amount: 800 },
    { ledger: 'Pharmacy Sales', amount: 72.40 },
  ],
  partyLedger: PARTY,
  billRef: 'UDH/B2627/00009',
}

const RECEIPT: TallyReceipt = {
  date: '2026-10-23',
  voucherNo: 'UDH/B2627/00002',
  narration: 'Anand Subramanian — bill payment',
  debitLedger: 'Cash',
  partyLedger: PARTY,
  amount: 500,
  billRef: 'UDH/B2627/00002',
}

const xml = buildTallyXml([SALE], [RECEIPT])

// ── Every voucher must sum to zero ─────────────────────────────────────────
console.log('\nDebits and credits')
for (const [name, block] of blocks(xml)) {
  check(balanceOf(block) === 0, `${name} balances to zero`, { total: balanceOf(block) })
}

// And it has to notice when one does not, or it is checking nothing.
const broken = buildTallyXml([{ ...SALE, credits: [{ ledger: 'Room Rent', amount: 1200 }] }], [])
  .replace('<AMOUNT>-1200.00</AMOUNT>', '<AMOUNT>-1300.00</AMOUNT>')
check(blocks(broken).every(([, b]) => balanceOf(b) !== 0),
  'a voucher that does NOT balance is caught', blocks(broken).map(([, b]) => balanceOf(b)))

// ── The format rules Tally enforces ────────────────────────────────────────
console.log('\nFormat')
const dates = [...xml.matchAll(/<DATE>([^<]*)<\/DATE>/g)].map((m) => m[1])
check(dates.length === 2 && dates.every((d) => /^\d{8}$/.test(d)), 'dates are YYYYMMDD', dates)
check(!/<DATE>\d{4}-/.test(xml), 'no hyphenated date slipped through')

const amounts = [...xml.matchAll(/<AMOUNT>([^<]*)<\/AMOUNT>/g)].map((m) => m[1])
check(amounts.every((a) => /^-?\d+\.\d{2}$/.test(a)), 'every amount has exactly two decimals', amounts)

check(/<VOUCHERTYPENAME>Sales<\/VOUCHERTYPENAME>/.test(xml), 'the sales voucher names a type Tally ships with')
check(/<VOUCHERTYPENAME>Receipt<\/VOUCHERTYPENAME>/.test(xml), 'so does the receipt')
check(/<TALLYREQUEST>Import<\/TALLYREQUEST>/.test(xml) && /<ID>Vouchers<\/ID>/.test(xml),
  'the envelope asks for a voucher import')

// ── Bill references, which carry "yet to collect" into Tally ───────────────
console.log('\nOutstanding survives the export')
check(/<BILLTYPE>New Ref<\/BILLTYPE>/.test(xml), 'the sale opens an outstanding (New Ref)')
check(/<BILLTYPE>Agst Ref<\/BILLTYPE>/.test(xml), 'the receipt closes it (Agst Ref)')
const consolidated = buildTallyXml([{ ...SALE, billRef: null, voucherNo: 'DAY-20261023' }], [])
check(!/<BILLALLOCATIONS\.LIST>/.test(consolidated),
  'a consolidated voucher carries no bill reference, and does not pretend to')

// ── Escaping ───────────────────────────────────────────────────────────────
console.log('\nNames that would break the file')
const nasty = buildTallyXml([{
  ...SALE,
  narration: 'Ram & Co <test> "quoted"',
  credits: [{ ledger: 'Lab & Imaging', amount: 100 }],
}], [])
check(!/<LEDGERNAME>Lab & Imaging/.test(nasty), 'a bare & in a ledger name is escaped')
check(/Lab &amp; Imaging/.test(nasty), 'and kept readable', nasty.match(/<LEDGERNAME>[^<]*<\/LEDGERNAME>/g))
check(!/<NARRATION>[^<]*<test>/.test(nasty), 'angle brackets in a patient note cannot open a tag')

// ── Well-formed ────────────────────────────────────────────────────────────
console.log('\nWell-formed XML')
check(wellFormed(xml), 'tags nest and close')
check(wellFormed(nasty), 'still, with awkward names in it')

console.log(failed === 0 ? '\nAll Tally checks passed.\n' : `\n${failed} FAILED\n`)
process.exit(failed ? 1 : 0)

/**
 * What a voucher sums to.
 *
 * Only the first AMOUNT inside each LEDGERENTRIES.LIST counts. A
 * BILLALLOCATIONS.LIST repeats its parent's figure as an allocation of that
 * line rather than a line of its own, and adding it would double the debit
 * and make a correct voucher look broken.
 */
function balanceOf(voucher: string): number {
  const entries = voucher.split('<LEDGERENTRIES.LIST>').slice(1)
  const total = entries.reduce((sum, e) => {
    const first = /<AMOUNT>(-?[\d.]+)<\/AMOUNT>/.exec(e)
    return sum + (first ? Number(first[1]) : 0)
  }, 0)
  return Math.round(total * 100) / 100
}

/** Each <VOUCHER> element, with a readable name. */
function blocks(doc: string): Array<[string, string]> {
  return [...doc.matchAll(/<VOUCHER [\s\S]*?<\/VOUCHER>/g)]
    .map((m) => [/<VOUCHERTYPENAME>([^<]*)</.exec(m[0])?.[1] ?? 'voucher', m[0]] as [string, string])
}

/** A stack check — enough to catch an unclosed or crossed tag. */
function wellFormed(doc: string): boolean {
  const stack: string[] = []
  for (const m of doc.matchAll(/<(\/?)([A-Za-z0-9_.:]+)([^>]*?)(\/?)>/g)) {
    const [, closing, name, attrs, selfClose] = m
    if (name.startsWith('?') || name.startsWith('!')) continue
    if (selfClose || attrs.endsWith('/')) continue
    if (closing) { if (stack.pop() !== name) return false }
    else stack.push(name)
  }
  return stack.length === 0
}
