'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { AdminKPIs, DoctorKPIs, ReceptionistKPIs, PharmacistKPIs } from '@/lib/types'

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  return { start, end }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function getAdminDashboard(): Promise<AdminKPIs> {
  await requirePermission((await getActorProfile()).role, 'dashboard:read')
  const supabase = await createClient()
  const { start, end } = todayRange()

  const [paymentsRes, bedsRes, apptRes, emergencyRes, billsRes, pharmAlerts, invAlerts] = await Promise.all([
    // Today's revenue
    supabase.from('payments').select('amount').gte('created_at', start).lt('created_at', end),
    // Bed occupancy
    supabase.from('beds').select('id, status'),
    // Today's appointments
    supabase.from('appointments').select('id').gte('scheduled_at', start).lt('scheduled_at', end),
    // Today's emergency cases
    supabase.from('emergency_cases').select('id').gte('created_at', start).lt('created_at', end),
    // Pending/unpaid bills
    supabase.from('bills').select('id, total').in('status', ['unpaid', 'partial']),
    // Pharmacy low-stock
    supabase.from('drug_batches').select('drug_id, qty_remaining').eq('qty_remaining', 0).limit(1),
    // Inventory alerts
    supabase.from('inventory_items').select('id, qty_in_stock, reorder_level').eq('is_active', true),
  ])

  const todayRevenue = (paymentsRes.data ?? []).reduce((s, p) => s + (p.amount as number), 0)
  const beds = (bedsRes.data ?? []) as Array<{ id: string; status: string }>
  const totalBeds    = beds.length
  const occupiedBeds = beds.filter((b) => b.status === 'occupied').length
  const bedOccupancy = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0
  const todayFootfall = (apptRes.data?.length ?? 0) + (emergencyRes.data?.length ?? 0)
  const pendingBills = (billsRes.data ?? []) as Array<{ id: string; total: number }>
  const pendingBillsCount = pendingBills.length
  const pendingBillsTotal = pendingBills.reduce((s, b) => s + (b.total as number), 0)
  const invItems = (invAlerts.data ?? []) as Array<{ qty_in_stock: number; reorder_level: number }>
  const lowStockCount = invItems.filter((i) => i.qty_in_stock <= i.reorder_level).length

  return {
    todayRevenue, bedOccupancy, totalBeds, occupiedBeds,
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
    todayCheckedIn: appts.filter((a) => a.status === 'checked_in').length,
    todayRegistrations: registrationRes.data?.length ?? 0,
  }
}

// ── Pharmacist ────────────────────────────────────────────────────────────────

export async function getPharmacistDashboard(): Promise<PharmacistKPIs> {
  await requirePermission((await getActorProfile()).role, 'dashboard:read')
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)

  const [pendingRes, stockRes] = await Promise.all([
    supabase.from('prescriptions').select('id').eq('status', 'active').limit(500),
    supabase.from('drug_batches').select('qty_remaining, expiry_date').gt('qty_remaining', 0),
  ])

  const batches = (stockRes.data ?? []) as Array<{ qty_remaining: number; expiry_date: string | null }>
  const soon = new Date(); soon.setDate(soon.getDate() + 90)
  const nearExpiryCount = batches.filter((b) => b.expiry_date && b.expiry_date <= soon.toISOString().slice(0, 10)).length
  const lowStockCount   = batches.filter((b) => b.qty_remaining < 10).length

  return {
    pendingPrescriptions: pendingRes.data?.length ?? 0,
    lowStockCount,
    nearExpiryCount,
  }
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export async function exportReport(params: {
  type: 'daily_collection' | 'patient_footfall' | 'bed_occupancy' | 'test_volumes'
  dateFrom: string
  dateTo: string
}): Promise<string> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')

  const supabase = await createClient()
  const from = params.dateFrom
  const to   = params.dateTo + 'T23:59:59.999Z'

  let csv = ''

  if (params.type === 'daily_collection') {
    const { data } = await supabase
      .from('payments')
      .select('created_at, amount, method, bill_id')
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
      supabase.from('appointments').select('scheduled_at, status').gte('scheduled_at', from).lte('scheduled_at', to).order('scheduled_at'),
      supabase.from('emergency_cases').select('created_at').gte('created_at', from).lte('created_at', to),
    ])
    // Aggregate by day
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
    const { data } = await supabase
      .from('admissions')
      .select('admitted_at, discharged_at, bed:beds(ward:wards(name))')
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
      supabase.from('lab_orders').select('created_at, test_name').gte('created_at', from).lte('created_at', to),
      supabase.from('radiology_orders').select('created_at, study_type').gte('created_at', from).lte('created_at', to),
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
