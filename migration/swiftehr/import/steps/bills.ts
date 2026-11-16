/*
 * Step 7 — bills and payments (OP, lab, scan, and inpatient stays).
 * Pharmacy bills are their own step.
 *
 * Every SwiftEHR bill becomes a Uyirly bill on its own date, under its old
 * number, so the money reports cover the old period (owner's decision).
 *
 *  - Number: as printed. SwiftEHR restarted its OP/Lab/Scan/IP series on
 *    1 April 2025, so a Jan–Mar 2025 number reused later gets "/24-25"
 *    (owner's decision: tag only the clashes). Unpaid bills SwiftEHR never
 *    numbered get "<series>-DUE-n".
 *  - Amounts follow Uyirly's own rule: subtotal = the lines, total = subtotal
 *    − discount rounded to the rupee, paid = the payments, status from those.
 *    No GST: hospital services are exempt and SwiftEHR charged none.
 *  - Lines carry their income head (consultation, room, nursing, lab, scans,
 *    procedures), which is what the revenue-by-department reports read.
 *  - OP/lab/scan payments: one row per receipt, split by mode where SwiftEHR
 *    recorded the split (with the UPI reference). ₹0 receipts are skipped.
 *  - Inpatient money the way Uyirly keeps it: advance receipts → deposits on
 *    their own day (counted as cash-in then), the advance applied to the stay
 *    bill as an 'advance' payment (never counted twice), refunds → advance
 *    refunds, bill receipts → payments.
 *  - Cancelled bills come in cancelled (every report leaves those out).
 *  - Duplicates in the export (the same bill twice; IP-388 in both exports)
 *    come in once; the running bills of the 7 stays still open in SwiftEHR
 *    wait for the top-up.
 */
import { db, loadItems, ymd, hms, istStamp, loggedIds, logThenInsert, undoStep, type Tenant, type Planned } from '../lib'
import { key, NOT_LAB } from '../lab-map'

const STEP = 'bills'
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v != null ? String(v) : '') || null
const num = (v: unknown) => Number(v ?? 0) || 0
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const METHOD: Record<string, string> = { CASH: 'cash', UPI: 'upi', CARD: 'card', NEFT: 'bank_transfer', RTGS: 'bank_transfer', IMPS: 'bank_transfer', BANK: 'bank_transfer', CHEQUE: 'bank_transfer' }
const methodOf = (mode: unknown) => METHOD[String(mode ?? '').split(',')[0].trim().toUpperCase()] ?? 'cash'
/** "28-08-2026 | 12:24 PM" (IST) → timestamp. */
const swiftStamp = (s: unknown) => { const d = ymd(s); return d ? istStamp(d, hms(s)) : null }
/** "2025-02-28 05:29:38.0" is UTC. */
const utcStamp = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? `${s.slice(0, 10)}T${s.slice(11, 19)}Z` : null)
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)

/** Income head of an OP / stay bill line. */
function sourceOf(type: string, itemType: unknown, name: string): string {
  const n = name.toUpperCase(), it = String(itemType ?? '').toUpperCase()
  if (type === 'lab') return NOT_LAB.has(key(name)) ? 'radiology' : 'lab'
  if (type === 'scan' || it === 'SCAN') return 'radiology'
  if (it === 'LAB') return NOT_LAB.has(key(name)) ? 'radiology' : 'lab'
  if (/PHARMACY/.test(n)) return 'ipd_pharmacy'
  if (/SUGAR STRIP/.test(n)) return 'lab'
  if (/ICU (CHARGE|CHARGES)?$|^ICU$/.test(n) && !/CONSULT/.test(n)) return 'icu'
  if (/ROOM|^AC$|NON AC|GENERAL WARD|^EMERGENCY$/.test(n)) return 'bed'
  if (/NURS|NURSE/.test(n)) return 'nursing'
  if (/CONSULT|DOCTOR|HOME VISIT|EMERGENCY FEES/.test(n)) return 'consultation'
  return 'manual'
}

type Bill = { key: string; row: Record<string, unknown>; items: Planned[]; pays: Planned[]; advances: Planned[]; refunds: Planned[]; series: string; no: string | null; day: string; numbered: boolean }

