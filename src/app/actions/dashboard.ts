'use server'

import { createClient } from '@/lib/supabase/server'
import { getReadClient } from '@/lib/supabase/read-replica'
import { getCollectionSummary, SERVICE_BILLS_ONLY, istToday, istDayBoundsISO } from '@/lib/billing/collections'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { AdminKPIs, DoctorKPIs, ReceptionistKPIs, PharmacistKPIs } from '@/lib/types'
import { istDate, istDayStartISO, istDayEndISO } from '@/lib/istDate'
import { listPendingPrescriptions, getAlerts } from '@/app/actions/pharmacy'
import { pageAll } from '@/lib/supabase/pageAll'

/**
 * Today, as the hospital means it.
 *
 * This used to build a day from the server's own clock, which on Vercel is
 * UTC — so "today" began at 05:30 IST. Everything a doctor or receptionist did
 * on the night shift was counted against the previous day, and the tiles
 * disagreed with the Cash Book and with mv_daily_footfall_by_tenant, both of
 * which bucket by Asia/Kolkata.
 */
function todayRange() {
  const day = istToday()
  return { start: istDayStartISO(day), end: istDayEndISO(day) }
}

// IST day — matches mv_daily_footfall_by_tenant, which buckets by Asia/Kolkata.
const today = (): string => istToday()

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

  // These are counted by array length, so a capped read is a wrong number on
  // the front page rather than an error anybody would notice.
  const [appts, registrations] = await Promise.all([
    pageAll<{ id: string; status: string }>((f, t) => supabase.from('appointments')
      .select('id, status').gte('scheduled_at', start).lt('scheduled_at', end).order('id').range(f, t)),
    pageAll<{ id: string }>((f, t) => supabase.from('patients')
      .select('id').gte('created_at', start).lt('created_at', end).order('id').range(f, t)),
  ])

  return {
    todayAppointments: appts.length,
    todayCheckedIn:    appts.filter((a) => a.status === 'checked_in').length,
    todayRegistrations: registrations.length,
  }
}

// ── Pharmacist ────────────────────────────────────────────────────────────────

