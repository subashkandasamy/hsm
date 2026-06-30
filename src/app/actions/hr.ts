'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import {
  CreateStaffSchema, UpdateStaffSchema,
  MarkAttendanceSchema, SetRosterSchema,
} from '@/lib/schemas'
import type { StaffMember, StaffAttendance, DutyRoster } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Staff directory ----

export async function listStaff(filters?: { role?: string; departmentId?: string }): Promise<StaffMember[]> {
  const supabase = await createClient()
  let q = supabase
    .from('profiles')
    .select('*, staff:staff_profiles(profile_id, designation, joining_date, address, emergency_contact, consultation_fee)')
    .order('full_name')

  if (filters?.role) q = q.eq('role', filters.role)
  if (filters?.departmentId) q = q.eq('department_id', filters.departmentId)

  const { data } = await q.limit(500)
  return (data ?? []) as unknown as StaffMember[]
}

export async function getStaff(profileId: string): Promise<StaffMember | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('*, staff:staff_profiles(profile_id, designation, joining_date, address, emergency_contact, consultation_fee)')
    .eq('id', profileId)
    .single()
  return data as unknown as StaffMember | null
}

export async function createStaff(
  input: Record<string, unknown>
): Promise<{ success: true; profileId: string; tempPassword: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')

  const parsed = CreateStaffSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  // Use service-role client so we can call auth.admin APIs
  const service = createServiceClient()

  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.temp_password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  })
  if (authErr || !authData.user) return { success: false, error: authErr?.message ?? 'Auth creation failed' }

  const profileId = authData.user.id
  const supabase = await createClient()

  const { error: profileErr } = await supabase.from('profiles').insert({
    id: profileId,
    tenant_id: actor.tenant_id,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    phone: parsed.data.phone ?? null,
    department_id: parsed.data.department_id ?? null,
    is_active: true,
  })
  if (profileErr) {
    await service.auth.admin.deleteUser(profileId)
    return { success: false, error: profileErr.message }
  }

  if (parsed.data.designation || parsed.data.joining_date || parsed.data.consultation_fee != null) {
    await supabase.from('staff_profiles').upsert({
      profile_id: profileId,
      tenant_id: actor.tenant_id,
      designation: parsed.data.designation ?? null,
      joining_date: parsed.data.joining_date ?? null,
      consultation_fee: parsed.data.consultation_fee ?? null,
    }, { onConflict: 'profile_id' })
  }

  await logAudit(actor.id, 'create', 'staff', profileId, {
    email: parsed.data.email, role: parsed.data.role,
  })
  return { success: true, profileId, tempPassword: parsed.data.temp_password }
}

export async function updateStaff(profileId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')

  const parsed = UpdateStaffSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const profileData: Record<string, unknown> = {}
  if (parsed.data.full_name)    profileData.full_name    = parsed.data.full_name
  if (parsed.data.role)         profileData.role         = parsed.data.role
  if (parsed.data.department_id !== undefined) profileData.department_id = parsed.data.department_id
  if (parsed.data.phone !== undefined)         profileData.phone = parsed.data.phone

  if (Object.keys(profileData).length > 0) {
    const { error } = await supabase.from('profiles').update(profileData).eq('id', profileId)
    if (error) return { success: false, error: error.message }
  }

  const staffData: Record<string, unknown> = {}
  if (parsed.data.designation !== undefined)       staffData.designation       = parsed.data.designation
  if (parsed.data.joining_date !== undefined)      staffData.joining_date      = parsed.data.joining_date
  if (parsed.data.address !== undefined)           staffData.address           = parsed.data.address
  if (parsed.data.emergency_contact !== undefined) staffData.emergency_contact = parsed.data.emergency_contact
  if (parsed.data.consultation_fee !== undefined)  staffData.consultation_fee  = parsed.data.consultation_fee

  if (Object.keys(staffData).length > 0) {
    await supabase.from('staff_profiles')
      .upsert({ profile_id: profileId, tenant_id: actor.tenant_id, ...staffData }, { onConflict: 'profile_id' })
  }

  await logAudit(actor.id, 'update', 'staff', profileId, parsed.data as Record<string, unknown>)
  return { success: true }
}

export async function getStaffEmail(profileId: string): Promise<string | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')
  const service = createServiceClient()
  const { data } = await service.auth.admin.getUserById(profileId)
  return data?.user?.email ?? null
}

export async function updateStaffEmail(profileId: string, newEmail: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')
  const trimmed = newEmail.trim().toLowerCase()
  if (!trimmed) return { success: false, error: 'Email cannot be empty' }
  const service = createServiceClient()
  const { error } = await service.auth.admin.updateUserById(profileId, { email: trimmed })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update_email', 'staff', profileId)
  return { success: true }
}

export async function deactivateStaff(profileId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', profileId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'deactivate', 'staff', profileId)
  return { success: true }
}

// ---- Attendance ----

export async function markAttendance(input: Record<string, unknown>): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:attendance')

  const parsed = MarkAttendanceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('staff_attendance').upsert(
    {
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      profile_id: parsed.data.profile_id,
      date: parsed.data.date,
      status: parsed.data.status,
      shift: parsed.data.shift ?? null,
      check_in: parsed.data.check_in ?? null,
      check_out: parsed.data.check_out ?? null,
    },
    { onConflict: 'profile_id,date', ignoreDuplicates: false }
  )
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'attendance', 'staff', parsed.data.profile_id, {
    date: parsed.data.date, status: parsed.data.status,
  })
  return { success: true }
}

export async function getAttendance(params: {
  profileId?: string
  month: string   // YYYY-MM
}): Promise<StaffAttendance[]> {
  const supabase = await createClient()
  const startDate = `${params.month}-01`
  const year  = parseInt(params.month.split('-')[0])
  const month = parseInt(params.month.split('-')[1])
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${params.month}-${String(lastDay).padStart(2, '0')}`

  let q = supabase
    .from('staff_attendance')
    .select('*, profile:profiles(id, full_name, role)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  if (params.profileId) q = q.eq('profile_id', params.profileId)

  const { data } = await q.limit(2000)
  return (data ?? []) as unknown as StaffAttendance[]
}

export async function getAllAttendanceForDate(date: string): Promise<StaffAttendance[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('staff_attendance')
    .select('*, profile:profiles(id, full_name, role)')
    .eq('date', date)
    .order('profile_id')
  return (data ?? []) as unknown as StaffAttendance[]
}

// ---- Roster ----

export async function setRoster(input: Record<string, unknown>): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')

  const parsed = SetRosterSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('duty_roster').upsert(
    {
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      profile_id: parsed.data.profile_id,
      date: parsed.data.date,
      shift: parsed.data.shift ?? null,
      ward_id: parsed.data.ward_id ?? null,
    },
    { onConflict: 'profile_id,date', ignoreDuplicates: false }
  )
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'roster', 'staff', parsed.data.profile_id, {
    date: parsed.data.date, shift: parsed.data.shift,
  })
  return { success: true }
}

export async function getRoster(params: { weekStart: string }): Promise<DutyRoster[]> {
  const supabase = await createClient()
  const start = new Date(params.weekStart)
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)

  const { data } = await supabase
    .from('duty_roster')
    .select('*, profile:profiles(id, full_name, role), ward:wards(id, name)')
    .gte('date', start.toISOString().slice(0, 10))
    .lte('date', end.toISOString().slice(0, 10))
    .order('date')
  return (data ?? []) as unknown as DutyRoster[]
}
