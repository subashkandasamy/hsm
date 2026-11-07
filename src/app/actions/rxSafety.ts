'use server'

import { createClient } from '@/lib/supabase/server'
import type { RxWarning } from '@/lib/types'
import { boundaryMatch, namesRelated } from '@/lib/rxMatch'
import { pageAll } from '@/lib/supabase/pageAll'

// Common allergy classes → member generics, so an allergy to "penicillin" flags
// amoxicillin etc. Keyword/substring matching — a safety aid, not exhaustive.
const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'cloxacillin', 'augmentin', 'amoxiclav', 'piperacillin'],
  sulfa: ['sulfa', 'sulfamethoxazole', 'cotrimoxazole', 'septran', 'bactrim'],
  nsaid: ['ibuprofen', 'diclofenac', 'aspirin', 'naproxen', 'aceclofenac', 'ketorolac', 'nimesulide', 'indomethacin'],
  cephalosporin: ['cephalexin', 'cefixime', 'ceftriaxone', 'cefuroxime', 'cefpodoxime', 'cefepime'],
}

/** How far back a previous prescription still counts as something to warn about. */
const RX_LOOKBACK_DAYS = 90

// Warn on allergies to the drug (incl. class) and on interactions with drugs on
// this prescription AND with what the patient was prescribed recently.
// Non-blocking — the doctor decides.
export async function checkPrescriptionSafety(
  patientId: string, drugName: string, currentDrugs: string[],
): Promise<RxWarning[]> {
  const name = drugName.trim().toLowerCase()
  if (name.length < 3) return []
  const supabase = await createClient()
  const warnings: RxWarning[] = []

  // ---- Allergy ----
  const { data: allergies } = await supabase
    .from('patient_allergies').select('allergen').eq('patient_id', patientId)
  for (const a of allergies ?? []) {
    const allergen = ((a.allergen as string) || '').toLowerCase().trim()
    if (allergen.length < 3) continue
    let hit = namesRelated(name, allergen)
    if (!hit) {
      for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
        const allergenInClass = allergen.includes(cls) || members.some((m) => allergen.includes(m))
        if (allergenInClass && members.some((m) => name.includes(m))) { hit = true; break }
      }
    }
    if (hit) warnings.push({ type: 'allergy', severity: 'major', message: `Patient is allergic to "${a.allergen}"` })
  }

  // ---- Interactions ----
  //
  // `currentDrugs` comes from the client and holds only the lines on the
  // prescription being written. The dangerous interaction is usually with
  // something the patient is ALREADY taking — warfarin from a previous visit —
  // which was never considered (F-61).
  //
  // What can honestly be offered: drugs prescribed to this patient in the last
  // 90 days. `prescriptions` has no patient_id (it hangs off `visits`) and no
  // active flag — `duration` is free text like "5 days" — so there is no way to
  // know what is still being taken. The warning therefore says when it was
  // prescribed and lets the doctor judge, rather than asserting it is current.
  const since = new Date(Date.now() - RX_LOOKBACK_DAYS * 86400000).toISOString()
  const { data: priorRx } = await supabase
    .from('prescriptions')
    .select('drug_name, visit:visits!inner(patient_id, visit_date)')
    .eq('visit.patient_id', patientId)
    .gte('visit.visit_date', since)
    .limit(200)

  type PriorRow = { drug_name: string; visit: { visit_date: string | null } | null }
  // label → drug name, so a hit can say where it came from.
  const others = new Map<string, string>()
  for (const d of currentDrugs) {
    const v = (d || '').toLowerCase().trim()
    if (v.length >= 3) others.set(v, 'on this prescription')
  }
  for (const r of (priorRx ?? []) as unknown as PriorRow[]) {
    const v = (r.drug_name || '').toLowerCase().trim()
    if (v.length < 3 || others.has(v)) continue
    const when = r.visit?.visit_date ? ` on ${r.visit.visit_date.slice(0, 10)}` : ''
    others.set(v, `prescribed${when}`)
  }

  if (others.size) {
    // 38 rows today, global reference data, read whole because the match needs
    // substring comparison that SQL cannot do on this shape. Paged anyway: this
    // is the interaction check, and the failure mode of a short read is a
    // dangerous pair that simply does not get flagged.
    const inter = await pageAll<{ drug_a: string; drug_b: string; severity: string; description: string }>(
      (f, t) => supabase.from('drug_interactions')
        .select('drug_a, drug_b, severity, description').order('id').range(f, t))
    for (const row of inter) {
      const a = (row.drug_a as string).toLowerCase(), b = (row.drug_b as string).toLowerCase()
      const nameHasA = boundaryMatch(name, a), nameHasB = boundaryMatch(name, b)
      if (!nameHasA && !nameHasB) continue
      for (const [other, provenance] of others) {
        if ((nameHasA && boundaryMatch(other, b)) || (nameHasB && boundaryMatch(other, a))) {
          warnings.push({
            type: 'interaction',
            severity: row.severity as RxWarning['severity'],
            message: `Interacts with ${other} (${provenance}): ${row.description}`,
          })
          break
        }
      }
    }
  }

  const seen = new Set<string>()
  return warnings.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)))
}
