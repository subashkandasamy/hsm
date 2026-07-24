import type { createClient } from '@/lib/supabase/server'

type Supa = Awaited<ReturnType<typeof createClient>>

// Is this bed an ICU bed? bed → ward → ward_room_types.is_icu.
export async function bedIsIcu(supabase: Supa, bedId: string | null): Promise<boolean> {
  if (!bedId) return false
  const { data: bed } = await supabase.from('beds').select('ward_id').eq('id', bedId).maybeSingle()
  if (!bed?.ward_id) return false
  const { data: ward } = await supabase.from('wards').select('room_type_id').eq('id', bed.ward_id).maybeSingle()
  if (!ward?.room_type_id) return false
  const { data: rt } = await supabase.from('ward_room_types').select('is_icu').eq('id', ward.room_type_id).maybeSingle()
  return !!rt?.is_icu
}

// Enter ICU: flag the admission critical and open an ICU episode (idempotent —
// won't open a second episode while one is already open).
export async function enterIcu(
  supabase: Supa, tenantId: string, admissionId: string, bedId: string | null, wardId: string | null, actorId: string,
): Promise<void> {
  await supabase.from('admissions').update({ is_critical_care: true }).eq('id', admissionId)
  const { data: open } = await supabase
    .from('icu_stays').select('id').eq('admission_id', admissionId).is('exited_at', null).maybeSingle()
  if (!open) {
    await supabase.from('icu_stays').insert({
      tenant_id: tenantId, admission_id: admissionId, bed_id: bedId, ward_id: wardId, entered_by: actorId,
    })
  }
}

// Leave ICU: clear the critical flag and close any open episode. Leaves
// on_ventilator untouched (managed explicitly), except callers may clear it.
export async function exitIcu(supabase: Supa, admissionId: string, actorId: string): Promise<void> {
  await supabase.from('admissions').update({ is_critical_care: false }).eq('id', admissionId)
  await supabase
    .from('icu_stays')
    .update({ exited_at: new Date().toISOString(), exited_by: actorId })
    .eq('admission_id', admissionId)
    .is('exited_at', null)
}
