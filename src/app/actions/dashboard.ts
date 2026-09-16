'use server'

import { createClient } from '@/lib/supabase/server'
import { getReadClient } from '@/lib/supabase/read-replica'
import { getCollectionSummary, istToday, istDayBoundsISO } from '@/lib/billing/collections'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { AdminKPIs, DoctorKPIs, ReceptionistKPIs, PharmacistKPIs } from '@/lib/types'
import { istAddDays, istDayStartISO, istDayEndISO } from '@/lib/istDate'

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  return { start, end }
}

// IST day — matches mv_daily_footfall_by_tenant, which buckets by Asia/Kolkata.
const today = (): string => istToday()

// ── Admin ─────────────────────────────────────────────────────────────────────
// KPI tiles read from materialized views via the read replica (≤5 min stale).
// Pending bills stay live because financial counts need to be accurate.

export async function getAdminDashboard(): Promise<AdminKPIs> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dashboard:read')

  const tid = actor.tenant_id
  const rd  = getReadClient()
  const day = today()
  const primary = await createClient()
  const { from, to } = istDayBoundsISO(istToday())

  const [bedRes, footfallRes, lowStockRes, collection, { data: pendingRows }] = await Promise.all([
    // Operational tiles from materialized views (≤5 min stale is fine here)
    rd.from('mv_bed_occupancy_by_tenant')
      .select('total_beds, occupied_beds')
      .eq('tenant_id', tid)
      .maybeSingle(),
    rd.from('mv_daily_footfall_by_tenant')
      .select('total_footfall')
      .eq('tenant_id', tid)
      .eq('day', day)
      .maybeSingle(),
    rd.from('mv_lowstock_alerts_by_tenant')
      .select('low_stock_count')
      .eq('tenant_id', tid)
      .maybeSingle(),

    // Financial tiles are computed LIVE for accuracy (never stale).
    // Today's revenue = actual money collected today (same basis as the Cash Book).
    getCollectionSummary(primary, tid, from, to),
    // Pending bills = live unpaid/partial bills.
    primary.from('bills').select('total, paid').in('status', ['unpaid', 'partial']),
  ])

  const todayRevenue       = collection.total
  const revenuePayments    = collection.billPayments
  const revenueAdvances    = collection.advances
  const totalBeds          = Number(bedRes.data?.total_beds   ?? 0)
  const occupiedBeds       = Number(bedRes.data?.occupied_beds ?? 0)
  const bedOccupancy       = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0
  const todayFootfall      = Number(footfallRes.data?.total_footfall ?? 0)
  const lowStockCount      = Number(lowStockRes.data?.low_stock_count ?? 0)
  const pending            = (pendingRows ?? []) as Array<{ total: number; paid: number }>
  const pendingBillsCount  = pending.length
  const pendingBillsTotal  = pending.reduce((s, b) => s + Math.max(0, Number(b.total) - Number(b.paid)), 0)

  return {
    todayRevenue, revenuePayments, revenueAdvances,
    bedOccupancy, totalBeds, occupiedBeds,
    todayFootfall, pendingBillsCount, pendingBillsTotal, lowStockCount,
  }
}

// ── Doctor ────────────────────────────────────────────────────────────────────

export async function getDoctorDashboard(): Promise<DoctorKPIs> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dashboard:read')
  const supabase = await createClient()
  const { start, end } = todayRange()

  const { data } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('doctor_id', actor.id)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)

  const appts = (data ?? []) as Array<{ id: string; status: string }>
  const todayTotal     = appts.length
  const todayCompleted = appts.filter((a) => a.status === 'done').length
  const todayPending   = appts.filter((a) => ['booked', 'checked_in'].includes(a.status)).length

  return { todayTotal, todayCompleted, todayPending }
}

// ── Receptionist ──────────────────────────────────────────────────────────────

export async function getReceptionistDashboard(): Promise<ReceptionistKPIs> {
  await requirePermission((await getActorProfile()).role, 'dashboard:read')
  const supabase = await createClient()
  const { start, end } = todayRange()

  const [apptRes, registrationRes] = await Promise.all([
    supabase.from('appointments').select('id, status').gte('scheduled_at', start).lt('scheduled_at', end),
    supabase.from('patients').select('id').gte('created_at', start).lt('created_at', end),
  ])

  const appts = (apptRes.data ?? []) as Array<{ status: string }>
  return {
    todayAppointments: appts.length,
    todayCheckedIn:    appts.filter((a) => a.status === 'checked_in').length,
    todayRegistrations: registrationRes.data?.length ?? 0,
  }
}

// ── Pharmacist ────────────────────────────────────────────────────────────────

