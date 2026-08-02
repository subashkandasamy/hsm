'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { DoctorAvailabilitySchema } from '@/lib/schemas'
import type { DoctorAvailability } from '@/lib/types'

// Staff: read a doctor's OPD sessions (tenant-scoped via RLS).
export async function listDoctorAvailability(doctorId: string): Promise<DoctorAvailability[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('day_of_week').order('start_time')
  return (data ?? []) as unknown as DoctorAvailability[]
}

// Staff: replace a doctor's whole weekly OPD schedule.
export async function setDoctorAvailability(
  input: Record<string, unknown>,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const parsed = DoctorAvailabilitySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  await supabase.from('doctor_availability').delete().eq('doctor_id', parsed.data.doctor_id)

  if (parsed.data.sessions.length) {
    const { error } = await supabase.from('doctor_availability').insert(
      parsed.data.sessions.map((s) => ({
        id: crypto.randomUUID(),
        tenant_id: actor.tenant_id,
        doctor_id: parsed.data.doctor_id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        label: s.label ?? null,
        token_cap: s.token_cap ?? null,
      })),
    )
    if (error) return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'set', 'doctor_availability', parsed.data.doctor_id, { count: parsed.data.sessions.length })
  return { success: true }
}
