'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { AncRecordSchema, AncVisitSchema, PartographSchema } from '@/lib/schemas'
import type { AncRecord, AncVisit, PartographObs } from '@/lib/types'
import { istAddDays, istDate, istToday } from '@/lib/istDate'
import { chooseEdd, daysBetween, gaOn } from '@/lib/obstetrics/dating'
import { ANC_CARE_ITEMS, type CareDone } from '@/lib/obstetrics/ancSchedule'
import type { ObgynVisitData } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- ANC record (per pregnancy) ----

export async function listAnc(patientId: string): Promise<AncRecord[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('anc_records').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })
  return (data ?? []) as unknown as AncRecord[]
}

/** Checks LMP / scan dates and works out the EDD in use (ACOG re-dating rule). */
function datePregnancy(d: { lmp?: string | null; scan_date?: string | null; scan_ga_days?: number | null }):
  { ok: true; edd: string | null; edd_basis: 'lmp' | 'scan' | null } | { ok: false; error: string } {
  const today = istToday()
  const lmp = d.lmp || null
  const scanDate = d.scan_date || null
  const scanGa = d.scan_ga_days ?? null
  if (lmp && (lmp > today || daysBetween(lmp, today) > 45 * 7)) return { ok: false, error: 'LMP must be within the last 45 weeks' }
  if ((scanDate == null) !== (scanGa == null)) return { ok: false, error: 'Enter both the scan date and the gestation on the scan' }
  if (scanDate && scanDate > today) return { ok: false, error: 'Scan date cannot be in the future' }
  if (scanDate && lmp && scanDate < lmp) return { ok: false, error: 'Scan date cannot be before the LMP' }
  const dating = chooseEdd({ lmp, scanDate, scanGaDays: scanGa })
  if (dating.edd && gaOn(dating.edd, today)! > 45 * 7) return { ok: false, error: 'These dates put the pregnancy beyond 45 weeks — check them' }
  return { ok: true, edd: dating.edd, edd_basis: dating.basis }
}

export async function createAnc(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = AncRecordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const dating = datePregnancy(parsed.data)
  if (!dating.ok) return { success: false, error: dating.error }
  const supabase = await createClient()
  const { data: patient } = await supabase.from('patients').select('gender').eq('id', patientId).maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found' }
  if (patient.gender === 'male') return { success: false, error: 'This patient is registered as male — correct the sex on the patient profile first' }
  const { error } = await supabase.from('anc_records').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, created_by: actor.id, ...parsed.data,
    lmp: parsed.data.lmp || null, scan_date: parsed.data.scan_date || null,
    edd: dating.edd, edd_basis: dating.edd_basis,
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'This patient already has an ongoing pregnancy record' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'create', 'anc_record', patientId)
  return { success: true }
}

export async function updateAnc(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = AncRecordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const dating = datePregnancy(parsed.data)
  if (!dating.ok) return { success: false, error: dating.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('anc_records').update({
    ...parsed.data, lmp: parsed.data.lmp || null, scan_date: parsed.data.scan_date || null,
    edd: dating.edd, edd_basis: dating.edd_basis,
  }).eq('id', id).eq('status', 'active').select('id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'This pregnancy record is no longer active' }
  await logAudit(actor.id, 'update', 'anc_record', id)
  return { success: true }
}

export async function setAncStatus(id: string, status: 'active' | 'delivered' | 'closed'): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('anc_records').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'status', 'anc_record', id, { status })
  return { success: true }
}

// ---- ANC visits ----

export async function listAncVisits(ancId: string): Promise<AncVisit[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('anc_visits').select('*').eq('anc_id', ancId).order('visit_date', { ascending: false })
  return (data ?? []) as unknown as AncVisit[]
}