export async function getPharmacistDashboard(): Promise<PharmacistKPIs> {
  await requirePermission((await getActorProfile()).role, 'dashboard:read')
  const supabase = await createClient()

  const [pendingRes, stockRes] = await Promise.all([
    supabase.from('prescriptions').select('id').eq('status', 'active').limit(500),
    supabase.from('drug_batches').select('qty_remaining, expiry_date').gt('qty_remaining', 0),
  ])

  const batches = (stockRes.data ?? []) as Array<{ qty_remaining: number; expiry_date: string | null }>
  const soon = istAddDays(istToday(), 90)
  const nearExpiryCount = batches.filter((b) => b.expiry_date && b.expiry_date <= soon).length
  const lowStockCount   = batches.filter((b) => b.qty_remaining < 10).length

  return {
    pendingPrescriptions: pendingRes.data?.length ?? 0,
    lowStockCount,
    nearExpiryCount,
  }
}

// ── CSV Export — routed through read replica ──────────────────────────────────

export async function exportReport(params: {
  type: 'daily_collection' | 'patient_footfall' | 'bed_occupancy' | 'test_volumes'
  dateFrom: string
  dateTo: string
}): Promise<string> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')

  const rd   = getReadClient()
  const from = istDayStartISO(params.dateFrom)
  const to   = istDayEndISO(params.dateTo)

  let csv = ''

  if (params.type === 'daily_collection') {
    const { data } = await rd
      .from('payments')
      .select('created_at, amount, method, bill_id')
      .eq('tenant_id', actor.tenant_id)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at')
    csv = 'Date,Amount,Method,Bill ID\n' +
      (data ?? []).map((r) =>
        `${r.created_at?.slice(0, 10)},${r.amount},${r.method},${r.bill_id}`
      ).join('\n')
  }

  else if (params.type === 'patient_footfall') {
    const [apptRes, erRes] = await Promise.all([
      rd.from('appointments').select('scheduled_at, status')
        .eq('tenant_id', actor.tenant_id)
        .gte('scheduled_at', from).lte('scheduled_at', to).order('scheduled_at'),
      rd.from('emergency_cases').select('created_at')
        .eq('tenant_id', actor.tenant_id)
        .gte('created_at', from).lte('created_at', to),
    ])
    const byDay: Record<string, { appointments: number; emergency: number }> = {}
    for (const a of (apptRes.data ?? [])) {
      const d = (a.scheduled_at as string).slice(0, 10)
      byDay[d] = byDay[d] ?? { appointments: 0, emergency: 0 }
      byDay[d].appointments++
    }
    for (const e of (erRes.data ?? [])) {
      const d = (e.created_at as string).slice(0, 10)
      byDay[d] = byDay[d] ?? { appointments: 0, emergency: 0 }
      byDay[d].emergency++
    }
    csv = 'Date,Appointments,Emergency\n' +
      Object.entries(byDay).sort().map(([d, v]) => `${d},${v.appointments},${v.emergency}`).join('\n')
  }

  else if (params.type === 'bed_occupancy') {
    const { data } = await rd
      .from('admissions')
      .select('admitted_at, discharged_at, bed:beds(ward:wards(name))')
      .eq('tenant_id', actor.tenant_id)
      .gte('admitted_at', from)
      .lte('admitted_at', to)
      .order('admitted_at')
    csv = 'Admitted At,Discharged At,Ward\n' +
      (data ?? []).map((r) => {
        const ward = (r.bed as { ward?: { name?: string } } | null)?.ward?.name ?? ''
        return `${r.admitted_at?.slice(0, 10)},${r.discharged_at?.slice(0, 10) ?? 'active'},${ward}`
      }).join('\n')
  }

  else if (params.type === 'test_volumes') {
    const [labRes, radRes] = await Promise.all([
      rd.from('lab_orders').select('created_at, test_name')
        .eq('tenant_id', actor.tenant_id)
        .gte('created_at', from).lte('created_at', to),
      rd.from('radiology_orders').select('created_at, study_type')
        .eq('tenant_id', actor.tenant_id)
        .gte('created_at', from).lte('created_at', to),
    ])
    const byDay: Record<string, { lab: number; radiology: number }> = {}
    for (const l of (labRes.data ?? [])) {
      const d = (l.created_at as string).slice(0, 10)
      byDay[d] = byDay[d] ?? { lab: 0, radiology: 0 }
      byDay[d].lab++
    }
    for (const r of (radRes.data ?? [])) {
      const d = (r.created_at as string).slice(0, 10)
      byDay[d] = byDay[d] ?? { lab: 0, radiology: 0 }
      byDay[d].radiology++
    }
    csv = 'Date,Lab Tests,Radiology Studies\n' +
      Object.entries(byDay).sort().map(([d, v]) => `${d},${v.lab},${v.radiology}`).join('\n')
  }

  return csv
}
