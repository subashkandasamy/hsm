'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { TimelineEvent, DiagnosisSummary } from '@/lib/types'
import { OUT_OF_RANGE } from '@/lib/lab/reportRange'

export async function getPatientTimeline(
  patientId: string,
  opts?: { types?: string[]; dateFrom?: string; dateTo?: string }
): Promise<TimelineEvent[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:read')

  const supabase = await createClient()
  const types = opts?.types ?? []
  const want = (t: string) => types.length === 0 || types.includes(t)

  const [
    opdVisits, emergencyVisits, admissions,
    labOrders, radOrders, otSchedules,
    bloodIssues, documents, pharmacyDispenses,
  ] = await Promise.all([
    // OPD visits
    want('opd_visit') ? supabase
      .from('visits')
      .select('id, visit_date, diagnosis, icd_code, complaint, status, prescriptions:prescriptions(id)')
      .eq('patient_id', patientId)
      .eq('type', 'opd')
      .order('visit_date', { ascending: false })
      .limit(200) : { data: [] },

    // Emergency visits
    want('emergency_visit') ? supabase
      .from('visits')
      .select('id, visit_date, diagnosis, complaint, status')
      .eq('patient_id', patientId)
      .eq('type', 'emergency')
      .order('visit_date', { ascending: false })
      .limit(50) : { data: [] },

    // IPD admissions
    want('admission') ? supabase
      .from('admissions')
      .select('id, admitted_at, discharged_at, reason, discharge_summary, status, ward:wards(name), bed:beds(bed_no)')
      .eq('patient_id', patientId)
      .order('admitted_at', { ascending: false })
      .limit(50) : { data: [] },

    // Lab orders (reported only)
    want('lab_order') ? supabase
      .from('lab_orders')
      .select('id, ordered_at, reported_at, status, items:lab_order_items(id, flag, test:lab_tests_catalog(name))')
      .eq('patient_id', patientId)
      .eq('status', 'reported')
      .order('ordered_at', { ascending: false })
      .limit(100) : { data: [] },

    // Radiology orders (reported only)
    want('radiology_order') ? supabase
      .from('radiology_orders')
      .select('id, ordered_at, reported_at, status, test:radiology_catalog(name, modality)')
      .eq('patient_id', patientId)
      .eq('status', 'reported')
      .order('ordered_at', { ascending: false })
      .limit(100) : { data: [] },

    // OT schedules (completed)
    want('ot_schedule') ? supabase
      .from('ot_schedules')
      .select('id, scheduled_start, procedure_name, status, surgeon:profiles(full_name), room:ot_rooms(name)')
      .eq('patient_id', patientId)
      .eq('status', 'completed')
      .order('scheduled_start', { ascending: false })
      .limit(50) : { data: [] },

    // Blood issues
    want('blood_issue') ? supabase
      .from('blood_issues')
      .select('id, issued_at, price_snapshot, request:blood_requests(blood_group, component, units_required)')
      .eq('patient_id', patientId)
      .order('issued_at', { ascending: false })
      .limit(50) : { data: [] },

    // Patient documents
    want('document') ? supabase
      .from('patient_documents')
      .select('id, title, category, uploaded_at')
      .eq('patient_id', patientId)
      .order('uploaded_at', { ascending: false })
      .limit(200) : { data: [] },

    // Pharmacy dispenses (group by dispensed_at date)
    want('pharmacy_dispense') ? supabase
      .from('dispenses')
      .select('id, qty, price_snapshot, dispensed_at, dispatched_at, drug:drugs(name)')
      .eq('patient_id', patientId)
      .order('dispensed_at', { ascending: false })
      .limit(200) : { data: [] },
  ])

  const events: TimelineEvent[] = []

  // OPD visits
  for (const v of (opdVisits.data ?? [])) {
    const row = v as Record<string, unknown>
    const rxCount = Array.isArray(row.prescriptions) ? row.prescriptions.length : 0
    events.push({
      id: row.id as string,
      type: 'opd_visit',
      date: row.visit_date as string,
      title: (row.diagnosis as string | null) ?? 'OPD Consultation',
      summary: [
        row.complaint ? `Complaint: ${row.complaint}` : null,
        row.icd_code ? `ICD: ${row.icd_code}` : null,
        rxCount > 0 ? `${rxCount} medicine${rxCount !== 1 ? 's' : ''} prescribed` : null,
      ].filter(Boolean).join(' · ') || null,
      refTable: 'visits',
      refId: row.id as string,
    })
  }

  // Emergency visits
  for (const v of (emergencyVisits.data ?? [])) {
    const row = v as Record<string, unknown>
    events.push({
      id: row.id as string,
      type: 'emergency_visit',
      date: row.visit_date as string,
      title: 'Emergency Visit',
      summary: row.complaint as string | null,
      refTable: 'visits',
      refId: row.id as string,
    })
  }

  // Admissions
  for (const a of (admissions.data ?? [])) {
    const row = a as Record<string, unknown>
    const ward = (row.ward as Record<string, unknown> | null)?.name ?? '—'
    const bed = (row.bed as Record<string, unknown> | null)?.bed_no ?? '—'
    events.push({
      id: row.id as string,
      type: 'admission',
      date: row.admitted_at as string,
      title: `IPD Admission — ${ward} / Bed ${bed}`,
      summary: [
        row.reason ? `Reason: ${row.reason}` : null,
        row.discharged_at ? `Discharged: ${new Date(row.discharged_at as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'Currently admitted',
        (() => { const s = ((row.discharge_summary as string | null) ?? '').trim(); return s.length > 3 && s.toLowerCase() !== 'na' && s.toLowerCase() !== 'n/a' ? `Summary: ${s.slice(0, 80)}${s.length > 80 ? '…' : ''}` : null })(),
      ].filter(Boolean).join(' · ') || null,
      refTable: 'admissions',
      refId: row.id as string,
    })
  }

  // Lab orders
  for (const lo of (labOrders.data ?? [])) {
    const row = lo as Record<string, unknown>
    const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : []
    const testNames = items.map((i) => {
      const t = i.test as Record<string, unknown> | null
      return t?.name ?? 'Test'
    }).join(', ')
    // Critical and abnormal count too — a critical potassium read "within range".
    const hasAbnormal = items.some((i) => OUT_OF_RANGE.has(i.flag as string))
    events.push({
      id: row.id as string,
      type: 'lab_order',
      date: (row.reported_at ?? row.ordered_at) as string,
      title: `Lab: ${testNames || 'Tests'}`,
      summary: hasAbnormal ? '⚠ Abnormal result(s)' : 'All results within range',
      refTable: 'lab_orders',
      refId: row.id as string,
      meta: { hasAbnormal },
    })
  }

  // Radiology orders
  for (const ro of (radOrders.data ?? [])) {
    const row = ro as Record<string, unknown>
    const test = row.test as Record<string, unknown> | null
    events.push({
      id: row.id as string,
      type: 'radiology_order',
      date: (row.reported_at ?? row.ordered_at) as string,
      title: `${test?.modality ?? 'Radiology'}: ${test?.name ?? 'Study'}`,
      summary: null,
      refTable: 'radiology_orders',
      refId: row.id as string,
    })
  }

  // OT schedules
  for (const ot of (otSchedules.data ?? [])) {
    const row = ot as Record<string, unknown>
    const surgeon = (row.surgeon as Record<string, unknown> | null)?.full_name ?? 'Unknown surgeon'
    events.push({
      id: row.id as string,
      type: 'ot_schedule',
      date: row.scheduled_start as string,
      title: `OT: ${row.procedure_name as string}`,
      summary: `Surgeon: ${surgeon}`,
      refTable: 'ot_schedules',
      refId: row.id as string,
    })
  }

  // Blood issues
  for (const bi of (bloodIssues.data ?? [])) {
    const row = bi as Record<string, unknown>
    const req = row.request as Record<string, unknown> | null
    const desc = req
      ? `${req.blood_group} ${req.component} × ${req.units_required} unit(s)`
      : 'Blood unit(s)'
    events.push({
      id: row.id as string,
      type: 'blood_issue',
      date: row.issued_at as string,
      title: `Blood Issued: ${desc}`,
      summary: null,
      refTable: 'blood_issues',
      refId: row.id as string,
    })
  }

  // Documents
  for (const doc of (documents.data ?? [])) {
    const row = doc as Record<string, unknown>
    events.push({
      id: row.id as string,
      type: 'document',
      date: row.uploaded_at as string,
      title: row.title as string,
      summary: String(row.category).replace('_', ' '),
      refTable: 'patient_documents',
      refId: row.id as string,
    })
  }

  // Pharmacy dispenses — group by day
  const dispensesByDay = new Map<string, { id: string; drugName: string; qty: number; dispatched: boolean }[]>()
  for (const d of (pharmacyDispenses.data ?? [])) {
    const row = d as Record<string, unknown>
    const day = (row.dispensed_at as string).split('T')[0]
    const drug = row.drug as Record<string, unknown> | null
    const entry = dispensesByDay.get(day) ?? []
    entry.push({
      id: row.id as string,
      drugName: (drug?.name as string) ?? 'Medication',
      qty: row.qty as number,
      dispatched: !!(row.dispatched_at),
    })
    dispensesByDay.set(day, entry)
  }
  for (const [day, items] of dispensesByDay) {
    const drugList = items.map((i) => `${i.drugName} ×${i.qty}`).join(', ')
    const allDispatched = items.every((i) => i.dispatched)
    events.push({
      id: `pharmacy_${day}`,
      type: 'pharmacy_dispense',
      date: day,
      title: `Pharmacy: ${items.length} drug${items.length !== 1 ? 's' : ''} dispensed`,
      summary: drugList + (allDispatched ? ' · Dispatched' : ' · Awaiting dispatch'),
      refTable: 'dispenses',
      refId: items[0].id,
    })
  }

  // Sort descending by date
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Apply date filters
  return events.filter((e) => {
    const d = new Date(e.date).getTime()
    if (opts?.dateFrom && d < new Date(opts.dateFrom).getTime()) return false
    if (opts?.dateTo   && d > new Date(opts.dateTo).getTime())   return false
    return true
  })
}

export async function getDiagnosisSummary(patientId: string): Promise<DiagnosisSummary[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:read')

  const supabase = await createClient()
  const { data } = await supabase
    .from('visits')
    .select('diagnosis, icd_code, visit_date')
    .eq('patient_id', patientId)
    .not('diagnosis', 'is', null)
    .order('visit_date', { ascending: false })
    .limit(200)

  if (!data) return []

  // Deduplicate by diagnosis text
  const seen = new Set<string>()
  const result: DiagnosisSummary[] = []
  for (const row of data) {
    const key = (row.diagnosis as string).toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      result.push({
        diagnosis: row.diagnosis as string,
        icd_code: row.icd_code as string | null,
        last_seen: row.visit_date as string,
      })
    }
  }
  return result
}