export async function plan(t: Tenant) {
  const patients = await loggedIds(t, 'patients'), visits = await loggedIds(t, 'visits'), admissions = await loggedIds(t, 'admissions')
  if (!patients.size || !visits.size || !admissions.size) throw new Error('Run the patients, opd and admissions steps first.')
  const out: Bill[] = []
  const c = { op: 0, lab: 0, scan: 0, stay: 0, cancelled: 0, duplicate: 0, openStay: 0, empty: 0, zeroReceipts: 0, splitReceipts: 0, multiModeUnsplit: 0, noPatient: 0, mismatch: 0, settled: 0, settledAmount: 0 }
  const mismatches: string[] = []
  const seenBill = new Set<string>()

  // ── Inpatient stays (their bill lives on the stay) ──
  for (const it of loadItems<any>('patients')) {
    const pid = patients.get(`patient:${it.patient.patientId}`)!
    for (const v of it.visits ?? []) {
      if (!v.bill) continue
      const L = v.bill.lines, billId = String(L.billId)
      seenBill.add(billId)
      const admId = admissions.get(`admission:${v.visit.visitId}`)
      if (!admId) { c.openStay++; continue }
      const at = swiftStamp(L.dischargeDate) ?? utcStamp(v.visit.admissionDate)!
      const b = mkBill(`bill:${billId}`, pid, null, admId, clean(L.billNo), 'DRKMCH-IP', at, 'manual', num(L.discountAmount), num(L.discountPercent), false)
      // Two stays' totals are their lines AFTER the lines' own discounts (the
      // bill discount is on top); the rest are the lines before.
      const gross = (L.billItem ?? []).reduce((s: number, l: any) => s + num(l.amount), 0)
      const net = (L.billItem ?? []).reduce((s: number, l: any) => s + num(l.netAmount ?? l.amount), 0)
      const lineNet = Math.abs(num(L.totalAmount) - net) < 1 && Math.abs(num(L.totalAmount) - gross) >= 1
      for (const [i, l] of (L.billItem ?? []).entries()) {
        const name = clean(l.itemName) ?? 'Charge'
        b.items.push(item(`billitem:${billId}:${l.billItemId ?? i}`, sourceOf('ip', l.itemType, name), name, lineNet ? { ...l, amount: l.netAmount } : l, at))
      }
      let advance = 0, refund = 0
      for (const r of v.bill.receipts ?? []) {
        const amt = num(r.amount), when = swiftStamp(r.createdDt) ?? at
        if (amt <= 0) { c.zeroReceipts++; continue }
        if (r.paymentType === 'advance') {
          advance += amt
          b.advances.push({ key: `advance:${r.receiptId}`, row: { admission_id: admId, amount: amt, method: methodOf(r.paymentMode), received_by: null, received_at: when, account_id: null } })
        } else if (r.paymentType === 'refund') {
          refund += amt
          b.refunds.push({ key: `advrefund:${r.receiptId}`, row: { admission_id: admId, amount: amt, method: methodOf(r.paymentMode), refunded_by: null, refunded_at: when } })
        } else {
          if (String(r.paymentMode).includes(',')) c.multiModeUnsplit++
          b.pays.push(pay(`payment:${r.receiptId}`, amt, methodOf(r.paymentMode), receiptRef(r), when))
        }
      }
      if (advance - refund > 0) b.pays.push(pay(`advapply:${billId}`, round2(advance - refund), 'advance', 'Advance applied (SwiftEHR)', at))
      out.push(b); c.stay++
    }
  }

  // ── OP, lab and scan bills ──
  for (const x of loadItems<any>('bills')) {
    if (!x.type || x.type === 'ip') { if (x.type === 'ip' && !seenBill.has(String(x.bill?.billId))) c.openStay++; else if (x.type === 'ip') c.duplicate++; continue }
    const B = x.bill, billId = String(B.billId)
    if (seenBill.has(billId)) { c.duplicate++; continue }
    seenBill.add(billId)
    const lines = x.lines?.billItem ?? x.lines?.labBillItems ?? []
    if (!lines.length && num(B.totalAmount) === 0) { c.empty++; continue }
    const pid = patients.get(`patient:${B.patientId}`)
    if (!pid) { c.noPatient++; continue }
    const at = swiftStamp(B.billedDate) ?? utcStamp(B.createdDate)
      ?? (lines[0]?.dateOfService ? istStamp(ymd(lines[0].dateOfService)!, '12:00:00') : null) ?? swiftStamp(x.receipts?.[0]?.createdDt)!
    const series = { op: 'DRKMCH-OP', lab: 'DRKMCH-Lab', scan: 'DRKMCH-Scan' }[x.type as 'op' | 'lab' | 'scan']
    const visitId = visits.get(`visit:${B.encounterId}`) ?? null
    const names = lines.map((l: any) => sourceOf(x.type, l.itemType, clean(l.itemName) ?? ''))
    const billSource = x.type === 'lab' ? 'lab' : x.type === 'scan' ? 'radiology' : names.every((s: string) => s === 'consultation') ? 'consultation' : 'manual'
    const cancelled = B.status === 'Cancelled'
    const b = mkBill(`bill:${billId}`, pid, visitId, null, clean(B.billNo), series, at, billSource, num(B.discountAmount), num(B.discountPercent), cancelled)
    for (const [i, l] of lines.entries()) {
      const name = clean(l.itemName) ?? 'Charge'
      b.items.push(item(`billitem:${billId}:${l.billItemId ?? i}`, sourceOf(x.type, l.itemType, name), name, l, at))
    }
    if (cancelled) c.cancelled++
    else {
      // The split SwiftEHR kept per mode (with the UPI reference), when it adds up to the receipts.
      const money = (x.receipts ?? []).filter((r: any) => num(r.amount) > 0)
      c.zeroReceipts += (x.receipts ?? []).length - money.length
      const split = (x.lines?.receiptPaymentArr ?? []).filter((p: any) => num(p.amount) > 0)
      const total = money.reduce((s: number, r: any) => s + num(r.amount), 0)
      if (money.length === 1 && split.length > 1 && Math.abs(split.reduce((s: number, p: any) => s + num(p.amount), 0) - total) < 0.5) {
        c.splitReceipts++
        const r = money[0]
        split.forEach((p: any, i: number) => b.pays.push(pay(`payment:${r.receiptId}:${i}`, num(p.amount), methodOf(p.paymentMode),
          `${clean(r.receiptNo)}${clean(p.referenceCode) ? ` · ${String(p.paymentMode).toUpperCase()} ${clean(p.referenceCode)}` : ''}`, swiftStamp(r.createdDt) ?? at)))
      } else {
        for (const r of money) {
          if (String(r.paymentMode).includes(',')) c.multiModeUnsplit++
          const utr = money.length === 1 && split.length === 1 ? clean(split[0].referenceCode) : null
          b.pays.push(pay(`payment:${r.receiptId}`, num(r.amount), methodOf(r.paymentMode), `${receiptRef(r)}${utr ? ` · UPI ${utr}` : ''}`, swiftStamp(r.createdDt) ?? at))
        }
      }
    }
    out.push(b); c[x.type as 'op' | 'lab' | 'scan']++
  }

  // ── Numbers: tag the Jan–Mar 2025 ones reused after the April 2025 restart ──
  const byNo = new Map<string, Bill[]>()
  for (const b of out) if (b.no) byNo.set(b.no, [...(byNo.get(b.no) ?? []), b])
  let tagged = 0, stillTwice = 0
  for (const [, bs] of byNo) {
    if (bs.length < 2) continue
    for (const b of bs) if (b.day < '2025-04-01') { b.row.bill_no = `${b.no}/24-25`; tagged++ }
  }
  const finalNo = new Map<string, number>()
  for (const b of out) if (b.row.bill_no) finalNo.set(String(b.row.bill_no), (finalNo.get(String(b.row.bill_no)) ?? 0) + 1)
  for (const [, n] of finalNo) if (n > 1) stillTwice++
  const due = new Map<string, number>()
  for (const b of out.filter((x) => !x.no).sort((a, z) => a.day.localeCompare(z.day))) {
    const n = (due.get(b.series) ?? 0) + 1
    due.set(b.series, n)
    b.row.bill_no = `${b.series}-DUE-${n}`
  }

  // ── Totals the way Uyirly computes them; compare with what SwiftEHR says was settled ──
  for (const b of out) {
    const subtotal = round2(b.items.reduce((s, i) => s + Number(i.row.amount), 0))
    const discount = Math.min(Number(b.row.discount), subtotal)
    const pre = subtotal - discount
    const total = Math.round(pre)
    // Owner's decision (16 Nov): what SwiftEHR left unpaid is marked paid, as
    // cash collected on the bill's own day, so it is not carried as a due.
    const owed = round2(total - b.pays.reduce((s, p) => s + Number(p.row.amount), 0))
    if (b.row.status !== 'cancelled' && owed > 0.004) {
      b.pays.push(pay(`settle:${b.key}`, owed, 'cash', 'Settled outside SwiftEHR (marked paid at import)', String(b.row.created_at)))
      c.settled++; c.settledAmount += owed
    }
    const paid = round2(b.pays.reduce((s, p) => s + Number(p.row.amount), 0))
    Object.assign(b.row, {
      subtotal, discount, total, round_off: round2(total - pre), paid,
      // Nothing left to pay is paid (a free or fully discounted bill included).
      status: b.row.status === 'cancelled' ? 'cancelled' : paid >= total ? 'paid' : paid <= 0 ? 'unpaid' : 'partial',
    })
    if (b.row.status !== 'cancelled' && b.numbered && Math.abs(paid - total) > 1) {
      c.mismatch++
      if (mismatches.length < 8) mismatches.push(`${b.row.bill_no}: total ₹${total}, paid ₹${paid}`)
    }
  }
  return { out, c, tagged, stillTwice, due: Object.fromEntries(due), mismatches }

  function mkBill(k: string, pid: string, visitId: string | null, admId: string | null, no: string | null, series: string, at: string,
    source: string, discount: number, pct: number, cancelled: boolean): Bill {
    return {
      key: k, series, no, day: istDay(at), numbered: !!no, items: [], pays: [], advances: [], refunds: [],
      row: {
        patient_id: pid, visit_id: visitId, admission_id: admId, bill_no: no, discount, discount_pct: pct, discount_reason: discount > 0 ? 'Discount given in SwiftEHR' : null,
        tax: 0, cgst: 0, sgst: 0, igst: 0, status: cancelled ? 'cancelled' : 'unpaid', created_by: null, created_at: at, billing_date: istDay(at),
        bill_source: source, appointment_id: null, consolidated_by: null, emergency_case_id: null,
      },
    }
  }
  function item(k: string, source: string, name: string, l: any, at: string): Planned {
    const amount = round2(num(l.amount)), qty = num(l.quantity) || 1
    return { key: k, row: { bill_id: null, source, ref_id: null, description: name, qty, unit_price: round2(num(l.unitPrice) || amount / qty), amount,
      created_at: at, gst_rate: 0, hsn_sac: null, tax_inclusive: false, taxable_value: amount, tax_amount: 0 } }
  }
  function pay(k: string, amount: number, method: string, reference: string | null, at: string): Planned {
    return { key: k, row: { bill_id: null, amount: round2(amount), method, reference, received_by: null, received_at: at, payment_group_id: null, account_id: null } }
  }
  function receiptRef(r: any) {
    const modes = String(r.paymentMode ?? '')
    return `${clean(r.receiptNo) ?? 'SwiftEHR receipt'}${modes.includes(',') ? ` · paid by ${modes.split(',').map((m) => m.trim()).join(' + ')}` : ''}`
  }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { out, c, tagged, stillTwice, due, mismatches } = await plan(t)
  const live = out.filter((b) => b.row.status !== 'cancelled')
  const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0))
  const items = out.flatMap((b) => b.items), pays = out.flatMap((b) => b.pays), advs = out.flatMap((b) => b.advances), refs = out.flatMap((b) => b.refunds)
  console.log(`bills: ${out.length}`, c)
  console.log(`  numbers tagged /24-25: ${tagged} · still used twice: ${stillTwice} · unnumbered unpaid given DUE numbers:`, due)
  console.log(`  lines ${items.length} · payments ${pays.length} · advance deposits ${advs.length} · advance refunds ${refs.length}`)
  console.log(`  billed (not cancelled): ₹${sum(live.map((b) => Number(b.row.total)))} · discount ₹${sum(live.map((b) => Number(b.row.discount)))} · paid ₹${sum(live.map((b) => Number(b.row.paid)))}`)
  console.log(`  cash-in (payments other than advance + deposits − refunds): ₹${sum(pays.filter((p) => p.row.method !== 'advance').map((p) => Number(p.row.amount))) + sum(advs.map((a) => Number(a.row.amount))) - sum(refs.map((r) => Number(r.row.amount)))}`)
  const st: Record<string, number> = {}
  for (const b of out) st[String(b.row.status)] = (st[String(b.row.status)] ?? 0) + 1
  console.log('  status:', st, '· outstanding ₹', sum(live.map((b) => Number(b.row.total) - Number(b.row.paid)).filter((x) => x > 0)))
  const heads: Record<string, number> = {}
  for (const b of live) for (const i of b.items) heads[String(i.row.source)] = (heads[String(i.row.source)] ?? 0) + Number(i.row.amount)
  console.log('  lines by income head (before discount):', Object.fromEntries(Object.entries(heads).map(([k, v]) => [k, Math.round(v)])))
  if (mismatches.length) console.log(`  BILLS WHERE PAID ≠ TOTAL (${c.mismatch}):`, mismatches)
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  if (stillTwice) throw new Error('Some bill numbers are still used twice.')

  const rb = await logThenInsert(t, STEP, 'bills', out.map((b) => ({ key: b.key, row: b.row })), undefined, 200)
  console.log(`bills written: ${rb.inserted} new, ${rb.existing} already there`)
  const ids = await loggedIds(t, 'bills')
  for (const b of out) for (const x of [...b.items, ...b.pays]) x.row.bill_id = ids.get(b.key)
  const ri = await logThenInsert(t, STEP, 'bill_items', items, undefined, 300)
  console.log(`bill lines written: ${ri.inserted} new, ${ri.existing} already there`)
  const ra = await logThenInsert(t, STEP, 'admission_advances', advs)
  const rr = await logThenInsert(t, STEP, 'admission_advance_refunds', refs)
  console.log(`advance deposits written: ${ra.inserted} new · advance refunds: ${rr.inserted} new`)
  const rp = await logThenInsert(t, STEP, 'payments', pays, undefined, 300)
  console.log(`payments written: ${rp.inserted} new, ${rp.existing} already there`)

  // The stay's summary carries its old IP bill number. Uyirly gives a summary
  // its own number the first time it is opened; an old stay already has one.
  let named = 0
  for (const b of out.filter((x) => x.row.admission_id)) {
    const { error } = await db().from('admissions').update({ combined_bill_no: b.row.bill_no })
      .eq('tenant_id', t.id).eq('id', String(b.row.admission_id))
    if (error) throw new Error(`summary number failed: ${error.message}`)
    named++
  }
  console.log(`stay summaries numbered with their old IP bill: ${named}`)
}

export async function undo(t: Tenant): Promise<void> {
  // The old IP bill numbers come off the imported stays' summaries first.
  const stays = [...(await loggedIds(t, 'admissions')).values()]
  for (let i = 0; i < stays.length; i += 100) {
    const { error } = await db().from('admissions').update({ combined_bill_no: null })
      .eq('tenant_id', t.id).in('id', stays.slice(i, i + 100)).like('combined_bill_no', 'DRKMCH-IP-%')
    if (error) throw new Error(`summary number undo failed: ${error.message}`)
  }
  await undoStep(t, STEP, ['payments', 'admission_advance_refunds', 'admission_advances', 'bill_items', 'bills'])
}
