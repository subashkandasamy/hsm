import type { SupabaseClient } from '@supabase/supabase-js'

export const ADMISSION_CLOSED_ERROR =
  'This patient has been discharged — nothing new can be ordered on this admission.'

/**
 * Null when the admission is still open; otherwise the message to show.
 *
 * For actions that add work or charges to a stay but do not sit behind
 * assertTreatmentStarted (care-team visits, surgery booking, blood requests,
 * OT consumables). Same words as that gate, so the screen reads the same.
 */
export async function admissionClosedError(
  supabase: SupabaseClient,
  admissionId: string,
): Promise<string | null> {
  const { data } = await supabase.from('admissions').select('status').eq('id', admissionId).maybeSingle()
  if (!data) return 'Admission not found'
  return data.status === 'admitted' ? null : ADMISSION_CLOSED_ERROR
}
