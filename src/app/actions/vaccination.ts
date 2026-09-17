'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { istToday } from '@/lib/istDate'
import { dosesDueByNow, vaccinationStatus, type Deferral, type DoseStatus, type GivenDose, type ScheduleRow } from '@/lib/immunization/schedule'

type SimpleResult = { success: true } | { success: false; error: string }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface Vaccination {
  dob: string | null
  ageDays: number | null
  today: string
  doses: DoseStatus[]
  /** Vaccines recorded as given today (date known). */
  givenToday: number
  /** Clinic preference: warn above this many vaccines in a day (null = no warning). */
  dailyWarnLimit: number | null
  /** The first-visit history check is still to be done. */
  needsHistoryCheck: boolean
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000)

async function load(supabase: SupabaseClient, patientId: string): Promise<Vaccination & { tenantId: string | null }> {
  const today = istToday()
  const [{ data: patient }, { data: schedule }, { data: given }, { data: deferrals }, { data: profile }] = await Promise.all([
    supabase.from('patients').select('dob, tenant_id').eq('id', patientId).single(),
    supabase.from('immunization_schedule').select('vaccine, dose_label, due_age_days, min_age_days, max_age_days, prev_vaccine, prev_dose_label, min_interval_days, note, sort_order').order('sort_order'),
    supabase.from('patient_immunizations').select('id, vaccine, dose_label, given_date, date_known, visit_id').eq('patient_id', patientId),
    supabase.from('patient_immunization_deferrals').select('vaccine, dose_label, reason, deferred_on').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(100),
    supabase.from('pediatric_profiles').select('vaccine_history_reviewed_at').eq('patient_id', patientId).maybeSingle(),
  ])
  const dob = (patient?.dob as string | null)?.slice(0, 10) ?? null
  const tenantId = (patient?.tenant_id as string | null) ?? null
  const { data: tenant } = tenantId ? await supabase.from('tenants').select('vaccine_daily_warn_limit').eq('id', tenantId).maybeSingle() : { data: null }
  const givenRows = (given ?? []) as unknown as GivenDose[]
  const doses = dob
    ? vaccinationStatus({ dob, today, schedule: (schedule ?? []) as unknown as ScheduleRow[], given: givenRows, deferrals: (deferrals ?? []) as unknown as Deferral[] })
    : []
  return {
    tenantId, dob, today, doses,
    ageDays: dob ? dayDiff(dob, today) : null,
    givenToday: givenRows.filter((g) => g.date_known && g.given_date === today).length,
    dailyWarnLimit: (tenant?.vaccine_daily_warn_limit as number | null) ?? null,
    needsHistoryCheck: !!dob && dayDiff(dob, today) > 0 && givenRows.length === 0 && !profile?.vaccine_history_reviewed_at,
  }
}

export async function getVaccination(patientId: string): Promise<Vaccination> {
  const supabase = await createClient()
  const { tenantId: _t, ...v } = await load(supabase, patientId)
  void _t
  return v
}

async function guard(permission: 'opd:vitals' = 'opd:vitals') {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, permission)
  return actor
}

function findDose(v: Vaccination, vaccine: string, dose: string) {
  return v.doses.find((d) => d.vaccine === vaccine && d.dose_label === dose) ?? null
}

/** Records one vaccine as given today. */
export async function giveVaccineToday(patientId: string, vaccine: string, doseLabel: string, visitId?: string | null): Promise<SimpleResult> {
  const actor = await guard()
  const supabase = await createClient()
  const v = await load(supabase, patientId)
  if (!v.dob) return { success: false, error: "Add the child's date of birth first" }
  const d = findDose(v, vaccine, doseLabel)
  if (!d) return { success: false, error: `${vaccine} ${doseLabel} is not on the schedule` }
  if (d.state === 'given') return { success: false, error: `${d.label} is already recorded` }
  if (!d.canGiveToday) {
    const from = d.earliestDate ? ` (from ${new Date(`${d.earliestDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })})` : ''
    return { success: false, error: `${d.label} cannot be given today — ${d.reason}${from}` }
  }
  const { error } = await supabase.from('patient_immunizations').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, given_by: actor.id, vaccine, dose_label: doseLabel,
    given_date: v.today, date_known: true, visit_id: visitId ?? null,
  })
  if (error) return { success: false, error: error.code === '23505' ? `${d.label} is already recorded` : error.message }
  await logAudit(actor.id, 'immunization', 'patient', patientId, { vaccine, dose: doseLabel, visit_id: visitId ?? null })
  return { success: true }
}

async function insertEarlier(supabase: SupabaseClient, actor: { id: string; tenant_id: string }, v: Vaccination, patientId: string, d: DoseStatus, date: string | null) {
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${d.label}: invalid date`
    if (date > v.today) return `${d.label}: date cannot be in the future`
    if (v.dob && date < v.dob) return `${d.label}: date is before the date of birth`
  } else if (d.dueDate > v.today) {
    return `${d.label} is not due yet — it cannot have been given earlier`
  }
  const { error } = await supabase.from('patient_immunizations').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, given_by: actor.id, vaccine: d.vaccine, dose_label: d.dose_label,
    given_date: date ?? d.dueDate, date_known: !!date,
    notes: date ? 'Given elsewhere' : 'Given elsewhere — exact date not known',
  })
  if (error && error.code !== '23505') return error.message
  return null
}

