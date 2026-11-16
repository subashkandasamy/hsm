/*
 * Step 8 — pharmacy bills (OP counter and inpatient).
 *
 * Bills and their medicine lines only: no sale or dispense records, so no
 * stock moves, no Schedule H1 register entry and nothing in the pharmacy
 * queues (owner's decision: "medicine lines as text, no stock"). Each line
 * keeps the medicine name, batch and expiry SwiftEHR printed.
 *
 *  - GST as SwiftEHR charged it: lines priced before tax, GST on top at the
 *    line's rate; a line discount is already off the line (the bill shows it
 *    as its discount). Total = lines − discount + GST, rounded to the rupee.
 *  - Numbers: OP and inpatient pharmacy both printed "DRKMCH-Pharm-N"; the
 *    inpatient ones get "/IP" (owner's decision). A number still used twice
 *    after that, from SwiftEHR's April 2025 restart, gets "/24-25".
 *  - OP payments: the cash/UPI/card split SwiftEHR kept on the bill (its
 *    receipt list failed to export), at the bill's time.
 *  - Inpatient payments: SwiftEHR took pharmacy money per stay, not per bill.
 *    Each receipt is spread over the stay's bills oldest first; a refund for
 *    returned medicines is a negative payment on its day (Uyirly's refund
 *    convention), so every day's cash and every bill's balance come out right.
 *  - An OP sale is linked to the patient's OP visit that day, when there is one.
 *  - bill_source stays empty, as on Uyirly's own counter sales: SwiftEHR raised
 *    several pharmacy bills a day for one stay, which the one-bill-per-stay-
 *    per-day rule (idx_bills_ipd_daily_dedup) is there to stop for Uyirly's
 *    own pooled daily bills. The lines say ipd_pharmacy, which reports read.
 *  - SwiftEHR's per-stay pharmacy totals (header rows) and pending drafts are
 *    left out; the stays still open in SwiftEHR wait for the top-up.
 */
import { loadItems, ymd, hms, istStamp, loggedIds, logThenInsert, undoStep, all, db, type Tenant, type Planned } from '../lib'

