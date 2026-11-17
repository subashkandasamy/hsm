import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Patients whose UHID, old number (SwiftEHR's DRKMCH-…) or phone contains the
 * term, for filtering another list (lab, radiology, IPD) by patient. Capped:
 * the ids go into a URL, and a long id list is refused there (see inChunks).
 * Names are searched by joining the patient instead — a common name can match
 * hundreds of people.
 */
export async function patientIdsByNumber(supabase: SupabaseClient, term: string, cap = 80): Promise<string[]> {
  if (!term) return []
  const { data } = await supabase.from('patients').select('id')
    .or(`uhid.ilike.%${term}%,legacy_uhid.ilike.%${term}%,phone.ilike.%${term}%`)
    .limit(cap)
  return (data ?? []).map((p) => p.id as string)
}

/** Patients whose name contains the term — capped, for the same reason. */
export async function patientIdsByName(supabase: SupabaseClient, term: string, cap = 150): Promise<string[]> {
  if (!term) return []
  const { data } = await supabase.from('patients').select('id').ilike('full_name', `%${term}%`).limit(cap)
  return (data ?? []).map((p) => p.id as string)
}