export async function addAncVisit(ancId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = AncVisitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('anc_visits').insert({
    tenant_id: actor.tenant_id, anc_id: ancId, recorded_by: actor.id,
    ...parsed.data, visit_date: parsed.data.visit_date || istToday(),
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'anc_visit', 'anc_record', ancId)
  return { success: true }
}

// ---- Partograph ----

export async function listPartograph(ancId: string): Promise<PartographObs[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('partograph_obs').select('*').eq('anc_id', ancId).order('recorded_at', { ascending: false })
  return (data ?? []) as unknown as PartographObs[]
}

export async function addPartographObs(ancId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = PartographSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('partograph_obs').insert({
    tenant_id: actor.tenant_id, anc_id: ancId, recorded_by: actor.id, ...parsed.data,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'partograph', 'anc_record', ancId)
  return { success: true }
}

// ---- ObGyn OPD consultation ----

export interface ObgynContext {
  sex: string | null
  age: number | null
  bloodGroup: string | null
  visitDate: string
  /** Ongoing pregnancy, or the pregnancy this visit's antenatal check was recorded against. */
  pregnancy: AncRecord | null
  ancVisits: AncVisit[]
  visitAnc: AncVisit | null
  care: CareDone[]
  /** Last saved ObGyn notes from an earlier visit — stable history is carried forward. */
  previousNotes: ObgynVisitData | null
}

export async function getObgynContext(patientId: string, visitId: string): Promise<ObgynContext> {
  const supabase = await createClient()
  const [{ data: patient }, { data: visit }, { data: visitAncRow }, { data: prior }] = await Promise.all([
    supabase.from('patients').select('dob, gender, blood_group').eq('id', patientId).single(),
    supabase.from('visits').select('visit_date').eq('id', visitId).maybeSingle(),
    supabase.from('anc_visits').select('*').eq('visit_id', visitId).maybeSingle(),
    supabase.from('visits').select('id, clinical_data, visit_date').eq('patient_id', patientId).neq('id', visitId)
      .eq('clinical_data->>template', 'obgyn').order('visit_date', { ascending: false }).limit(1),
  ])
  const visitDate = visit?.visit_date ? istDate(visit.visit_date as string) : istToday()
  const dob = patient?.dob as string | null
  let age: number | null = null
  if (dob) {
    const [y, m, d] = dob.slice(0, 10).split('-').map(Number)
    const [ty, tm, td] = visitDate.split('-').map(Number)
    age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
  }

  const { data: preg } = visitAncRow
    ? await supabase.from('anc_records').select('*').eq('id', visitAncRow.anc_id).maybeSingle()
    : await supabase.from('anc_records').select('*').eq('patient_id', patientId).eq('status', 'active').maybeSingle()
  const pregnancy = (preg as AncRecord | null) ?? null
  const [{ data: visits }, { data: care }] = pregnancy
    ? await Promise.all([
        supabase.from('anc_visits').select('*').eq('anc_id', pregnancy.id).order('visit_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('anc_care_items').select('item_key, done_on, result').eq('anc_id', pregnancy.id),
      ])
    : [{ data: [] }, { data: [] }]

  return {
    sex: (patient?.gender as string | null) ?? null,
    age,
    bloodGroup: pregnancy?.blood_group || (patient?.blood_group as string | null) || null,
    visitDate,
    pregnancy,
    ancVisits: (visits ?? []) as unknown as AncVisit[],
    visitAnc: (visitAncRow as AncVisit | null) ?? null,
    care: (care ?? []) as CareDone[],
    previousNotes: (prior?.[0]?.clinical_data as ObgynVisitData | undefined) ?? null,
  }
}

/** The antenatal check (weight, BP, fundal height, FHR, urine, Hb) for this OPD visit — one per visit. */
export async function saveVisitAncCheck(visitId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = AncVisitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.bp && !/^\s*\d{2,3}\s*\/\s*\d{2,3}\s*$/.test(d.bp)) return { success: false, error: 'Enter BP as systolic/diastolic, e.g. 120/80' }
  if ((d.weight_kg ?? 0) > 250 || (d.hb ?? 0) > 25 || (d.fundal_height_cm ?? 0) > 60 || (d.fetal_heart_rate != null && (d.fetal_heart_rate < 50 || d.fetal_heart_rate > 250))) {
    return { success: false, error: 'A value looks out of range — weight in kg, Hb in g/dL, fundal height in cm, FHR in beats/min' }
  }
  const supabase = await createClient()
  const { data: visit } = await supabase.from('visits').select('patient_id, visit_date').eq('id', visitId).maybeSingle()
  if (!visit) return { success: false, error: 'Visit not found' }
  const { data: existing } = await supabase.from('anc_visits').select('id, anc_id').eq('visit_id', visitId).maybeSingle()
  let ancId = existing?.anc_id as string | undefined
  if (!ancId) {
    const { data: active } = await supabase.from('anc_records').select('id').eq('patient_id', visit.patient_id).eq('status', 'active').maybeSingle()
    if (!active) return { success: false, error: 'Start a pregnancy record first' }
    ancId = active.id as string
  }
  const row = {
    weight_kg: d.weight_kg ?? null, bp: d.bp?.replace(/\s/g, '') || null, pallor: d.pallor ?? null,
    fundal_height_cm: d.fundal_height_cm ?? null, fetal_heart_rate: d.fetal_heart_rate ?? null,
    fetal_movements: d.fetal_movements || null, urine_albumin: d.urine_albumin || null, urine_sugar: d.urine_sugar || null,
    hb: d.hb ?? null, notes: d.notes || null, oedema: d.oedema || null, presentation: d.presentation || null,
  }
  if (Object.values(row).every((v) => v == null)) return { success: false, error: 'Enter at least one finding' }
  const { error } = existing
    ? await supabase.from('anc_visits').update(row).eq('id', existing.id)
    : await supabase.from('anc_visits').insert({
        ...row, tenant_id: actor.tenant_id, anc_id: ancId, visit_id: visitId, recorded_by: actor.id,
        visit_date: istDate(visit.visit_date as string),
      })
  if (error) {
    // Two saves raced to create this visit's check — the other one won; update it.
    if (error.code === '23505') {
      const { error: e2 } = await supabase.from('anc_visits').update(row).eq('visit_id', visitId)
      if (e2) return { success: false, error: e2.message }
    } else return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'anc_visit', 'anc_record', ancId, { visit_id: visitId })
  return { success: true }
}

/** Marks an antenatal care item (test, scan, Td dose, supplement) done — or not required. */
export async function markAncCareItem(ancId: string, itemKey: string, input: { done_on?: string | null; result?: string | null }): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  if (!ANC_CARE_ITEMS.some((i) => i.key === itemKey)) return { success: false, error: 'Unknown care item' }
  const doneOn = input.done_on || istToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doneOn) || doneOn > istToday()) return { success: false, error: 'Date cannot be in the future' }
  const supabase = await createClient()
  const { data: anc } = await supabase.from('anc_records').select('id, lmp, edd').eq('id', ancId).maybeSingle()
  if (!anc) return { success: false, error: 'Pregnancy record not found' }
  const start = anc.edd ? istAddDays(anc.edd as string, -280) : (anc.lmp as string | null)
  if (start && doneOn < istAddDays(start, -90)) return { success: false, error: 'That date is before this pregnancy' }
  const { error } = await supabase.from('anc_care_items').upsert({
    tenant_id: actor.tenant_id, anc_id: ancId, item_key: itemKey, done_on: doneOn,
    result: input.result?.trim() || null, recorded_by: actor.id,
  }, { onConflict: 'anc_id,item_key' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'anc_care', 'anc_record', ancId, { item: itemKey })
  return { success: true }
}

export async function clearAncCareItem(ancId: string, itemKey: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('anc_care_items').delete().eq('anc_id', ancId).eq('item_key', itemKey)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'anc_care_undo', 'anc_record', ancId, { item: itemKey })
  return { success: true }
}
