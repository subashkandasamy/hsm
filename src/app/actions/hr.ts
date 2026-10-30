'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { sendStaffCredentialsEmail } from '@/lib/email'
import {
  CreateStaffSchema, UpdateStaffSchema,
  MarkAttendanceSchema,
} from '@/lib/schemas'
import type { StaffMember, StaffAttendance } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// Temp password lifetime before it must be re-issued by an admin.
const TEMP_PASSWORD_TTL_HOURS = 72
// A "forever" ban keeps a deactivated staff member from authenticating at all
// (Supabase has no permanent-ban flag, so we use a very long duration).
const FOREVER_BAN = '876000h' // ~100 years

/** Generates a readable 12-char temp password (no ambiguous characters). */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789!@#'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let pw = ''
  for (let i = 0; i < 12; i++) pw += chars[bytes[i] % chars.length]
  return pw
}

/** Builds the tenant's login URL from the request's subdomain headers. */
async function tenantLoginUrl(): Promise<string> {
  const hdrs = await headers()
  const slug = hdrs.get('x-tenant-slug')
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  return slug
    ? `https://${slug}.${rootDomain}/login`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${rootDomain}`}/login`
}

// ---- Staff directory ----

export async function listStaff(filters?: { role?: string; departmentId?: string }): Promise<StaffMember[]> {
  const supabase = await createClient()
  let q = supabase
    .from('profiles')
    .select('*, staff:staff_profiles(profile_id, designation, joining_date, address, emergency_contact, consultation_fee, nursing_charge_per_shift)')
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
    .select('*, staff:staff_profiles(profile_id, designation, joining_date, address, emergency_contact, consultation_fee, nursing_charge_per_shift)')
    .eq('id', profileId)
    .single()
  return data as unknown as StaffMember | null
}

export async function createStaff(
  input: Record<string, unknown>
): Promise<{ success: true; profileId: string; tempPassword: string; emailSent: boolean; email: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')

  const parsed = CreateStaffSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  // Use service-role client so we can call auth.admin APIs
  const service = createServiceClient()

  // Auto-generate the temp password unless the admin supplied one explicitly.
  const tempPassword = parsed.data.temp_password ?? generateTempPassword()
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600_000)

  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
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
    sees_patients: parsed.data.role === 'admin' && !!parsed.data.sees_patients,
    is_active: true,
    must_change_password: true,
    temp_password_expires_at: expiresAt.toISOString(),
  })
  if (profileErr) {
    await service.auth.admin.deleteUser(profileId)
    return { success: false, error: profileErr.message }
  }

  if (parsed.data.designation || parsed.data.joining_date || parsed.data.consultation_fee != null || parsed.data.nursing_charge_per_shift != null) {
    await supabase.from('staff_profiles').upsert({
      profile_id: profileId,
      tenant_id: actor.tenant_id,
      designation: parsed.data.designation ?? null,
      joining_date: parsed.data.joining_date ?? null,
      consultation_fee: parsed.data.consultation_fee ?? null,
      nursing_charge_per_shift: parsed.data.nursing_charge_per_shift ?? null,
    }, { onConflict: 'profile_id' })
  }

  // Emailing must never block the account that has already been created — but
  // whether it arrived is reported, not swallowed.
  const hospitalName = (await headers()).get('x-tenant-name') ?? 'your hospital'
  const emailSent = await sendStaffCredentialsEmail({
    to: parsed.data.email,
    fullName: parsed.data.full_name,
    hospitalName,
    loginUrl: await tenantLoginUrl(),
    email: parsed.data.email,
    tempPassword,
    expiresHours: TEMP_PASSWORD_TTL_HOURS,
  })

  await logAudit(actor.id, 'create', 'staff', profileId, {
    email: parsed.data.email, role: parsed.data.role, email_sent: emailSent,
  })
  // tempPassword is also returned so the admin can share it out-of-band.
  return { success: true, profileId, tempPassword, emailSent, email: parsed.data.email }
}

