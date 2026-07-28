'use server'

import { createClient } from '@/lib/supabase/server'
import type { RxWarning } from '@/lib/types'

// Common allergy classes → member generics, so an allergy to "penicillin" flags
// amoxicillin etc. Keyword/substring matching — a safety aid, not exhaustive.
const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'cloxacillin', 'augmentin', 'amoxiclav', 'piperacillin'],
  sulfa: ['sulfa', 'sulfamethoxazole', 'cotrimoxazole', 'septran', 'bactrim'],
  nsaid: ['ibuprofen', 'diclofenac', 'aspirin', 'naproxen', 'aceclofenac', 'ketorolac', 'nimesulide', 'indomethacin'],
  cephalosporin: ['cephalexin', 'cefixime', 'ceftriaxone', 'cefuroxime', 'cefpodoxime', 'cefepime'],
}

// Warn on allergies to the drug (incl. class) and interactions with drugs
// already on this visit's prescription. Non-blocking — the doctor decides.
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
    let hit = name.includes(allergen) || allergen.includes(name)
    if (!hit) {
      for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
        const allergenInClass = allergen.includes(cls) || members.some((m) => allergen.includes(m))
        if (allergenInClass && members.some((m) => name.includes(m))) { hit = true; break }
      }
    }
    if (hit) warnings.push({ type: 'allergy', severity: 'major', message: `Patient is allergic to "${a.allergen}"` })
  }

  // ---- Interactions with current prescriptions ----
  const others = currentDrugs.map((d) => (d || '').toLowerCase()).filter((d) => d.length >= 3)
  if (others.length) {
    const { data: inter } = await supabase.from('drug_interactions').select('drug_a, drug_b, severity, description')
    for (const row of inter ?? []) {
      const a = row.drug_a as string, b = row.drug_b as string
      const nameHasA = name.includes(a), nameHasB = name.includes(b)
      if (!nameHasA && !nameHasB) continue
      for (const o of others) {
        if ((nameHasA && o.includes(b)) || (nameHasB && o.includes(a))) {
          warnings.push({ type: 'interaction', severity: row.severity as RxWarning['severity'], message: `Interacts with ${o}: ${row.description}` })
          break
        }
      }
    }
  }

  const seen = new Set<string>()
  return warnings.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)))
}
