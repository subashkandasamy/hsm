'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireModule, requireWriteAccess } from '@/lib/server-utils'
import { istDate, istToday } from '@/lib/istDate'
import { gaOn } from '@/lib/obstetrics/dating'
import { DESCENT_OPTIONS, LIQUOR_OPTIONS, MOULDING_OPTIONS, isCaesarean, type PartographReading, type PostpartumReading } from '@/lib/obstetrics/labour'
import type { AncRecord } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export interface Delivery {
  id: string; admission_id: string; patient_id: string; anc_id: string | null
  delivered_at: string; gestation_days: number | null; mode: string; indication: string | null
  anaesthesia: string | null; episiotomy: boolean; perineal_tear: string; placenta: string | null
  amtsl_oxytocin: boolean | null; blood_loss_ml: number | null; conducted_by: string | null; notes: string | null
}
export interface DeliveryBaby {
  id: string; delivery_id: string; birth_order: number; born_at: string
  sex: 'male' | 'female' | 'indeterminate'; outcome: 'live_birth' | 'fresh_stillbirth' | 'macerated_stillbirth'
  birth_weight_kg: number | null; length_cm: number | null; head_circ_cm: number | null
  apgar_1: number | null; apgar_5: number | null; resuscitation: boolean
  breastfed_within_1h: boolean | null; vitamin_k: boolean | null; nicu: boolean; anomalies: string | null
  baby_patient_id: string | null
  baby_patient?: { id: string; uhid: string; full_name: string } | null
}

export interface LabourContext {
  /** Show the Labour & Delivery tab for this admission. */
  eligible: boolean
  admissionStatus: string
  admittedAt: string
  mother: { id: string; full_name: string; age: number | null; blood_group: string | null }
  pregnancy: AncRecord | null
  /** Previous births (para) — first birth = 0; used for second-stage limits. */
  parity: number | null
  gestationToday: number | null
  partograph: PartographReading[]
  delivery: Delivery | null
  babies: DeliveryBaby[]
  postpartum: PostpartumReading[]
}