export async function updateStaff(profileId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
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
  // Only an administrator can be flagged as also seeing patients.
  if (parsed.data.role && parsed.data.role !== 'admin') profileData.sees_patients = false
  else if (parsed.data.sees_patients !== undefined)     profileData.sees_patients = parsed.data.sees_patients

  if (Object.keys(profileData).length > 0) {
    const { error } = await supabase.from('profiles').update(profileData).eq('id', profileId)
    if (error) return { success: false, error: error.message }
  }

  const staffData: Record<string, unknown> = {}
  if (parsed.data.designation !== undefined)       staffData.designation       = parsed.data.designation
  if (parsed.data.joining_date !== undefined)      staffData.joining_date      = parsed.data.joining_date
  if (parsed.data.address !== undefined)           staffData.address           = parsed.data.address
  if (parsed.data.emergency_contact !== undefined) staffData.emergency_contact = parsed.data.emergency_contact
  if (parsed.data.consultation_fee !== undefined)          staffData.consultation_fee          = parsed.data.consultation_fee
  if (parsed.data.nursing_charge_per_shift !== undefined)  staffData.nursing_charge_per_shift  = parsed.data.nursing_charge_per_shift

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
  await requireWriteAccess()
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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')
  if (profileId === actor.id) return { success: false, error: "You can't deactivate your own account." }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', profileId)
  if (error) return { success: false, error: error.message }

  // Also ban the auth user so they can't authenticate or refresh their session.
  // The dashboard layout blocks any live session on the next request; the ban
  // prevents fresh sign-ins and stops token refresh from renewing access.
  const service = createServiceClient()
  await service.auth.admin.updateUserById(profileId, { ban_duration: FOREVER_BAN })

  await logAudit(actor.id, 'deactivate', 'staff', profileId)
  return { success: true }
}

export async function reactivateStaff(profileId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', profileId)
  if (error) return { success: false, error: error.message }

  const service = createServiceClient()
  await service.auth.admin.updateUserById(profileId, { ban_duration: 'none' })

  await logAudit(actor.id, 'reactivate', 'staff', profileId)
  return { success: true }
}

/**
 * Re-issues a fresh temporary password to a staff member and re-emails it.
 * Used when the original temp password expired before first sign-in, or the
 * staff member never received / lost the credentials.
 */
export async function resendStaffCredentials(
  profileId: string
): Promise<{ success: true; tempPassword: string; emailSent: boolean; email: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')

  const service = createServiceClient()
  const { data: userData } = await service.auth.admin.getUserById(profileId)
  const email = userData?.user?.email
  if (!email) return { success: false, error: 'Could not find this staff member’s login email.' }

  const tempPassword = generateTempPassword()
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600_000)

  const { error: authErr } = await service.auth.admin.updateUserById(profileId, {
    password: tempPassword,
    ban_duration: 'none',
  })
  if (authErr) return { success: false, error: authErr.message }

  const supabase = await createClient()
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .update({
      is_active: true,
      must_change_password: true,
      temp_password_expires_at: expiresAt.toISOString(),
    })
    .eq('id', profileId)
    .select('full_name')
    .single()
  if (profErr) return { success: false, error: profErr.message }

  const hospitalName = (await headers()).get('x-tenant-name') ?? 'your hospital'
  const emailSent = await sendStaffCredentialsEmail({
    to: email,
    fullName: prof?.full_name ?? '',
    hospitalName,
    loginUrl: await tenantLoginUrl(),
    email,
    tempPassword,
    expiresHours: TEMP_PASSWORD_TTL_HOURS,
  })

  await logAudit(actor.id, 'resend_credentials', 'staff', profileId, { email_sent: emailSent })
  return { success: true, tempPassword, emailSent, email }
}

// ---- Attendance ----

export async function markAttendance(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
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

// Roster/duty scheduling lives entirely on the Scheduling page (scheduling.ts).
// The Staff page's old duplicate roster (setRoster/getRoster on duty_roster)
// was removed — it collided with the Scheduling roster on the same table and
// bypassed its leave/permission/status logic.