const STEP = 'pharmacy'
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v != null ? String(v) : '') || null
const num = (v: unknown) => Number(v ?? 0) || 0
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const METHOD: Record<string, string> = { CASH: 'cash', UPI: 'upi', CARD: 'card' }
const methodOf = (m: unknown) => METHOD[String(m ?? '').split(',')[0].trim().toUpperCase()] ?? 'cash'
const swiftStamp = (s: unknown) => { const d = ymd(s); return d ? istStamp(d, hms(s)) : null }
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Bill = { key: string; row: Record<string, unknown>; items: Planned[]; pays: Planned[]; no: string; ip: boolean; day: string; at: string }

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients'), admissions = await loggedIds(t, 'admissions'), visitKeys = await loggedIds(t, 'visits')
  if (!patients.size || !admissions.size || !visitKeys.size) throw new Error('Run the patients, opd and admissions steps first.')
  // OP visits by patient and IST day, to link a counter sale to the day's consultation.
  const visitRows = await all<{ id: string; patient_id: string; visit_date: string }>((f, to) => db().from('visits')
    .select('id, patient_id, visit_date').eq('tenant_id', t.id).in('type', ['opd']).order('id').range(f, to))
  const imported = new Set(visitKeys.values())
  const visitOn = new Map<string, { id: string; at: string }[]>()
  for (const v of visitRows) if (imported.has(v.id)) {
    const k = `${v.patient_id}:${istDay(v.visit_date)}`
    visitOn.set(k, [...(visitOn.get(k) ?? []), { id: v.id, at: v.visit_date }])
  }

  const out: Bill[] = []
  const c = { op: 0, ip: 0, header: 0, pending: 0, openStay: 0, duplicate: 0, withVisit: 0, discounted: 0, refunds: 0, refundTotal: 0, returnedWhole: 0, returnedPart: 0, noPatient: 0, settled: 0, settledAmount: 0 }
  const seen = new Set<string>()

  const mkLines = (k: string, lines: any[], at: string, source: string) => lines.map((l: any, i: number) => {
    const taxable = round2(num(l.amount)), disc = round2(num(l.discountAmount)), gross = round2(taxable + disc), qty = num(l.quantity) || 1
    // GST as charged: the line's total less its pre-tax price (a few lines' tax
    // fields disagree with their total by a rupee; the total is what was paid).
    const tax = num(l.netAmount) >= taxable ? round2(num(l.netAmount) - taxable) : round2(num(l.taxTotal))
    const cg = round2(tax / 2)
    const exp = clean(l.expDate)?.slice(0, 7)
    const name = [clean(l.itemName) ?? 'Medicine', clean(l.batchNumber) && `batch ${clean(l.batchNumber)}`, exp && `exp ${exp}`].filter(Boolean).join(' · ')
    return { key: `phitem:${k}:${l.billItemId ?? i}`, row: { bill_id: null, source, ref_id: null, description: name, qty, unit_price: round2(gross / qty), amount: gross,
      created_at: at, gst_rate: num(l.taxPercent), hsn_sac: null, tax_inclusive: false, taxable_value: taxable, tax_amount: tax,
      _cgst: cg, _sgst: round2(tax - cg), _disc: disc } } as Planned
  })
  const mkBill = (k: string, pid: string, visitId: string | null, admId: string | null, no: string, at: string, source: string | null, items: Planned[], ip: boolean, swiftTotal: number): Bill => {
    const subtotal = round2(items.reduce((s, i) => s + Number(i.row.amount), 0))
    const discount = round2(items.reduce((s, i) => s + Number(i.row._disc), 0))
    const cgst = round2(items.reduce((s, i) => s + Number(i.row._cgst), 0)), sgst = round2(items.reduce((s, i) => s + Number(i.row._sgst), 0))
    const tax = round2(items.reduce((s, i) => s + Number(i.row.tax_amount), 0))
    // SwiftEHR's own rounded total wins when it is within ₹2 of ours (paise in line tax).
    const pre = subtotal - discount + tax, total = Math.abs(swiftTotal - Math.round(pre)) <= 2 ? swiftTotal : Math.round(pre)
    for (const i of items) { delete i.row._cgst; delete i.row._sgst; delete i.row._disc }
    if (discount > 0) c.discounted++
    return { key: `phbill:${k}`, no, ip, day: istDay(at), at, items, pays: [], row: {
      patient_id: pid, visit_id: visitId, admission_id: admId, bill_no: no, subtotal, discount, discount_pct: 0,
      discount_reason: discount > 0 ? 'Discount given in SwiftEHR' : null, tax, cgst, sgst, igst: 0, round_off: round2(total - pre), total, paid: 0,
      status: 'unpaid', created_by: null, created_at: at, billing_date: istDay(at), bill_source: source, appointment_id: null, consolidated_by: null, emergency_case_id: null,
    } }
  }

  // ── OP counter sales ──
  for (const x of loadItems<any>('pharmacy')) {
    if (!x.type) { c.header++; continue }
    const B = x.bill, id = String(B.billId)
    if (seen.has(id)) { c.duplicate++; continue }
    seen.add(id)
    const pid = patients.get(`patient:${B.patientId}`)
    if (!pid) { c.noPatient++; continue }
    const at = istStamp(ymd(B.createdDate)!, hms(B.createdTime))
    const sameDay = (visitOn.get(`${pid}:${istDay(at)}`) ?? []).filter((v) => new Date(v.at) <= new Date(at)).sort((a, z) => z.at.localeCompare(a.at))
    if (sameDay.length) c.withVisit++
    const b = mkBill(id, pid, sameDay[0]?.id ?? null, null, clean(B.billNo)!, at, null, mkLines(id, x.lines?.billItem ?? [], at, 'pharmacy'), false, num(x.lines?.totalAmount ?? B.totalAmount))
    for (const [i, p] of (x.lines?.receiptPaymentArr ?? []).filter((p: any) => num(p.amount) > 0).entries()) {
      b.pays.push({ key: `phpay:op:${id}:${i}`, row: { bill_id: null, amount: round2(num(p.amount)), method: methodOf(p.paymentMode),
        reference: `Pharmacy counter (SwiftEHR)${clean(p.referenceCode) ? ` · ${String(p.paymentMode).toUpperCase()} ${clean(p.referenceCode)}` : ''}`,
        received_by: null, received_at: at, payment_group_id: null, account_id: null } })
    }
    out.push(b); c.op++
  }

  // ── Inpatient pharmacy, per stay ──
  for (const s of loadItems<any>('ippharmacy')) {
    const admId = admissions.get(`admission:${s.admissionId}`)
    const pid = patients.get(`patient:${s.patientId}`)
    const stayBills: Bill[] = []
    for (const x of s.bills ?? []) {
      const R = x.row, id = String(R.billId)
      if (seen.has(id)) { c.duplicate++; continue }
      seen.add(id)
      if (!admId) { c.openStay++; continue }
      if (R.documentStatus === 'PENDING' || !R.billNo) { c.pending++; continue }
      const at = swiftStamp(R.billDate) ?? istStamp(ymd(R.prescriptionDate)!, '12:00:00')
      const b = mkBill(id, pid!, null, admId, `${clean(R.billNo)}/IP`, at, null, mkLines(id, x.lines?.billItem ?? [], at, 'ipd_pharmacy'), true, num(x.lines?.totalAmount ?? R.billAmount))
      ;(b as Bill & { swiftPaid?: boolean }).swiftPaid = R.status === 'Paid'
      stayBills.push(b)
    }
    if (!admId) continue
    // Receipts spread over the stay's bills, oldest first; refunds off the bill the excess sits on.
    // SwiftEHR's receipts cover exactly the bills it marked paid (receipts −
    // refunds = those bills, on every stay), so those are filled first.
    stayBills.sort((a, z) => Number(!(a as any).swiftPaid) - Number(!(z as any).swiftPaid) || a.at.localeCompare(z.at))
    const due = stayBills.map((b) => Number(b.row.total))
    const receipts = (s.receipts ?? []).filter((r: any) => num(r.amount) > 0).sort((a: any, z: any) => (swiftStamp(a.createdDt) ?? '').localeCompare(swiftStamp(z.createdDt) ?? ''))
    let last = stayBills.length - 1
    for (const r of receipts.filter((r: any) => r.paymentType !== 'refund')) {
      let left = num(r.amount), part = 0
      const ref = `${clean(r.receiptNo)}${String(r.paymentMode).includes(',') ? ` · paid by ${String(r.paymentMode).split(',').map((m) => m.trim()).join(' + ')}` : ''}`
      for (let i = 0; i < stayBills.length && left > 0.004; i++) {
        if (due[i] <= 0.004) continue
        const take = round2(Math.min(due[i], left))
        due[i] = round2(due[i] - take); left = round2(left - take); last = i
        stayBills[i].pays.push(pay(`phpay:ip:${r.receiptId}:${part++}`, take, methodOf(r.paymentMode), ref, swiftStamp(r.createdDt)!))
      }
      if (left > 0.004 && stayBills.length) stayBills[last].pays.push(pay(`phpay:ip:${r.receiptId}:${part++}`, left, methodOf(r.paymentMode), ref, swiftStamp(r.createdDt)!))
    }
    // A refund either hands back money paid beyond the bills (it comes off the
    // bill holding the excess), or hands back a whole bill whose medicines came
    // back while SwiftEHR still showed it paid — that bill is cancelled, its
    // payment and the refund both kept on their days.
    for (const r of receipts.filter((r: any) => r.paymentType === 'refund')) {
      if (!stayBills.length) continue
      c.refunds++; c.refundTotal += num(r.amount)
      const amt = round2(num(r.amount))
      const paidOf = (b: Bill) => b.pays.reduce((x, p) => x + Number(p.row.amount), 0)
      const over = stayBills.find((b) => paidOf(b) >= Number(b.row.total) + amt - 0.004)
      const whole = over ? null : stayBills.find((b) => Math.abs(Number(b.row.total) - amt) < 0.5 && paidOf(b) >= amt - 0.004 && b.row.status !== 'cancelled')
      // Neither: part of a paid bill came back. The return comes off that bill
      // (latest one big enough), so it is not left looking unpaid.
      const part = over || whole ? null
        : [...stayBills].reverse().find((b) => b.row.status !== 'cancelled' && Number(b.row.total) >= amt && paidOf(b) >= Number(b.row.total) - 0.004)
      const target = over ?? whole ?? part ?? stayBills[last]
      if (whole) { whole.row.status = 'cancelled'; c.returnedWhole++ }
      if (part) {
        c.returnedPart++
        const disc = round2(Number(part.row.discount) + amt)
        const pre = Number(part.row.subtotal) - disc + Number(part.row.tax), total = Number(part.row.total) - amt
        const prev = String(part.row.discount_reason ?? '')
        Object.assign(part.row, { discount: disc, total, round_off: round2(total - pre),
          discount_reason: prev.startsWith('Medicines returned')
            ? `${prev}; ₹${amt} (${clean(r.receiptNo)})`
            : `Medicines returned, refunded: ₹${amt} (${clean(r.receiptNo)})` })
      }
      target.pays.push(pay(`phrefund:ip:${r.receiptId}`, -amt, methodOf(r.paymentMode), `${clean(r.receiptNo)} · refund for returned medicines`, swiftStamp(r.createdDt)!))
    }
    out.push(...stayBills); c.ip += stayBills.length
  }

  // ── Numbers ──
  const byNo = new Map<string, Bill[]>()
  for (const b of out) byNo.set(b.no, [...(byNo.get(b.no) ?? []), b])
  let tagged = 0
  for (const [, bs] of byNo) if (bs.length > 1) for (const b of bs) if (b.day < '2025-04-01') { b.row.bill_no = `${b.no}/24-25`; tagged++ }
  const finalNo = new Map<string, number>()
  for (const b of out) finalNo.set(String(b.row.bill_no), (finalNo.get(String(b.row.bill_no)) ?? 0) + 1)
  const stillTwice = [...finalNo.values()].filter((n) => n > 1).length

  // ── Paid and status, as Uyirly derives them ──
  let mismatch = 0
  const mismatches: string[] = []
  for (const b of out) {
    // Owner's decision (16 Nov): what SwiftEHR left unpaid is marked paid, as
    // cash collected on the bill's own day.
    const owed = round2(Number(b.row.total) - b.pays.reduce((s, p) => s + Number(p.row.amount), 0))
    if (b.row.status !== 'cancelled' && owed > 0.004) {
      b.pays.push(pay(`phsettle:${b.key}`, owed, 'cash', 'Settled outside SwiftEHR (marked paid at import)', b.at))
      c.settled++; c.settledAmount += owed
    }
    const paid = round2(b.pays.reduce((s, p) => s + Number(p.row.amount), 0)), total = Number(b.row.total)
    b.row.paid = paid
    if (b.row.status === 'cancelled') continue
    b.row.status = paid >= total ? 'paid' : paid <= 0 ? 'unpaid' : 'partial'
    if (Math.abs(paid - total) > 1 && paid > 0) { mismatch++; if (mismatches.length < 6) mismatches.push(`${b.row.bill_no}: total ₹${total} paid ₹${paid}`) }
  }
  return { out, c, tagged, stillTwice, mismatch, mismatches }

  function pay(k: string, amount: number, method: string, reference: string, at: string): Planned {
    return { key: k, row: { bill_id: null, amount, method, reference, received_by: null, received_at: at, payment_group_id: null, account_id: null } }
  }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { out, c, tagged, stillTwice, mismatch, mismatches } = await plan(t)
  const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0))
  const items = out.flatMap((b) => b.items), pays = out.flatMap((b) => b.pays)
  const st: Record<string, number> = {}
  for (const b of out) st[String(b.row.status)] = (st[String(b.row.status)] ?? 0) + 1
  console.log(`pharmacy bills: ${out.length}`, c)
  console.log(`  numbers tagged /24-25: ${tagged} · still used twice: ${stillTwice} · status:`, st)
  console.log(`  lines ${items.length} · payments ${pays.length} (refunds ${pays.filter((p) => Number(p.row.amount) < 0).length})`)
  for (const ip of [false, true]) {
    const bs = out.filter((b) => b.ip === ip && b.row.status !== 'cancelled')
    console.log(`  ${ip ? 'inpatient' : 'OP'}: billed ₹${sum(bs.map((b) => Number(b.row.total)))} (GST ₹${sum(bs.map((b) => Number(b.row.tax)))}, discount ₹${sum(bs.map((b) => Number(b.row.discount)))}) · paid ₹${sum(bs.map((b) => Number(b.row.paid)))} · outstanding ₹${sum(bs.map((b) => Math.max(0, Number(b.row.total) - Number(b.row.paid))))}`)
  }
  const rates: Record<string, number> = {}
  for (const i of items) rates[`${i.row.gst_rate}%`] = (rates[`${i.row.gst_rate}%`] ?? 0) + 1
  console.log('  lines by GST rate:', rates)
  if (mismatch) console.log(`  PAID ≠ TOTAL (${mismatch}):`, mismatches)
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  if (stillTwice) throw new Error('Some pharmacy bill numbers are still used twice.')
  const rb = await logThenInsert(t, STEP, 'bills', out.map((b) => ({ key: b.key, row: b.row })), undefined, 200)
  console.log(`pharmacy bills written: ${rb.inserted} new, ${rb.existing} already there`)
  const ids = await loggedIds(t, 'bills')
  for (const b of out) for (const x of [...b.items, ...b.pays]) x.row.bill_id = ids.get(b.key)
  const ri = await logThenInsert(t, STEP, 'bill_items', items, undefined, 300)
  console.log(`medicine lines written: ${ri.inserted} new, ${ri.existing} already there`)
  const rp = await logThenInsert(t, STEP, 'payments', pays, undefined, 300)
  console.log(`payments written: ${rp.inserted} new, ${rp.existing} already there`)
}

export async function undo(t: Tenant): Promise<void> {
  await undoStep(t, STEP, ['payments', 'bill_items', 'bills'])
}
