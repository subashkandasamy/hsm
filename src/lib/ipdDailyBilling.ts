import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { autoIpdBill, syncNursingBillLine, type IpdBillLineItem } from '@/lib/ipdBilling'
import { roomRentGstRate } from '@/lib/billing/gst'
import { tenantHasIpd } from '@/lib/billing/ipdAccess'
import { istDate, istAddDays as addDays } from '@/lib/istDate'

export interface DailyBillAdmission {
  id: string
  patient_id: string
  admitting_doctor_id?: string | null
  admitted_at?: string | null
  ward: { name: string; daily_rate: number; room_type?: { is_icu: boolean | null } | null }
}

export { istDate }

/**
 * Stable per-charge line reference (bill_items.ref_id is a uuid). The same
 * admission + charge always maps to the same id, so re-runs dedup, while
 * different charges no longer collide — they used to all share the admission id,
 * so once one extra charge was on the day's bill every other one was filtered out.
 */
function chargeRef(admissionId: string, key: string): string {
  const h = createHash('sha1').update(`ipd-daily-charge:${admissionId}:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** How far back the catch-up will bill a missed day automatically. */
export const CATCH_UP_MAX_DAYS = 31

/**
 * Core daily-charge generator for a single tenant's active admissions.
 *
 * Pure and dependency-injected: it takes the Supabase client, the acting
 * profile id (for `created_by`), and the tenant id explicitly — it does NOT
 * read the request session. This lets it run both from a logged-in page load
 * (RLS-scoped client, current user) and from a headless cron (service-role
 * client, per-tenant system actor). Idempotent: every write dedups on
 * (tenant, admission, date, bill_source) + ref_id, so it is safe to run
 * repeatedly on the same day.
 *
 * That last sentence is now true rather than aspirational. It was asserted here
 * while all four daily charges passed `ref_id: null`, and autoIpdBill treats a
 * null ref as always-new (`!i.ref_id ||`), so the claim was false for exactly
 * the charges this function generates (F-36). The bill itself could never be
 * duplicated — `idx_bills_ipd_daily_dedup` is a unique index — but a run that
 * found the bill another run had just created would append the same room-rent
 * line a second time. Narrow, and reachable: this runs on every IPD ward-board
 * page load as well as from the daily cron. Each charge now carries a
 * deterministic ref.
 */
export async function generateDailyChargesForAdmissions(
  supabase: SupabaseClient,
  actorId: string,
  tenantId: string,
  admissions: DailyBillAdmission[],
  date?: string,             // 'YYYY-MM-DD' IST; defaults to today. Past dates = catch-up.
): Promise<void> {
  if (!admissions.length) return
  if (!(await tenantHasIpd(tenantId))) return   // plan without IPD — no charges
  // Named `today` for readability: it is "the day being billed".
  const today = date ?? istDate()
  const isBackfill = today < istDate()
  const admissionIds = admissions.map((a) => a.id)

  // ── 1. Fetch billing config + custom charges for this tenant once ─────────────
  const [{ data: cfg }, { data: customCharges }] = await Promise.all([
    supabase.from('ipd_billing_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('ipd_custom_charges').select('id, name, amount').eq('tenant_id', tenantId).eq('is_active', true),
  ])

  const chargeRoomRent  = cfg?.charge_room_rent     ?? true
  const chargeDoctorFee = cfg?.charge_doctor_fee    ?? true
  const chargeNursing   = cfg?.charge_nursing       ?? true
  const chargeAdmFee    = cfg?.charge_admission_fee ?? false
  const admFeeAmount    = (cfg?.admission_fee_amount  as number) ?? 0
  const svcCharge       = (cfg?.service_charge_per_day as number) ?? 0

  // ── 2. Fetch today's non-cancelled bills for these admissions ────────────────
  const { data: todayBills } = await supabase
    .from('bills')
    .select('id, admission_id, bill_source')
    .in('admission_id', admissionIds)
    .eq('billing_date', today)
    .neq('status', 'cancelled')

  const billedToday = new Map<string, Set<string>>()
  for (const b of todayBills ?? []) {
    const aid = b.admission_id as string
    if (!billedToday.has(aid)) billedToday.set(aid, new Set())
    billedToday.get(aid)!.add(b.bill_source as string)
  }

  // ── 3. Room rent (own 'bed' bill/day) ────────────────────────────────────────
  if (chargeRoomRent) {
    for (const adm of admissions) {
      if (billedToday.get(adm.id)?.has('bed')) continue
      const rate = adm.ward?.daily_rate ?? 0
      if (rate <= 0) continue
      // Room rent is the one in-patient charge GST reaches: 5% on a non-ICU
      // room above ₹5,000/day. Passed as a per-line override because
      // gstForSource('bed') cannot see the room — it has only the source.
      const roomGst = roomRentGstRate({ dailyRate: rate, isIcu: adm.ward?.room_type?.is_icu })
      await autoIpdBill(supabase, actorId, {
        tenantId, admissionId: adm.id, patientId: adm.patient_id,
        billingDate: today, billSource: 'bed',
        // ref_id = the admission id, NOT a synthetic chargeRef (F-36). A 'bed'
        // line's ref is an admission id by convention, and that convention is
        // enforced in two places: generateBill's TABLE_MAP flips
        // `admissions.billing_status` by this ref, and admissionOfCharges reads
        // it as the admission. A synthetic uuid here would match no admission
        // row and roll the manual bill back. The real id is both correct for
        // those readers and sufficient for dedup, since autoIpdBill matches
        // refs within the day's bill and there is one bed bill per day.
        lineItems: [{ source: 'bed', ref_id: adm.id, description: adm.ward?.name ? `${adm.ward.name} — Room Rent` : 'Room Rent', qty: 1, unit_price: rate, gst_rate: roomGst }],
      })
    }
  }

  // ── 3b. ICU monitoring + ventilator (own 'icu' bill/day) ─────────────────────
  // Separate bill_source so a mid-day ICU flag still bills even after the day's
  // room bill was already created (the 'bed' guard no longer suppresses it).
  {
    const icuPerDay  = (cfg?.icu_charge_per_day        as number) ?? 0
    const ventPerDay = (cfg?.ventilator_charge_per_day as number) ?? 0
    if (isBackfill && icuPerDay > 0) {
      // A past day can't use today's flags — bill ICU monitoring from the ICU
      // stay history instead. Ventilator use has no history, so it isn't backfilled.
      const { data: stays } = await supabase
        .from('icu_stays').select('admission_id, entered_at, exited_at').in('admission_id', admissionIds)
      for (const adm of admissions) {
        if (billedToday.get(adm.id)?.has('icu')) continue
        const inIcu = (stays ?? []).some((s) =>
          s.admission_id === adm.id &&
          istDate(s.entered_at as string) <= today &&
          (!s.exited_at || istDate(s.exited_at as string) >= today))
        if (!inIcu) continue
        await autoIpdBill(supabase, actorId, {
          tenantId, admissionId: adm.id, patientId: adm.patient_id,
          billingDate: today, billSource: 'icu',
          lineItems: [{ source: 'icu', ref_id: chargeRef(adm.id, 'icu_monitoring'), description: 'ICU monitoring charge', qty: 1, unit_price: icuPerDay }],
        })
      }
    } else if (!isBackfill && (icuPerDay > 0 || ventPerDay > 0)) {
      const { data: critRows } = await supabase
        .from('admissions')
        .select('id, is_critical_care, on_ventilator, ward:wards(room_type:ward_room_types(is_icu))')
        .in('id', admissionIds)
      const critMap = new Map((critRows ?? []).map((r) => [r.id as string, r]))
      for (const adm of admissions) {
        if (billedToday.get(adm.id)?.has('icu')) continue
        const crit = critMap.get(adm.id)
        // ICU monitoring only when actually in an ICU bed (option B); the
        // ventilator charge applies wherever the patient is ventilated.
        const inIcuBed = !!((crit?.ward as unknown as { room_type?: { is_icu?: boolean } | null } | null)?.room_type?.is_icu)
        const items: IpdBillLineItem[] = []
        // 'icu' carries no ref convention and two different charges share the
        // day's bill, so each gets its own deterministic ref.
        if (crit?.is_critical_care && inIcuBed && icuPerDay > 0) items.push({ source: 'icu', ref_id: chargeRef(adm.id, 'icu_monitoring'), description: 'ICU monitoring charge', qty: 1, unit_price: icuPerDay })
        if (crit?.on_ventilator && ventPerDay > 0) items.push({ source: 'icu', ref_id: chargeRef(adm.id, 'ventilator'), description: 'Ventilator charge', qty: 1, unit_price: ventPerDay })
        if (!items.length) continue
        await autoIpdBill(supabase, actorId, {
          tenantId, admissionId: adm.id, patientId: adm.patient_id,
          billingDate: today, billSource: 'icu', lineItems: items,
        })
      }
    }
  }

  // ── 4. Daily doctor fee ───────────────────────────────────────────────────────
  if (chargeDoctorFee) {
    const doctorIds = [...new Set(admissions.map((a) => a.admitting_doctor_id).filter(Boolean) as string[])]
    const feeMap = new Map<string, number>()
    if (doctorIds.length) {
      const { data: spRows } = await supabase
        .from('staff_profiles').select('profile_id, consultation_fee').in('profile_id', doctorIds)
      for (const sp of spRows ?? []) feeMap.set(sp.profile_id as string, (sp.consultation_fee as number) ?? 0)
    }
    for (const adm of admissions) {
      // NB: don't skip on a 'consultation' bill existing — consultant visits
      // (P0.1) also bill to 'consultation'. autoIpdBill dedups the attending's
      // daily fee by ref_id = admission id, so it's added at most once/day.
      if (!adm.admitting_doctor_id) continue
      const fee = feeMap.get(adm.admitting_doctor_id) ?? 0
      if (fee <= 0) continue
      await autoIpdBill(supabase, actorId, {
        tenantId,
        admissionId: adm.id,
        patientId: adm.patient_id,
        billingDate: today,
        billSource: 'consultation',
        lineItems: [{ source: 'consultation', ref_id: adm.id, description: `Daily doctor rounding fee`, qty: 1, unit_price: fee }],
      })
    }
  }

  // ── 5. Nursing bills ──────────────────────────────────────────────────────────
  // Carry forward the latest nurse per shift and bill each shift onto the day's
  // single 'nursing' bill (one line per shift, deduped by shift_definition id).
  if (chargeNursing) {
    const { data: allAssignments } = await supabase
      .from('admission_nurse_assignments')
      .select('admission_id, shift, charge_snapshot')
      .in('admission_id', admissionIds)
      .lte('assigned_date', today)
      .order('assigned_date', { ascending: false })

    const latestPerShift = new Map<string, { admissionId: string; shift: string; chargeSnapshot: number }>()
    for (const a of allAssignments ?? []) {
      const key = `${a.admission_id}:${a.shift}`
      if (!latestPerShift.has(key)) {
        latestPerShift.set(key, {
          admissionId: a.admission_id as string,
          shift: a.shift as string,
          chargeSnapshot: a.charge_snapshot as number,
        })
      }
    }

    if (latestPerShift.size > 0) {
      // Map shift code → { id, label } for active shifts (billing dedup key + label)
      const { data: shiftDefs } = await supabase
        .from('shift_definitions').select('id, code, label').eq('is_active', true)
      const shiftMap = new Map((shiftDefs ?? []).map(s => [s.code as string, { id: s.id as string, label: s.label as string }]))
      const admissionMap = new Map(admissions.map((a) => [a.id, a]))

      for (const [, entry] of latestPerShift) {
        const def = shiftMap.get(entry.shift)
        if (!def) continue     // shift deactivated — skip
        const adm = admissionMap.get(entry.admissionId)
        if (!adm) continue
        await syncNursingBillLine(supabase, actorId, {
          tenantId,
          admissionId: entry.admissionId,
          patientId: adm.patient_id,
          date: today,
          shiftDefId: def.id,
          description: `Nursing — ${def.label} Shift`,
          charge: entry.chargeSnapshot,
        })
      }
    }
  }

  // ── 6. Admission fee (Day 1 only), service charge, custom charges ─────────────
  // Each charge has its own line ref, so a charge added later in the day (a new
  // custom charge, or the admission fee after the service charge was billed) is
  // still appended to the day's 'manual' bill instead of being skipped.
  const { data: manualLines } = await supabase
    .from('bill_items')
    .select('ref_id, description, bill:bills!inner(admission_id, billing_date, bill_source, status)')
    .eq('source', 'manual')
    .in('bill.admission_id', admissionIds)
    .eq('bill.billing_date', today)
    .eq('bill.bill_source', 'manual')
    .neq('bill.status', 'cancelled')
  const billedRefs = new Set<string>()
  const legacyDescs = new Map<string, Set<string>>()   // lines from before per-charge refs
  for (const l of (manualLines ?? []) as unknown as Array<{ ref_id: string | null; description: string; bill: { admission_id: string } }>) {
    if (l.ref_id) billedRefs.add(l.ref_id)
    if (l.ref_id === l.bill.admission_id) {
      if (!legacyDescs.has(l.bill.admission_id)) legacyDescs.set(l.bill.admission_id, new Set())
      legacyDescs.get(l.bill.admission_id)!.add(l.description)
    }
  }

  for (const adm of admissions) {
    const lineItems: IpdBillLineItem[] = []
    const add = (key: string, description: string, amount: number) => {
      const ref = chargeRef(adm.id, key)
      if (billedRefs.has(ref) || legacyDescs.get(adm.id)?.has(description)) return
      lineItems.push({ source: 'manual', ref_id: ref, description, qty: 1, unit_price: amount })
    }

    // Admission fee — Day 1 only
    if (chargeAdmFee && admFeeAmount > 0) {
      const dayOne = adm.admitted_at ? istDate(adm.admitted_at) : null
      if (dayOne === today) add('admission_fee', 'Admission fee', admFeeAmount)
    }

    // Daily service charge
    if (svcCharge > 0) add('service_charge', 'Daily service charge', svcCharge)

    // Active custom charges (keyed by the charge's id, so a rename doesn't re-bill)
    for (const cc of customCharges ?? []) {
      const amt = (cc.amount as number) ?? 0
      if (amt > 0) add(`custom:${cc.id as string}`, cc.name as string, amt)
    }

    if (!lineItems.length) continue
    await autoIpdBill(supabase, actorId, {
      tenantId,
      admissionId: adm.id,
      patientId: adm.patient_id,
      billingDate: today,
      billSource: 'manual',
      lineItems,
    })
  }
}

export interface CatchUpResult {
  /** Past days that were billed by this run (today is not included). */
  backfilled: Array<{ admissionId: string; date: string }>
  /** Unbilled days older than CATCH_UP_MAX_DAYS — left for staff to review. */
  skippedOlder: Array<{ admissionId: string; days: number }>
}

/**
 * Bills every missed day for each admission, then today.
 *
 * The daily generator only ever billed "today", so a day the cron / ward board /
 * discharge never ran for stayed unbilled forever. This walks each stay from the
 * admission date and runs the generator for every day with no room-rent charge,
 * oldest first, then runs today as before (which also picks up mid-day nurse or
 * ICU changes). Idempotent — re-running adds nothing.
 *
 * A day counts as already handled when it has a room-rent bill in ANY status: a
 * room-rent bill staff cancelled was a deliberate decision and must not be
 * re-created. Nights covered by a manual whole-stay "Bed charges (N nights)"
 * line also count. Missed days use the rate of the last room-rent bill before
 * them (there is no ward-transfer history), falling back to the current ward.
 * Days recorded in ipd_billing_blocked_days (hospital read-only, or on a plan
 * without IPD) are never billed, and a tenant whose plan lacks IPD bills nothing.
 */
export async function catchUpDailyCharges(
  supabase: SupabaseClient,
  actorId: string,
  tenantId: string,
  admissions: DailyBillAdmission[],
): Promise<CatchUpResult> {
  const result: CatchUpResult = { backfilled: [], skippedOlder: [] }
  if (!admissions.length) return result
  if (!(await tenantHasIpd(tenantId))) return result   // plan without IPD — no charges

  const today = istDate()
  const windowStart = addDays(today, -(CATCH_UP_MAX_DAYS - 1))
  const admissionIds = admissions.map((a) => a.id)

  const [{ data: cfg }, { data: bedBills }, { data: blockedRows }] = await Promise.all([
    supabase.from('ipd_billing_config').select('charge_room_rent').eq('tenant_id', tenantId).maybeSingle(),
    // Auto room-rent bills ('bed') plus manual bills (no bill_source) that may carry a bed line.
    supabase
      .from('bills')
      .select('admission_id, billing_date, created_at, status, bill_source, items:bill_items(source, description, qty, unit_price)')
      .in('admission_id', admissionIds)
      .or('bill_source.eq.bed,bill_source.is.null'),
    // Days the hospital was blocked (read-only / plan without IPD) — never billed.
    supabase.from('ipd_billing_blocked_days').select('day').eq('tenant_id', tenantId).gte('day', windowStart),
  ])
  const blockedDays = new Set((blockedRows ?? []).map((r) => r.day as string))
  if ((cfg?.charge_room_rent ?? true) === false) {
    // No per-day room-rent marker to detect gaps with — keep the old today-only behaviour.
    await generateDailyChargesForAdmissions(supabase, actorId, tenantId, admissions, today)
    return result
  }

  type BedBill = {
    admission_id: string; billing_date: string | null; created_at: string; status: string; bill_source: string | null
    items: Array<{ source: string; description: string; qty: number; unit_price: number }>
  }

  for (const adm of admissions) {
    if (!adm.admitted_at) continue
    const admitDay = istDate(adm.admitted_at)
    const mine = ((bedBills ?? []) as unknown as BedBill[]).filter((b) => b.admission_id === adm.id)

    const handled = new Set<string>()
    const autoRates: Array<{ date: string; name: string; rate: number }> = []
    for (const b of mine) {
      const bedLines = (b.items ?? []).filter((i) => i.source === 'bed')
      if (!bedLines.length) continue
      if (b.bill_source === 'bed' && b.billing_date) {
        handled.add(b.billing_date)
        if (b.status !== 'cancelled') {
          const line = bedLines[0]
          const name = line.description === 'Room Rent' ? '' : line.description.replace(/ — Room Rent$/, '')
          autoRates.push({ date: b.billing_date, name, rate: Number(line.unit_price) })
        }
      } else if (b.bill_source === null) {
        // Manual whole-stay bed line: covers `qty` nights from the admission day.
        const nights = bedLines.reduce((n, i) => n + Math.max(1, Number(i.qty) || 1), 0)
        for (let k = 0; k < nights; k++) handled.add(addDays(admitDay, k))
      }
    }
    if (!handled.size && !(adm.ward?.daily_rate > 0)) continue   // nothing to charge room rent with

    let olderMissing = 0
    for (let d = admitDay; d < today; d = addDays(d, 1)) {
      if (handled.has(d) || blockedDays.has(d)) continue
      if (d < windowStart) { olderMissing++; continue }
      const prev = autoRates.filter((r) => r.date < d).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
      const ward = prev ? { name: prev.name, daily_rate: prev.rate } : adm.ward
      if (!(ward?.daily_rate > 0)) continue
      await generateDailyChargesForAdmissions(supabase, actorId, tenantId, [{ ...adm, ward }], d)
      result.backfilled.push({ admissionId: adm.id, date: d })
    }
    if (olderMissing) result.skippedOlder.push({ admissionId: adm.id, days: olderMissing })
  }

  // Today always runs for every admission, as before.
  await generateDailyChargesForAdmissions(supabase, actorId, tenantId, admissions, today)
  return result
}