const ageOn = (dob: string | null, on: string) => {
  if (!dob) return null
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = on.split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

export async function getLabourContext(admissionId: string): Promise<LabourContext | null> {
  const supabase = await createClient()
  const { data: adm } = await supabase
    .from('admissions')
    .select('id, status, admitted_at, patient_id, admitting_doctor_id, ward_id, patient:patients(id, full_name, dob, gender, blood_group)')
    .eq('id', admissionId).maybeSingle()
  if (!adm) return null
  const patient = adm.patient as unknown as { id: string; full_name: string; dob: string | null; gender: string | null; blood_group: string | null }

  const [{ data: delivery }, { data: parto }, { data: post }, { data: ancs }] = await Promise.all([
    supabase.from('deliveries').select('*').eq('admission_id', admissionId).maybeSingle(),
    supabase.from('partograph_obs').select('*').eq('admission_id', admissionId).order('recorded_at', { ascending: false }),
    supabase.from('postpartum_obs').select('*').eq('admission_id', admissionId).order('recorded_at', { ascending: false }),
    supabase.from('anc_records').select('*').eq('patient_id', adm.patient_id).order('created_at', { ascending: false }),
  ])
  const d = delivery as Delivery | null
  const pregnancy = ((ancs ?? []) as AncRecord[]).find((a) => (d?.anc_id ? a.id === d.anc_id : a.status === 'active')) ?? null

  let eligible = patient?.gender === 'female' && (!!pregnancy || !!d || (parto ?? []).length > 0)
  if (!eligible && patient?.gender === 'female') {
    // Maternity admissions: the admitting doctor's or the ward's department uses the ObGyn template.
    const [{ data: doc }, { data: ward }] = await Promise.all([
      supabase.from('profiles').select('department:departments(clinical_template)').eq('id', adm.admitting_doctor_id).maybeSingle(),
      adm.ward_id ? supabase.from('wards').select('department:departments(clinical_template)').eq('id', adm.ward_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const tpl = (x: unknown) => (x as { department?: { clinical_template?: string } | null } | null)?.department?.clinical_template
    eligible = tpl(doc) === 'obgyn' || tpl(ward) === 'obgyn'
  }

  let babies: DeliveryBaby[] = []
  if (d) {
    const { data } = await supabase.from('delivery_babies')
      .select('*, baby_patient:patients!delivery_babies_baby_patient_id_fkey(id, uhid, full_name)')
      .eq('delivery_id', d.id).order('birth_order')
    babies = (data ?? []) as unknown as DeliveryBaby[]
  }

  const today = istToday()
  return {
    eligible,
    admissionStatus: adm.status as string,
    admittedAt: adm.admitted_at as string,
    mother: { id: patient.id, full_name: patient.full_name, age: ageOn(patient.dob, today), blood_group: pregnancy?.blood_group || patient.blood_group },
    pregnancy,
    parity: pregnancy?.para ?? null,
    gestationToday: pregnancy?.edd && pregnancy.status === 'active' ? gaOn(pregnancy.edd, today) : null,
    partograph: (parto ?? []) as unknown as PartographReading[],
    delivery: d,
    babies,
    postpartum: (post ?? []) as unknown as PostpartumReading[],
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const Iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date/time')
const BpStr = z.string().regex(/^\s*\d{2,3}\s*\/\s*\d{2,3}\s*$/, 'Enter BP as systolic/diastolic, e.g. 120/80')
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional()

async function loadAdmission(admissionId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('admissions')
    .select('id, status, admitted_at, patient_id, patient:patients(id, full_name, gender, phone, address)')
    .eq('id', admissionId).maybeSingle()
  return { supabase, adm: data }
}

/** A time for a clinical record: not in the future (2 min clock skew) and not long before admission. */
function checkTime(at: string, admittedAt: string, label: string, allowBeforeAdmissionHours = 0): string | null {
  const t = Date.parse(at)
  if (t > Date.now() + 2 * 60000) return `${label} cannot be in the future`
  if (t < Date.parse(admittedAt) - allowBeforeAdmissionHours * 3600000) {
    return allowBeforeAdmissionHours ? `${label} is more than ${allowBeforeAdmissionHours} hours before admission` : `${label} is before admission`
  }
  return null
}

// ── Partograph ───────────────────────────────────────────────────────────────

const PartographInput = z.object({
  recorded_at:          opt(Iso),
  cervix_cm:            opt(z.number().int().min(0).max(10)),
  descent:              opt(z.enum(DESCENT_OPTIONS as [string, ...string[]])),
  contractions_per10:   opt(z.number().int().min(0).max(10)),
  contraction_duration: opt(z.enum(['<20', '20-40', '>40'])),
  fetal_heart_rate:     opt(z.number().int().min(50, 'Fetal heart rate looks wrong').max(250, 'Fetal heart rate looks wrong')),
  liquor:               opt(z.enum(LIQUOR_OPTIONS.map((l) => l.value) as [string, ...string[]])),
  moulding:             opt(z.enum(MOULDING_OPTIONS as [string, ...string[]])),
  bp:                   opt(BpStr),
  pulse:                opt(z.number().int().min(30).max(220)),
  temp:                 opt(z.number().min(33, 'Temperature in °C').max(43, 'Temperature in °C')),
  urine_protein:        opt(z.string().max(10)),
  oxytocin:             opt(z.string().max(60)),
  notes:                opt(z.string().max(1000)),
})

export async function addPartographReading(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = PartographInput.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const p = parsed.data
  const values = { ...p, recorded_at: undefined, notes: undefined }
  if (Object.values(values).every((v) => v == null || v === '')) return { success: false, error: 'Enter at least one finding' }

  const { supabase, adm } = await loadAdmission(admissionId)
  if (!adm) return { success: false, error: 'Admission not found' }
  if (adm.status !== 'admitted') return { success: false, error: 'The patient is no longer admitted' }
  const at = p.recorded_at || new Date().toISOString()
  const timeErr = checkTime(at, adm.admitted_at as string, 'Reading time')
  if (timeErr) return { success: false, error: timeErr }
  const { data: delivery } = await supabase.from('deliveries').select('delivered_at').eq('admission_id', admissionId).maybeSingle()
  if (delivery && Date.parse(at) > Date.parse(delivery.delivered_at as string)) {
    return { success: false, error: 'Delivery is already recorded — use postpartum checks for observations after birth' }
  }
  if (p.cervix_cm != null) {
    // Dilatation does not go backwards; a lower value is almost always a typing slip.
    const { data: prev } = await supabase.from('partograph_obs').select('cervix_cm, recorded_at')
      .eq('admission_id', admissionId).not('cervix_cm', 'is', null).lt('recorded_at', at).order('recorded_at', { ascending: false }).limit(1)
    if (prev?.[0] && (prev[0].cervix_cm as number) > p.cervix_cm) {
      return { success: false, error: `Cervix was ${prev[0].cervix_cm} cm at the previous reading — check the value` }
    }
  }
  const { data: anc } = await supabase.from('anc_records').select('id').eq('patient_id', adm.patient_id).eq('status', 'active').maybeSingle()
  const { error } = await supabase.from('partograph_obs').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, anc_id: anc?.id ?? null, recorded_by: actor.id,
    ...p, recorded_at: at, bp: p.bp?.replace(/\s/g, '') || null,
    urine_protein: p.urine_protein || null, oxytocin: p.oxytocin || null, notes: p.notes || null,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'partograph', 'admission', admissionId)
  return { success: true }
}

export async function deletePartographReading(readingId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const supabase = await createClient()
  const { data, error } = await supabase.from('partograph_obs').delete().eq('id', readingId).not('admission_id', 'is', null).select('admission_id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'Reading not found' }
  await logAudit(actor.id, 'partograph_delete', 'admission', data[0].admission_id as string, { reading: readingId })
  return { success: true }
}

// ── Delivery ─────────────────────────────────────────────────────────────────

const BabyInput = z.object({
  birth_order:         z.number().int().min(1).max(6),
  born_at:             Iso,
  sex:                 z.enum(['male', 'female', 'indeterminate']),
  outcome:             z.enum(['live_birth', 'fresh_stillbirth', 'macerated_stillbirth']),
  birth_weight_kg:     opt(z.number().min(0.2, 'Birth weight in kg').max(6.9, 'Birth weight in kg')),
  length_cm:           opt(z.number().min(20).max(65)),
  head_circ_cm:        opt(z.number().min(15).max(45)),
  apgar_1:             opt(z.number().int().min(0).max(10)),
  apgar_5:             opt(z.number().int().min(0).max(10)),
  resuscitation:       z.boolean().default(false),
  breastfed_within_1h: opt(z.boolean()),
  vitamin_k:           opt(z.boolean()),
  nicu:                z.boolean().default(false),
  anomalies:           opt(z.string().max(500)),
})

const DeliveryInput = z.object({
  delivered_at:   Iso,
  gestation_days: opt(z.number().int().min(140, 'Gestation must be at least 20 weeks').max(320)),
  mode:           z.enum(['normal_vaginal', 'vacuum', 'forceps', 'vaginal_breech', 'caesarean_elective', 'caesarean_emergency']),
  indication:     opt(z.string().max(500)),
  anaesthesia:    opt(z.enum(['none', 'local', 'pudendal', 'spinal', 'epidural', 'general'])),
  episiotomy:     z.boolean().default(false),
  perineal_tear:  z.enum(['none', 'first', 'second', 'third', 'fourth']).default('none'),
  placenta:       opt(z.enum(['complete', 'incomplete', 'manual_removal'])),
  amtsl_oxytocin: opt(z.boolean()),
  blood_loss_ml:  opt(z.number().int().min(0).max(10000)),
  conducted_by:   opt(z.string().max(200)),
  notes:          opt(z.string().max(2000)),
  babies:         z.array(BabyInput).min(1, 'Add the baby').max(6),
})

export async function saveDelivery(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = DeliveryInput.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { babies, ...d } = parsed.data

  if (isCaesarean(d.mode)) {
    if (d.episiotomy || d.perineal_tear !== 'none') return { success: false, error: 'Episiotomy and perineal tears do not apply to a caesarean' }
    if (d.anaesthesia === 'local' || d.anaesthesia === 'pudendal' || d.anaesthesia === 'none') return { success: false, error: 'Choose the anaesthesia used for the caesarean' }
    if (!d.indication?.trim()) return { success: false, error: 'Enter the indication for the caesarean' }
  }
  if ((d.mode === 'vacuum' || d.mode === 'forceps') && !d.indication?.trim()) return { success: false, error: 'Enter the indication for the assisted delivery' }
  const orders = babies.map((b) => b.birth_order)
  if (new Set(orders).size !== orders.length) return { success: false, error: 'Each baby needs a different birth order' }
  for (const b of babies) {
    const gap = Math.abs(Date.parse(b.born_at) - Date.parse(d.delivered_at))
    if (gap > 24 * 3600000) return { success: false, error: `Baby ${b.birth_order}'s time of birth is more than 24 hours from the delivery time` }
    if (b.apgar_1 != null && b.apgar_5 == null && b.outcome === 'live_birth') return { success: false, error: 'Enter the 5-minute APGAR too' }
    if (b.outcome !== 'live_birth' && (b.apgar_1 || b.apgar_5)) return { success: false, error: 'APGAR does not apply to a stillbirth' }
  }

  const { supabase, adm } = await loadAdmission(admissionId)
  if (!adm) return { success: false, error: 'Admission not found' }
  const patient = adm.patient as unknown as { gender: string | null }
  if (patient?.gender === 'male') return { success: false, error: 'This patient is registered as male' }
  // A baby born on the way (before arrival) is recorded against this admission too.
  const timeErr = checkTime(d.delivered_at, adm.admitted_at as string, 'Delivery time', 24)
  if (timeErr) return { success: false, error: timeErr }

  const { data: existing } = await supabase.from('deliveries').select('id, anc_id').eq('admission_id', admissionId).maybeSingle()
  let ancId = (existing?.anc_id as string | null) ?? null
  let gestation = d.gestation_days ?? null
  if (!existing) {
    const { data: anc } = await supabase.from('anc_records').select('id, edd').eq('patient_id', adm.patient_id).eq('status', 'active').maybeSingle()
    ancId = (anc?.id as string | undefined) ?? null
    if (gestation == null && anc?.edd) gestation = gaOn(anc.edd as string, istDate(d.delivered_at))
  } else if (gestation == null && ancId) {
    const { data: anc } = await supabase.from('anc_records').select('edd').eq('id', ancId).maybeSingle()
    if (anc?.edd) gestation = gaOn(anc.edd as string, istDate(d.delivered_at))
  }
  if (gestation != null && (gestation < 140 || gestation > 320)) gestation = null

  // Babies: registered babies cannot be removed or have their outcome/sex changed here.
  const { data: current } = await supabase.from('delivery_babies').select('id, birth_order, baby_patient_id, sex, outcome').eq('delivery_id', existing?.id ?? '00000000-0000-0000-0000-000000000000')
  for (const c of current ?? []) {
    const next = babies.find((b) => b.birth_order === c.birth_order)
    if (c.baby_patient_id && !next) return { success: false, error: `Baby ${c.birth_order} is registered as a patient and cannot be removed` }
    if (c.baby_patient_id && (next!.outcome !== c.outcome || next!.sex !== c.sex)) {
      return { success: false, error: `Baby ${c.birth_order} is registered as a patient — correct the sex on the baby's patient profile instead` }
    }
  }
  const row = {
    ...d, gestation_days: gestation, indication: d.indication?.trim() || null, conducted_by: d.conducted_by?.trim() || null,
    notes: d.notes?.trim() || null, anaesthesia: d.anaesthesia ?? null, placenta: d.placenta ?? null,
    amtsl_oxytocin: d.amtsl_oxytocin ?? null, blood_loss_ml: d.blood_loss_ml ?? null, updated_at: new Date().toISOString(),
  }
  let deliveryId = existing?.id as string | undefined
  if (existing) {
    const { error } = await supabase.from('deliveries').update(row).eq('id', existing.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { data: ins, error } = await supabase.from('deliveries').insert({
      ...row, tenant_id: actor.tenant_id, admission_id: admissionId, patient_id: adm.patient_id, anc_id: ancId, created_by: actor.id,
    }).select('id').single()
    if (error) return { success: false, error: error.code === '23505' ? 'The delivery was just recorded by someone else — reload the page' : error.message }
    deliveryId = ins.id as string
  }

  const removed = (current ?? []).filter((c) => !orders.includes(c.birth_order as number)).map((c) => c.id as string)
  if (removed.length) {
    const { error } = await supabase.from('delivery_babies').delete().in('id', removed).is('baby_patient_id', null)
    if (error) return { success: false, error: error.message }
  }
  const { error: babyErr } = await supabase.from('delivery_babies').upsert(
    babies.map((b) => ({
      ...b, tenant_id: actor.tenant_id, delivery_id: deliveryId!,
      birth_weight_kg: b.birth_weight_kg ?? null, length_cm: b.length_cm ?? null, head_circ_cm: b.head_circ_cm ?? null,
      apgar_1: b.apgar_1 ?? null, apgar_5: b.apgar_5 ?? null, breastfed_within_1h: b.breastfed_within_1h ?? null,
      vitamin_k: b.vitamin_k ?? null, anomalies: b.anomalies?.trim() || null,
    })),
    { onConflict: 'delivery_id,birth_order' },
  )
  if (babyErr) return { success: false, error: babyErr.message }

  if (ancId) await supabase.from('anc_records').update({ status: 'delivered' }).eq('id', ancId).eq('status', 'active')
  await logAudit(actor.id, existing ? 'delivery_update' : 'delivery', 'admission', admissionId, { mode: d.mode, babies: babies.length })
  return { success: true }
}

// ── Newborn registration ─────────────────────────────────────────────────────

const PROFILE_MODE: Record<string, 'normal' | 'assisted' | 'caesarean'> = {
  normal_vaginal: 'normal', vaginal_breech: 'normal', vacuum: 'assisted', forceps: 'assisted',
  caesarean_elective: 'caesarean', caesarean_emergency: 'caesarean',
}

/**
 * Registers a live-born baby as a patient (UHID, "Baby of <mother>", mother's phone
 * and address) and starts the child's record: birth history, birth measurements on
 * the growth chart and, if given, the birth-dose vaccines (BCG, OPV-0, Hep B).
 */
export async function registerNewborn(babyId: string, opts: { name?: string; birthDosesGiven?: boolean } = {}):
  Promise<{ success: true; patientId: string; uhid: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const supabase = await createClient()
  const { data: baby } = await supabase.from('delivery_babies')
    .select('*, delivery:deliveries(id, mode, gestation_days, patient_id, admission_id, babies:delivery_babies(id))')
    .eq('id', babyId).maybeSingle()
  if (!baby) return { success: false, error: 'Baby not found' }
  if (baby.outcome !== 'live_birth') return { success: false, error: 'Only a live-born baby can be registered as a patient' }
  if (baby.baby_patient_id) {
    const { data: p } = await supabase.from('patients').select('uhid').eq('id', baby.baby_patient_id).maybeSingle()
    return { success: true, patientId: baby.baby_patient_id as string, uhid: (p?.uhid as string) ?? '' }
  }
  const delivery = baby.delivery as unknown as { id: string; mode: string; gestation_days: number | null; patient_id: string; admission_id: string; babies: { id: string }[] }
  const { data: mother } = await supabase.from('patients').select('full_name').eq('id', delivery.patient_id).single()
  if (!mother) return { success: false, error: 'Mother not found' }

  const count = delivery.babies.length
  const name = opts.name?.trim() || `Baby of ${mother.full_name}${count > 1 ? ` (${count === 2 ? 'Twin' : 'Baby'} ${baby.birth_order})` : ''}`
  // Creates and links the patient in one locked transaction (see migration 0146).
  const { data: reg, error: regErr } = await supabase.rpc('register_newborn_patient', { p_baby_id: babyId, p_name: name })
  const row = (reg as Array<{ out_patient_id: string; out_uhid: string; out_created: boolean }> | null)?.[0]
  if (regErr || !row) return { success: false, error: regErr?.message ?? 'Registration failed' }
  const patientId = row.out_patient_id
  const uhid = row.out_uhid
  if (!row.out_created) return { success: true, patientId, uhid }
  const dob = istDate(baby.born_at as string)

  // Start the child's record (best effort — the registration itself has succeeded).
  await Promise.all([
    supabase.from('pediatric_profiles').upsert({
      patient_id: patientId, tenant_id: actor.tenant_id,
      gestational_age_weeks: delivery.gestation_days != null ? Math.round((delivery.gestation_days / 7) * 10) / 10 : null,
      birth_weight_kg: baby.birth_weight_kg, birth_length_cm: baby.length_cm, birth_head_circ_cm: baby.head_circ_cm,
      delivery_mode: PROFILE_MODE[delivery.mode] ?? null, nicu_admission: baby.nicu,
      feeding: baby.breastfed_within_1h ? 'exclusive_breastfeeding' : null,
      updated_by: actor.id, updated_at: new Date().toISOString(),
    }),
    baby.birth_weight_kg != null || baby.length_cm != null || baby.head_circ_cm != null
      ? supabase.from('pediatric_growth').insert({
          tenant_id: actor.tenant_id, patient_id: patientId, recorded_by: actor.id, recorded_at: dob,
          weight_kg: baby.birth_weight_kg, height_cm: baby.length_cm, head_circ_cm: baby.head_circ_cm, notes: 'At birth',
        })
      : Promise.resolve(null),
    opts.birthDosesGiven
      ? supabase.from('patient_immunizations').upsert(
          [['BCG', 'Birth'], ['OPV', '0 (Birth)'], ['Hepatitis B', 'Birth']].map(([vaccine, dose_label]) => ({
            tenant_id: actor.tenant_id, patient_id: patientId, vaccine, dose_label, given_date: istToday(), given_by: actor.id,
          })),
          { onConflict: 'patient_id,vaccine,dose_label', ignoreDuplicates: true },
        )
      : Promise.resolve(null),
  ])

  await logAudit(actor.id, 'register_newborn', 'patient', patientId, { mother: delivery.patient_id, admission: delivery.admission_id })
  return { success: true, patientId, uhid }
}

// ── Postpartum checks ────────────────────────────────────────────────────────

const PostpartumInput = z.object({
  recorded_at: opt(Iso),
  bp:          opt(BpStr),
  pulse:       opt(z.number().int().min(30).max(220)),
  temp:        opt(z.number().min(33, 'Temperature in °C').max(43, 'Temperature in °C')),
  uterus:      opt(z.enum(['contracted', 'boggy'])),
  bleeding:    opt(z.enum(['normal', 'heavy'])),
  bladder:     opt(z.enum(['passed_urine', 'catheter', 'distended'])),
  wound:       opt(z.string().max(200)),
  notes:       opt(z.string().max(1000)),
})

export async function addPostpartumCheck(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = PostpartumInput.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const p = parsed.data
  if ([p.bp, p.pulse, p.temp, p.uterus, p.bleeding, p.bladder, p.wound].every((v) => v == null || v === '')) {
    return { success: false, error: 'Enter at least one finding' }
  }
  const { supabase, adm } = await loadAdmission(admissionId)
  if (!adm) return { success: false, error: 'Admission not found' }
  if (adm.status !== 'admitted') return { success: false, error: 'The patient is no longer admitted' }
  const { data: delivery } = await supabase.from('deliveries').select('delivered_at').eq('admission_id', admissionId).maybeSingle()
  if (!delivery) return { success: false, error: 'Record the delivery first' }
  const at = p.recorded_at || new Date().toISOString()
  if (Date.parse(at) < Date.parse(delivery.delivered_at as string)) return { success: false, error: 'Check time is before the delivery' }
  if (Date.parse(at) > Date.now() + 2 * 60000) return { success: false, error: 'Check time cannot be in the future' }
  const { error } = await supabase.from('postpartum_obs').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, recorded_by: actor.id, ...p, recorded_at: at,
    bp: p.bp?.replace(/\s/g, '') || null, wound: p.wound?.trim() || null, notes: p.notes?.trim() || null,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'postpartum_check', 'admission', admissionId)
  return { success: true }
}
