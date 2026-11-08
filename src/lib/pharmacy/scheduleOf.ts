import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A medicine's schedule (H, H1, X, G or null), whether it is the hospital's own
 * drug (`drugs`) or from the shared catalogue (`drug_master`) — the same
 * lookup the register trigger makes (log_h1_supply, 0269).
 */
export async function scheduleOfDrug(
  supabase: SupabaseClient,
  ref: { drugId?: string | null; drugMasterId?: string | null } | string,
): Promise<string | null> {
  const { drugId, drugMasterId } = typeof ref === 'string' ? { drugId: ref, drugMasterId: ref } : ref
  if (drugId) {
    const { data } = await supabase.from('drugs').select('schedule').eq('id', drugId).maybeSingle()
    if (data) return (data.schedule as string | null)?.toUpperCase() ?? null
  }
  if (drugMasterId) {
    const { data } = await supabase.from('drug_master').select('schedule').eq('id', drugMasterId).maybeSingle()
    if (data) return (data.schedule as string | null)?.toUpperCase() ?? null
  }
  return null
}
