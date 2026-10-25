/**
 * Vouchers, in the shape Tally will import.
 *
 * ── Why this is a renderer and not an integration ──────────────────────────
 *
 * Nothing here talks to Tally. It takes the register rows the Accounts page
 * already shows and writes them as XML, exactly as the CSV renderer writes
 * them as rows. Tally is the biggest share of a split market — Zoho Books,
 * Vyapar, Busy and Marg hold the rest, and a great many small-town
 * accountants keep a nursing home's books in a spreadsheet — so this is one
 * rendering among several and the register underneath belongs to none of them.
 *
 * ── The rules this file obeys, and what breaks if it does not ──────────────
 *
 * **Dates are YYYYMMDD.** Anything else is rejected outright.
 *
 * **`VOUCHERTYPENAME` must already exist in the company.** `Sales` and
 * `Receipt` are Tally's own defaults, which is why they are not configurable:
 * a hospital that has renamed them has a larger conversation to have than a
 * dropdown.
 *
 * **Debits and credits must balance exactly**, or Tally refuses the whole
 * voucher with "Voucher totals do not match!" and drops it into the
 * Exceptions report. Following Tally's own published sample, a debit is a
 * *negative* AMOUNT with `ISDEEMEDPOSITIVE` Yes and a credit a positive
 * AMOUNT with `ISDEEMEDPOSITIVE` No, so a correct voucher sums to zero.
 *
 * **Every ledger named must already exist** in the hospital's books. That is
 * what the ledger-names screen is for, and why an unmapped head stops the
 * export rather than guessing: a guessed name is a rejected voucher, found at
 * the import rather than in the file.
 *
 * ── Bill references are how "yet to collect" survives the export ───────────
 *
 * `BILLTYPE` `New Ref` on a Sales voucher opens an outstanding against that
 * bill number; `Agst Ref` on a Receipt closes it. Together they reproduce the
 * owner's "collected separately, pending separately" inside the accountant's
 * own software, maintained by Tally's bill-wise outstanding rather than by us.
 *
 * It is also what consolidated mode gives up: one voucher for a whole day
 * cannot carry one reference per bill.
 */

export interface TallySaleLine { ledger: string; amount: number }

export interface TallySale {
  /** YYYY-MM-DD. */
  date: string
  voucherNo: string
  /** For a human reading the voucher a year later. */
  narration: string
  /** Income heads, already mapped to the hospital's own ledger names. */
  credits: TallySaleLine[]
  /** The single sundry-debtors ledger everything is owed to. */
  partyLedger: string
  /** Null in consolidated mode, where one voucher covers many bills. */
  billRef: string | null
}

export interface TallyReceipt {
  date: string
  voucherNo: string
  narration: string
  /** Cash or bank ledger the money landed in. */
  debitLedger: string
  partyLedger: string
  amount: number
  billRef: string | null
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** YYYY-MM-DD → YYYYMMDD. Tally's universal date, and the only one it takes. */
const ymd = (d: string): string => d.replace(/-/g, '')

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100
const amt = (n: number): string => n.toFixed(2)

function billAllocation(ref: string, type: 'New Ref' | 'Agst Ref', amount: number): string {
  return `          <BILLALLOCATIONS.LIST>
            <NAME>${esc(ref)}</NAME>
            <BILLTYPE>${type}</BILLTYPE>
            <AMOUNT>${amt(amount)}</AMOUNT>
          </BILLALLOCATIONS.LIST>`
}

export function saleTotal(s: TallySale): number {
  return round2(s.credits.reduce((t, c) => t + c.amount, 0))
}

function salesVoucher(s: TallySale): string {
  const total = saleTotal(s)
  const party = [
    `        <LEDGERENTRIES.LIST>`,
    `          <LEDGERNAME>${esc(s.partyLedger)}</LEDGERNAME>`,
    `          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
    `          <ISPARTYLEDGER>Yes</ISPARTYLEDGER>`,
    `          <AMOUNT>${amt(-total)}</AMOUNT>`,
    s.billRef ? billAllocation(s.billRef, 'New Ref', -total) : null,
    `        </LEDGERENTRIES.LIST>`,
  ].filter(Boolean).join('\n')

  const income = s.credits.map((c) => `        <LEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(c.ledger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amt(c.amount)}</AMOUNT>
        </LEDGERENTRIES.LIST>`).join('\n')

  return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Sales" ACTION="Create">
          <DATE>${ymd(s.date)}</DATE>
          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(s.voucherNo)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${esc(s.partyLedger)}</PARTYLEDGERNAME>
          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
          <ISINVOICE>No</ISINVOICE>
          <NARRATION>${esc(s.narration)}</NARRATION>
${party}
${income}
        </VOUCHER>
      </TALLYMESSAGE>`
}

function receiptVoucher(r: TallyReceipt): string {
  const bank = `        <LEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(r.debitLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${amt(-r.amount)}</AMOUNT>
        </LEDGERENTRIES.LIST>`

  const party = [
    `        <LEDGERENTRIES.LIST>`,
    `          <LEDGERNAME>${esc(r.partyLedger)}</LEDGERNAME>`,
    `          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
    `          <ISPARTYLEDGER>Yes</ISPARTYLEDGER>`,
    `          <AMOUNT>${amt(r.amount)}</AMOUNT>`,
    r.billRef ? billAllocation(r.billRef, 'Agst Ref', r.amount) : null,
    `        </LEDGERENTRIES.LIST>`,
  ].filter(Boolean).join('\n')

  return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Receipt" ACTION="Create">
          <DATE>${ymd(r.date)}</DATE>
          <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(r.voucherNo)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${esc(r.partyLedger)}</PARTYLEDGERNAME>
          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
          <NARRATION>${esc(r.narration)}</NARRATION>
${bank}
${party}
        </VOUCHER>
      </TALLYMESSAGE>`
}

export function buildTallyXml(sales: TallySale[], receipts: TallyReceipt[]): string {
  const body = [...sales.map(salesVoucher), ...receipts.map(receiptVoucher)].join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC></DESC>
    <DATA>
${body}
    </DATA>
  </BODY>
</ENVELOPE>
`
}
