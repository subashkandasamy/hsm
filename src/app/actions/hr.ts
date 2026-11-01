'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { sendStaffCredentialsEmail } from '@/lib/email'
import type { Role } from '@/lib/types'
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

/**
 * An HR manager may run the staff list, but never an administrator's account.
 *
 * The database enforces this too (migration 0236), but two of the calls below —
 * updateStaffEmail and resendStaffCredentials — run under the service role and
 * bypass row-level security completely. Without this guard an HR user could
 * reset the owner's password, or move their login to an address they control,
 * and own the hospital. So the check lives here, where those calls are.
 */
async function assertMayManage(
  actor: { role: Role; tenant_id: string }, targetProfileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceClient()
  const { data } = await service.from('profiles')
    .select('role, tenant_id').eq('id', targetProfileId).maybeSingle()

  // Tenancy first, and before the admin short-circuit.
  //
  // This used to open with `if (actorRole === 'admin') return ok`, which meant
  // an administrator was never checked against anything — and the calls below
  // go through service.auth.admin.*, the Supabase Auth Admin API, where there
  // is no row-level security to fall back on. So any hospital's admin could
  // move another hospital's staff login to an address they controlled and then
  // reset the password onto it.
  //
  // Not-found and not-yours give the same answer deliberately: otherwise this
  // is an oracle for "does this UUID exist, and is it an administrator".
  if (!data || (data.tenant_id as string) !== actor.tenant_id) {
    return { ok: false, error: 'That staff member was not found.' }
  }

  if (actor.role === 'admin') return { ok: true }
  if ((data.role as string | undefined) === 'admin') {
    return { ok: false, error: 'Only an administrator can manage another administrator’s account.' }
  }
  return { ok: true }
}

/** Only an administrator may hand out the administrator role. */
function assertMayAssignRole(actorRole: Role, newRole: unknown): string | null {
  if (newRole === 'admin' && actorRole !== 'admin') {
    return 'Only an administrator can create or promote another administrator.'
  }
  return null
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

  const roleErr = assertMayAssignRole(actor.role, parsed.data.role)
  if (roleErr) return { success: false, error: roleErr }

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

  const may = await assertMayManage(actor, profileId)
  if (!may.ok) return { success: false, error: may.error }
  const roleErr = assertMayAssignRole(actor.role, parsed.data.role)
  if (roleErr) return { success: false, error: roleErr }

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
  const may = await assertMayManage(actor, profileId)
  if (!may.ok) return null
  const service = createServiceClient()
  const { data } = await service.auth.admin.getUserById(profileId)
  return data?.user?.email ?? null
}

export async function updateStaffEmail(profileId: string, newEmail: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')
  const may = await assertMayManage(actor, profileId)
  if (!may.ok) return { success: false, error: may.error }
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
  const may = await assertMayManage(actor, profileId)
  if (!may.ok) return { success: false, error: may.error }

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
  const may = await assertMayManage(actor, profileId)
  if (!may.ok) return { success: false, error: may.error }

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

  const may = await assertMayManage(actor, profileId)
  if (!may.ok) return { success: false, error: may.error }

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

  // check_out before check_in is wrong for a day shift and right for a night
  // one, so it cannot be judged by the schema (F-62). Eight of this hospital's
  // 24 shift definitions cross midnight.
  //
  // Where a shift is named, its own `crosses_midnight` decides. Where none is
  // named — 14 of the 19 rows on file carry no shift — the entry is treated as
  // a same-day shift, and the message says what to do about it rather than just
  // refusing, so a night entry is a shift selection away instead of a dead end.
  const { check_in: cin, check_out: cout, shift } = parsed.data
  if (cin && cout && cout < cin) {
    let crossesMidnight = false
    if (shift) {
      const { data: def } = await supabase
        .from('shift_definitions')
        .select('crosses_midnight')
        .eq('code', shift)
        .maybeSingle()
      crossesMidnight = !!def?.crosses_midnight
    }
    if (!crossesMidnight) {
      return {
        success: false,
        error: shift
          ? `Check-out (${cout}) is before check-in (${cin}), and the "${shift}" shift does not cross midnight.`
          : `Check-out (${cout}) is before check-in (${cin}). If this was a night shift, choose that shift so the overnight hours are counted.`,
      }
    }
  }

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