/** Records one vaccine as given before (another hospital / camp), with the date from the card if known. */
export async function recordVaccineGivenEarlier(patientId: string, vaccine: string, doseLabel: string, date: string | null): Promise<SimpleResult> {
  const actor = await guard()
  const supabase = await createClient()
  const v = await load(supabase, patientId)
  if (!v.dob) return { success: false, error: "Add the child's date of birth first" }
  const d = findDose(v, vaccine, doseLabel)
  if (!d) return { success: false, error: `${vaccine} ${doseLabel} is not on the schedule` }
  if (d.state === 'given') return { success: false, error: `${d.label} is already recorded` }
  const err = await insertEarlier(supabase, actor, v, patientId, d, date)
  if (err) return { success: false, error: err }
  await logAudit(actor.id, 'immunization_history', 'patient', patientId, { vaccine, dose: doseLabel, date })
  return { success: true }
}

/** A due vaccine not given at this visit, with the reason. It stays pending. */
export async function declineVaccine(patientId: string, vaccine: string, doseLabel: string, reason: string, visitId?: string | null): Promise<SimpleResult> {
  const actor = await guard()
  const text = reason.trim()
  if (!text) return { success: false, error: 'Choose or type a reason' }
  const supabase = await createClient()
  const { error } = await supabase.from('patient_immunization_deferrals').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, vaccine, dose_label: doseLabel, reason: text.slice(0, 200),
    deferred_on: istToday(), visit_id: visitId ?? null, recorded_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'immunization_deferred', 'patient', patientId, { vaccine, dose: doseLabel, reason: text })
  return { success: true }
}

/** Removes a wrongly recorded dose. */
export async function undoVaccine(immunizationId: string): Promise<SimpleResult> {
  const actor = await guard()
  const supabase = await createClient()
  const { data, error } = await supabase.from('patient_immunizations').delete().eq('id', immunizationId)
    .select('patient_id, vaccine, dose_label, given_date')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'Record not found' }
  await logAudit(actor.id, 'immunization_undo', 'patient', data[0].patient_id as string, { vaccine: data[0].vaccine, dose: data[0].dose_label, given_date: data[0].given_date })
  return { success: true }
}

export interface HistoryEntry { vaccine: string; dose_label: string; answer: 'yes' | 'no' | 'unsure'; date?: string | null }

/** First-visit check against the child's vaccination card: records every "yes" and marks the history reviewed. */
export async function saveVaccinationHistory(patientId: string, entries: HistoryEntry[]): Promise<{ success: true; recorded: number } | { success: false; error: string }> {
  const actor = await guard()
  const supabase = await createClient()
  const v = await load(supabase, patientId)
  if (!v.dob || v.ageDays == null) return { success: false, error: "Add the child's date of birth first" }
  const expected = new Set(dosesDueByNow(v.doses, v.ageDays).map((d) => d.key))
  let recorded = 0
  for (const e of entries.filter((x) => x.answer === 'yes')) {
    const d = findDose(v, e.vaccine, e.dose_label)
    if (!d || !expected.has(d.key)) return { success: false, error: `${e.vaccine} ${e.dose_label} is not due by this age` }
    if (d.state === 'given') continue
    const err = await insertEarlier(supabase, actor, v, patientId, d, e.date || null)
    if (err) return { success: false, error: err }
    recorded++
  }
  const { error } = await supabase.from('pediatric_profiles').upsert({
    patient_id: patientId, tenant_id: actor.tenant_id, vaccine_history_reviewed_at: new Date().toISOString(),
    updated_by: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'patient_id' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'immunization_history_review', 'patient', patientId, {
    yes: recorded, no: entries.filter((x) => x.answer === 'no').length, unsure: entries.filter((x) => x.answer === 'unsure').length,
  })
  return { success: true, recorded }
}

/** Clinic setting: warn when more than N vaccines are given to a child on one day (null = never warn). */
export async function setVaccineDailyWarnLimit(limit: number | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'departments:manage')
  if (limit != null && (!Number.isInteger(limit) || limit < 1 || limit > 20)) return { success: false, error: 'Enter a number from 1 to 20, or leave it blank' }
  // tenants has no tenant-side UPDATE policy — write the caller's own row with the service client.
  const { error } = await createServiceClient().from('tenants').update({ vaccine_daily_warn_limit: limit }).eq('id', actor.tenant_id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'vaccine_daily_warn_limit', actor.tenant_id, { limit })
  return { success: true }
}

export async function getVaccineDailyWarnLimit(): Promise<number | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const { data } = await supabase.from('tenants').select('vaccine_daily_warn_limit').eq('id', actor.tenant_id).maybeSingle()
  return (data?.vaccine_daily_warn_limit as number | null) ?? null
}
