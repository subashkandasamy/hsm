import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cancels an open blood request and puts its reserved units back on the shelf.
 *
 * A compatible cross-match reserves the unit (recordCrossMatch). Cancelling the
 * request used to change only the request, so the unit stayed "reserved" for a
 * patient who no longer needed it and could never be cross-matched again. Used
 * by the blood bank's Cancel and by discharge.
 *
 * A unit is released only when no other open request has a compatible
 * cross-match on it — a unit can be matched for two patients while reserved.
 *
 * Returns false when the request was not open (already issued or cancelled).
 */
export async function cancelBloodRequestAndRelease(
  supabase: SupabaseClient,
  requestId: string,
): Promise<{ cancelled: boolean; unitsReleased: number }> {
  const { data: cancelled, error } = await supabase
    .from('blood_requests').update({ status: 'cancelled' })
    .eq('id', requestId).in('status', ['requested', 'cross_matched'])
    .select('id')
  if (error) throw new Error(error.message)
  if (!cancelled?.length) return { cancelled: false, unitsReleased: 0 }

  const { data: matches } = await supabase
    .from('blood_crossmatches').select('blood_unit_id')
    .eq('request_id', requestId).eq('compatible', true)
  const unitIds = [...new Set((matches ?? []).map((m) => m.blood_unit_id as string))]
  if (!unitIds.length) return { cancelled: true, unitsReleased: 0 }

  // Units still wanted by another open request stay reserved.
  const { data: others } = await supabase
    .from('blood_crossmatches')
    .select('blood_unit_id, blood_requests!inner(status)')
    .in('blood_unit_id', unitIds).eq('compatible', true).neq('request_id', requestId)
    .in('blood_requests.status', ['requested', 'cross_matched'])
  const stillWanted = new Set((others ?? []).map((o) => o.blood_unit_id as string))
  const toRelease = unitIds.filter((u) => !stillWanted.has(u))
  if (!toRelease.length) return { cancelled: true, unitsReleased: 0 }

  // Only a unit that is still reserved — an issued unit is never touched.
  const { data: released } = await supabase
    .from('blood_units').update({ status: 'available' })
    .in('id', toRelease).eq('status', 'reserved')
    .select('id')
  return { cancelled: true, unitsReleased: released?.length ?? 0 }
}
