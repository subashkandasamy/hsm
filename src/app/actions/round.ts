'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { PatientStripSchema, InsulinScaleSchema } from '@/lib/schemas'
import { scaleProblem } from '@/lib/round'
import { listAllergies } from '@/app/actions/allergies'
import type { IcuObservation } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

/** Everything the strip at the top of the IP page shows, in one call. */
export interface PatientStripData {
  allergies: string[]
  latest: IcuObservation | null
  icuSince: string | null
  consultants: string[]
}

export async function getPatientStrip(admissionId: string): Promise<PatientStripData | null> {
  await requireModule('ipd')
  const supabase = await createClient()
  const { data: adm } = await supabase.from('admissions').select('patient_id, admitting_doctor_id').eq('id', admissionId).maybeSingle()
  if (!adm) return null
  const [allergies, { data: latest }, { data: icu }, { data: team }] = await Promise.all([
    listAllergies(adm.patient_id as string),
    supabase.from('icu_observations').select('*').eq('admission_id', admissionId)
      .order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('icu_stays').select('entered_at').eq('admission_id', admissionId).is('exited_at', null).maybeSingle(),
    supabase.from('admission_care_team').select('doctor:profiles(full_name)').eq('admission_id', admissionId).is('removed_at', null),
  ])
  return {
    allergies: allergies.map((a) => a.allergen),
    latest: (latest as IcuObservation | null) ?? null,
    icuSince: (icu?.entered_at as string | undefined) ?? null,
    consultants: (team ?? []).map((t) => (t.doctor as unknown as { full_name: string } | null)?.full_name).filter(Boolean) as string[],
  }
}

/** Weight, height, diet and DVT prophylaxis — kept by the nurse or the doctor. */
export async function savePatientStrip(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:notes')
  const parsed = PatientStripSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from('admissions').update(parsed.data)
    .eq('id', admissionId).eq('status', 'admitted').select('id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'This patient has been discharged.' }
  await logAudit(actor.id, 'patient_strip', 'admission', admissionId, parsed.data)
  return { success: true }
}

/** The doctor's insulin sliding scale for this patient. An empty list removes it. */
export async function saveInsulinScale(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = InsulinScaleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const rows = [...parsed.data.rows].sort((a, b) => a.from - b.from)
  const problem = scaleProblem(rows)
  if (problem) return { success: false, error: problem }
  const supabase = await createClient()
  const { data, error } = await supabase.from('admissions').update({
    insulin_scale: rows.length ? rows : null,
    insulin_scale_type: rows.length ? (parsed.data.type?.trim() || null) : null,
  }).eq('id', admissionId).eq('status', 'admitted').select('id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'This patient has been discharged.' }
  await logAudit(actor.id, 'insulin_scale', 'admission', admissionId, { type: parsed.data.type, rows })
  return { success: true }
}