export async function getPharmacistDashboard(): Promise<PharmacistKPIs> {
  await requirePermission((await getActorProfile()).role, 'dashboard:read')
  const supabase = await createClient()

  // Both tiles are the Pharmacy page's own figures, not a second opinion.
  //
  // They used to be computed here from `prescriptions.status`, `qty_remaining`
  // and `expiry_date` — none of which exist. PostgREST rejected both queries,
  // the errors were never read, and the two tiles on this dashboard read zero
  // for every pharmacy in the product. A pharmacist with eighty expiring
  // batches was told there were none.
  //
  // Even with the column names corrected they would have been wrong: the
  // thresholds here were "< 10 units" and 90 days, where the Pharmacy page
  // uses each drug's own reorder level and 30 days. A tile that disagrees
  // with the screen it links to is its own kind of lie, so these now call the
  // same functions that page does and count what comes back.
  const [pending, alerts] = await Promise.all([
    listPendingPrescriptions(),
    getAlerts(),
  ])

  return {
    pendingPrescriptions: pending.length,
    lowStockCount:        alerts.lowStock.length,
    nearExpiryCount:      alerts.nearExpiry.length,
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
    // received_at, not created_at — payments has no created_at column, so this
    // query was rejected outright and the file downloaded with a header row
    // and nothing under it.
    const { data, error } = await rd
      .from('payments')
      .select('received_at, amount, method, bill_id, bill:bills(bill_no)')
      .eq('tenant_id', actor.tenant_id)
      .gte('received_at', from)
      .lte('received_at', to)
      .order('received_at')
    if (error) throw new Error(`Daily collection export failed: ${error.message}`)
    type Row = { received_at: string; amount: number; method: string; bill_id: string; bill: { bill_no: string } | null }
    csv = 'Date,Amount,Method,Bill No\n' +
      ((data ?? []) as unknown as Row[]).map((r) =>
        `${istDate(r.received_at)},${r.amount},${r.method},${csvCell(r.bill?.bill_no ?? r.bill_id)}`
      ).join('\n')
  }

  else if (params.type === 'patient_footfall') {
    // Paged. An export is chosen by date range, so the row count is whatever
    // the user asked for — a year of a working hospital is far past a thousand,
    // and the file would simply end early with no error and no gap to see.
    const [apptRes, erRes] = await Promise.all([
      pageAll<{ scheduled_at: string; status: string }>((f, t) => rd.from('appointments').select('scheduled_at, status')
        .eq('tenant_id', actor.tenant_id)
        .gte('scheduled_at', from).lte('scheduled_at', to).order('scheduled_at').order('id').range(f, t)),
      // arrived_at, not created_at: emergency_cases has no created_at, so this
      // half silently returned nothing and every day reported zero ER cases.
      pageAll<{ arrived_at: string }>((f, t) => rd.from('emergency_cases').select('arrived_at')
        .eq('tenant_id', actor.tenant_id)
        .gte('arrived_at', from).lte('arrived_at', to).order('id').range(f, t)),
    ])
    const byDay: Record<string, { appointments: number; emergency: number }> = {}
    for (const a of apptRes) {
      const d = istDate(a.scheduled_at as string)
      byDay[d] = byDay[d] ?? { appointments: 0, emergency: 0 }
      byDay[d].appointments++
    }
    for (const e of erRes) {
      const d = istDate(e.arrived_at as string)
      byDay[d] = byDay[d] ?? { appointments: 0, emergency: 0 }
      byDay[d].emergency++
    }
    csv = 'Date,Appointments,Emergency\n' +
      Object.entries(byDay).sort().map(([d, v]) => `${d},${v.appointments},${v.emergency}`).join('\n')
  }

  else if (params.type === 'bed_occupancy') {
    const data = await pageAll<{ admitted_at: string; discharged_at: string | null; bed: unknown }>(
      (f, t) => rd.from('admissions')
        .select('admitted_at, discharged_at, bed:beds(ward:wards(name))')
        .eq('tenant_id', actor.tenant_id)
        .gte('admitted_at', from)
        .lte('admitted_at', to)
        .order('admitted_at').order('id').range(f, t))
    csv = 'Admitted At,Discharged At,Ward\n' +
      data.map((r) => {
        const ward = (r.bed as { ward?: { name?: string } } | null)?.ward?.name ?? ''
        const out  = r.discharged_at ? istDate(r.discharged_at as string) : 'active'
        return `${istDate(r.admitted_at as string)},${out},${csvCell(ward)}`
      }).join('\n')
  }

  else if (params.type === 'test_volumes') {
    // Neither table had the columns this asked for — no `created_at`, no
    // `test_name`, no `study_type` — so both halves were rejected and the file
    // was a header row.
    //
    // Counting lab *items* rather than orders, because the report is called
    // Test Volumes and one order routinely carries several tests. A lab doing
    // forty orders of three tests did not do forty tests.
    const [labRes, radRes] = await Promise.all([
      pageAll<{ created_at: string }>((f, t) => rd.from('lab_order_items').select('created_at')
        .eq('tenant_id', actor.tenant_id)
        .gte('created_at', from).lte('created_at', to).order('id').range(f, t)),
      pageAll<{ ordered_at: string }>((f, t) => rd.from('radiology_orders').select('ordered_at')
        .eq('tenant_id', actor.tenant_id)
        .gte('ordered_at', from).lte('ordered_at', to).order('id').range(f, t)),
    ])
    const byDay: Record<string, { lab: number; radiology: number }> = {}
    for (const l of labRes) {
      const d = istDate(l.created_at as string)
      byDay[d] = byDay[d] ?? { lab: 0, radiology: 0 }
      byDay[d].lab++
    }
    for (const r of radRes) {
      const d = istDate(r.ordered_at as string)
      byDay[d] = byDay[d] ?? { lab: 0, radiology: 0 }
      byDay[d].radiology++
    }
    csv = 'Date,Lab Tests,Radiology Studies\n' +
      Object.entries(byDay).sort().map(([d, v]) => `${d},${v.lab},${v.radiology}`).join('\n')
  }

  return csv
}


/** A value that cannot break the row it sits in. Hospital and ward names contain commas. */
function csvCell(v: string | null | undefined): string {
  const t = (v ?? '').replace(/"/g, '""')
  return /[",\n\r]/.test(t) ? `"${t}"` : t
}
