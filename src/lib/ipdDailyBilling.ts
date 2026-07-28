import type { SupabaseClient } from '@supabase/supabase-js'
import { autoIpdBill, syncNursingBillLine, type IpdBillLineItem } from '@/lib/ipdBilling'

export interface DailyBillAdmission {
  id: string
  patient_id: string
  admitting_doctor_id?: string | null
  admitted_at?: string | null
  ward: { name: string; daily_rate: number }
}

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
 */
export async function generateDailyChargesForAdmissions(
  supabase: SupabaseClient,
  actorId: string,
  tenantId: string,
  admissions: DailyBillAdmission[]
): Promise<void> {
  if (!admissions.length) return
  const today = new Date().toISOString().split('T')[0]
  const admissionIds = admissions.map((a) => a.id)

  // ── 1. Fetch billing config + custom charges for this tenant once ─────────────
  const [{ data: cfg }, { data: customCharges }] = await Promise.all([
    supabase.from('ipd_billing_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('ipd_custom_charges').select('name, amount').eq('tenant_id', tenantId).eq('is_active', true),
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
      await autoIpdBill(supabase, actorId, {
        tenantId, admissionId: adm.id, patientId: adm.patient_id,
        billingDate: today, billSource: 'bed',
        lineItems: [{ source: 'bed', ref_id: null, description: adm.ward?.name ? `${adm.ward.name} — Room Rent` : 'Room Rent', qty: 1, unit_price: rate }],
      })
    }
  }

  // ── 3b. ICU monitoring + ventilator (own 'icu' bill/day) ─────────────────────
  // Separate bill_source so a mid-day ICU flag still bills even after the day's
  // room bill was already created (the 'bed' guard no longer suppresses it).
  {
    const icuPerDay  = (cfg?.icu_charge_per_day        as number) ?? 0
    const ventPerDay = (cfg?.ventilator_charge_per_day as number) ?? 0
    if (icuPerDay > 0 || ventPerDay > 0) {
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
        if (crit?.is_critical_care && inIcuBed && icuPerDay > 0) items.push({ source: 'icu', ref_id: null, description: 'ICU monitoring charge', qty: 1, unit_price: icuPerDay })
        if (crit?.on_ventilator && ventPerDay > 0) items.push({ source: 'icu', ref_id: null, description: 'Ventilator charge', qty: 1, unit_price: ventPerDay })
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
  for (const adm of admissions) {
    if (billedToday.get(adm.id)?.has('manual')) continue

    const lineItems: IpdBillLineItem[] = []

    // Admission fee — Day 1 only
    if (chargeAdmFee && admFeeAmount > 0) {
      const dayOne = adm.admitted_at ? new Date(adm.admitted_at).toISOString().split('T')[0] : null
      if (dayOne === today) {
        lineItems.push({ source: 'manual', ref_id: adm.id, description: 'Admission fee', qty: 1, unit_price: admFeeAmount })
      }
    }

    // Daily service charge
    if (svcCharge > 0) {
      lineItems.push({ source: 'manual', ref_id: adm.id, description: 'Daily service charge', qty: 1, unit_price: svcCharge })
    }

    // Active custom charges
    for (const cc of customCharges ?? []) {
      const amt = (cc.amount as number) ?? 0
      if (amt > 0) lineItems.push({ source: 'manual', ref_id: adm.id, description: cc.name as string, qty: 1, unit_price: amt })
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
