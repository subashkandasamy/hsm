'use server'

import { createClient } from '@/lib/supabase/server'
import type { RxWarning } from '@/lib/types'
import { evaluateRxSafety, type RxInteractionRow } from '@/lib/rxMatch'
import { resolveGenerics, type DrugRef } from '@/lib/drugResolve'
import { pageAll } from '@/lib/supabase/pageAll'
import { splitAllergyText } from '@/lib/allergyText'
import { withBuiltInInteractions } from '@/lib/rxInteractions'

/** How far back a previous prescription still counts as something to warn about. */
const RX_LOOKBACK_DAYS = 90

type Supabase = Awaited<ReturnType<typeof createClient>>

/** A drug to check the new one against, and where it came from — the warning says so. */
interface OtherDrug { label: string; ref?: DrugRef | null; provenance: string }

// Warn on allergies to the drug (incl. class) and on interactions with the other
// drugs the patient is on or was recently given. Non-blocking — the doctor decides.
//
// Every drug is first resolved to its generic name through the catalogue.
// Prescriptions are written as brands — "Azithral 500", "Amlopres 5" — and the
// interaction table and most recorded allergies use generics, so comparing the
// label alone never matched and the check was silent for nearly everything
// prescribed. The decision itself lives in `lib/rxMatch.ts`, where it is tested.
//
// Two entry points share this one function — OPD prescriptions and IPD
// medication orders — so the two can never disagree about what is dangerous.
async function runSafetyCheck(
  supabase: Supabase,
  input: { patientId: string; drug: { label: string; ref?: DrugRef | null }; others: OtherDrug[] },
): Promise<RxWarning[]> {
  const name = input.drug.label.trim().toLowerCase()
  if (name.length < 3) return []

  // ---- Allergies ----
  // Structured allergies and anything typed at registration (BUG-008).
  const [{ data: structured }, { data: pat }] = await Promise.all([
    supabase.from('patient_allergies').select('allergen').eq('patient_id', input.patientId),
    supabase.from('patients').select('allergies').eq('id', input.patientId).maybeSingle(),
  ])
  const allergyNames = [
    ...(structured ?? []).map((a) => (a.allergen as string) || ''),
    ...splitAllergyText(pat?.allergies as string | null),
  ]

  // ---- The other drugs to check against ----
  //
  // The caller's own list first (this prescription's lines, or what is running
  // on the admission), then recent prescriptions. The dangerous interaction is
  // usually with something the patient is ALREADY taking — warfarin from a
  // previous visit — which was never considered (F-61).
  //
  // What can honestly be offered for the past: drugs prescribed to this patient
  // in the last 90 days. `prescriptions` has no patient_id (it hangs off
  // `visits`) and no active flag — `duration` is free text like "5 days" — so
  // there is no way to know what is still being taken. The warning therefore
  // says when it was prescribed and lets the doctor judge, rather than asserting
  // it is current.
  const others = new Map<string, OtherDrug>()
  for (const o of input.others) {
    const key = (o.label || '').toLowerCase().trim()
    if (key.length >= 3 && !others.has(key)) others.set(key, { ...o, label: key })
  }
  const since = new Date(Date.now() - RX_LOOKBACK_DAYS * 86400000).toISOString()
  const { data: priorRx } = await supabase
    .from('prescriptions')
    .select('drug_name, visit:visits!inner(patient_id, visit_date)')
    .eq('visit.patient_id', input.patientId)
    .gte('visit.visit_date', since)
    .limit(200)
  type PriorRow = { drug_name: string; visit: { visit_date: string | null } | null }
  for (const r of (priorRx ?? []) as unknown as PriorRow[]) {
    const key = (r.drug_name || '').toLowerCase().trim()
    if (key.length < 3 || others.has(key)) continue
    const when = r.visit?.visit_date ? ` on ${r.visit.visit_date.slice(0, 10)}` : ''
    others.set(key, { label: key, provenance: `prescribed${when}` })
  }

  // ---- What each drug actually is ----
  const resolved = await resolveGenerics(supabase, [
    { label: name, ref: input.drug.ref ?? null },
    ...[...others.values()].map((o) => ({ label: o.label, ref: o.ref ?? null })),
  ])
  const namesOf = (label: string) => [label, ...(resolved.get(label)?.generics ?? [])]

  // 38 rows today, global reference data, read whole because the match needs
  // substring comparison that SQL cannot do on this shape. Paged anyway: this
  // is the interaction check, and the failure mode of a short read is a
  // dangerous pair that simply does not get flagged.
  const interactions = others.size
    ? withBuiltInInteractions(await pageAll<RxInteractionRow>((f, t) => supabase.from('drug_interactions')
      .select('drug_a, drug_b, severity, description').order('id').range(f, t)))
    : []

  return evaluateRxSafety({
    drug: { label: name, names: namesOf(name), identified: resolved.get(name)?.identified ?? false },
    allergies: allergyNames,
    others: [...others.values()].map((o) => ({ label: o.label, names: namesOf(o.label), provenance: o.provenance })),
    interactions,
  })
}

/** OPD: a drug being added to a prescription, checked against the prescription's other lines and the patient's recent ones. */
export async function checkPrescriptionSafety(
  patientId: string, drugName: string, currentDrugs: string[], drugRef?: DrugRef | null,
): Promise<RxWarning[]> {
  if (drugName.trim().length < 3) return []
  const supabase = await createClient()
  return runSafetyCheck(supabase, {
    patientId,
    drug: { label: drugName, ref: drugRef?.id ? drugRef : null },
    others: currentDrugs.map((d) => ({ label: d, provenance: 'on this prescription' })),
  })
}

/**
 * IPD: a medication order, checked against everything already running on this
 * admission and the patient's recent prescriptions. Running orders carry the
 * catalogue row they were picked from, so they are identified exactly; so is
 * the new drug when the doctor picked it from the list.
 */
export async function checkIpdOrderSafety(
  admissionId: string, drugName: string, drugRef?: DrugRef | null,
): Promise<RxWarning[]> {
  if (drugName.trim().length < 3) return []
  const supabase = await createClient()
  const { data: adm } = await supabase.from('admissions').select('patient_id').eq('id', admissionId).maybeSingle()
  if (!adm) return []
  const { data: running } = await supabase
    .from('ipd_medication_orders')
    .select('drug_name, drug_master_id, drug_id')
    .eq('admission_id', admissionId).eq('status', 'active').eq('type', 'medication')
  return runSafetyCheck(supabase, {
    patientId: adm.patient_id as string,
    drug: { label: drugName, ref: drugRef?.id ? drugRef : null },
    others: (running ?? []).map((o) => ({
      label: (o.drug_name as string | null) ?? '',
      ref: o.drug_master_id ? { id: o.drug_master_id as string, isGlobal: true }
        : o.drug_id ? { id: o.drug_id as string, isGlobal: false } : null,
      provenance: 'running on this admission',
    })),
  })
}
