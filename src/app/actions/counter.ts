'use server'

import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  clearDeviceCookie, deviceIdInCookie, hashPin, isPinSession, markPinSession, newDeviceKey, readDevice,
  requestTenantId, setDeviceCookie, startSessionFor, verifyPin,
} from '@/lib/counterServer'
import { DEVICE_LOCK_MINUTES, DEVICE_MAX_ATTEMPTS, PIN_MAX_ATTEMPTS, pinProblem } from '@/lib/pin'

/**
 * The PIN switch (0272). Every function checks for itself who may call it:
 * - a device is approved, listed or removed by an admin of that hospital;
 * - the counter screen works only from an approved browser of that hospital;
 * - a PIN is set by its owner, after their password;
 * - a PIN is reset (cleared) by staff management — admin or HR.
 * The tables are server-only (no RLS policies), so all reads and writes go
 * through the service client here, always filtered to the hospital.
 */

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

const ROLE_LABEL: Record<string, string> = {
  doctor: 'Doctor', nurse: 'Nurse', receptionist: 'Receptionist', lab_tech: 'Lab technician',
  pharmacist: 'Pharmacist', accountant: 'Accountant', hr: 'HR',
}

// ── Approving computers (admin) ────────────────────────────────────────────

export interface SharedDevice {
  id: string; name: string; created_at: string; last_used_at: string | null; created_by_name: string | null
  /** This very browser. */
  isThis: boolean
}

export async function listSharedDevices(): Promise<SharedDevice[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  const thisId = await deviceIdInCookie()
  const { data } = await createServiceClient().from('shared_devices')
    .select('id, name, created_at, last_used_at, creator:profiles!shared_devices_created_by_fkey(full_name)')
    .eq('tenant_id', actor.tenant_id).is('revoked_at', null).order('created_at')
  return (data ?? []).map((d) => ({
    id: d.id as string, name: d.name as string, created_at: d.created_at as string,
    last_used_at: (d.last_used_at as string | null) ?? null,
    created_by_name: ((d.creator as unknown as { full_name: string } | null)?.full_name) ?? null,
    isThis: d.id === thisId,
  }))
}

/** Make the browser this request comes from a shared counter. */
export async function approveThisComputer(name: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean) return { success: false, error: 'Give this computer a name staff will recognise, e.g. "Front desk PC".' }
  if ((await requestTenantId()) !== actor.tenant_id) return { success: false, error: 'Open Uyirly at your hospital’s own address to do this.' }

  const { key, hash } = newDeviceKey()
  const { data, error } = await createServiceClient().from('shared_devices')
    .insert({ tenant_id: actor.tenant_id, name: clean, key_hash: hash, created_by: actor.id }).select('id').single()
  if (error || !data) return { success: false, error: error?.message ?? 'Could not save' }
  await setDeviceCookie(data.id as string, key)
  await logAudit(actor.id, 'register', 'counter_device', data.id as string, { name: clean })
  return { success: true }
}

export async function removeSharedDevice(deviceId: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return { success: false, error: 'Unknown computer' }
  const { data, error } = await createServiceClient().from('shared_devices')
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id })
    .eq('id', deviceId).eq('tenant_id', actor.tenant_id).is('revoked_at', null).select('id, name')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'That computer was not found' }
  if ((await deviceIdInCookie()) === deviceId) await clearDeviceCookie()
  await logAudit(actor.id, 'revoke', 'counter_device', deviceId, { name: data[0].name })
  return { success: true }
}

// ── The counter screen (approved browser, no sign-in needed) ───────────────

export interface CounterStaff { id: string; name: string; role: string; hasPin: boolean; locked: boolean }
export interface CounterState { device: { name: string; paused: boolean } | null; staff: CounterStaff[] }

/** Who can switch in here. Empty unless this browser is an approved counter. */
export async function getCounterState(): Promise<CounterState> {
  const device = await readDevice()
  if (!device) return { device: null, staff: [] }
  const service = createServiceClient()
  const [{ data: people }, { data: pins }] = await Promise.all([
    service.from('profiles').select('id, full_name, role')
      .eq('tenant_id', device.tenant_id).eq('is_active', true).neq('role', 'admin').order('full_name'),
    service.from('staff_pins').select('profile_id, locked_at').eq('tenant_id', device.tenant_id),
  ])
  const pinBy = new Map((pins ?? []).map((p) => [p.profile_id as string, p.locked_at as string | null]))
  return {
    device: { name: device.name, paused: !!device.locked_until && new Date(device.locked_until) > new Date() },
    staff: (people ?? []).map((p) => ({
      id: p.id as string, name: p.full_name as string, role: ROLE_LABEL[p.role as string] ?? (p.role as string),
      hasPin: pinBy.has(p.id as string), locked: !!pinBy.get(p.id as string),
    })),
  }
}

/** The person on an approved computer, if they may use the PIN switch. */
async function counterPerson(profileId: string) {
  const device = await readDevice()
  if (!device) return { error: 'This computer is not an approved shared counter.' } as const
  if (device.locked_until && new Date(device.locked_until) > new Date()) {
    return { error: `Too many wrong PINs on this computer. Try again in ${DEVICE_LOCK_MINUTES} minutes, or sign in with a password.` } as const
  }
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return { error: 'Unknown staff member.' } as const
  const { data: person } = await createServiceClient().from('profiles')
    .select('id, full_name, role, is_active').eq('id', profileId).eq('tenant_id', device.tenant_id).maybeSingle()
  if (!person || !person.is_active) return { error: 'This staff member cannot sign in.' } as const
  // Admins always sign in with their password: settings, roles and staff stay behind it.
  if (person.role === 'admin') return { error: 'Admins sign in with their password, not a PIN.' } as const
  return { device, person } as const
}

/** Switch this counter to `profileId`, if the PIN is theirs. */
export async function switchWithPin(profileId: string, pin: string): Promise<Result> {
  const got = await counterPerson(profileId)
  if ('error' in got) return { success: false, error: got.error as string }
  const { device, person } = got
  const service = createServiceClient()

  const { data: row } = await service.from('staff_pins')
    .select('pin_hash, failed_attempts, locked_at').eq('profile_id', person.id).eq('tenant_id', device.tenant_id).maybeSingle()
  if (!row) return { success: false, error: 'No PIN set yet.' }
  if (row.locked_at) return { success: false, error: 'This PIN is locked after too many wrong tries. Ask an admin to reset it, or sign in with your password.' }

  if (typeof pin !== 'string' || !verifyPin(pin, row.pin_hash as string)) {
    const tries = (row.failed_attempts as number) + 1
    const lockNow = tries >= PIN_MAX_ATTEMPTS
    await service.from('staff_pins').update({ failed_attempts: tries, locked_at: lockNow ? new Date().toISOString() : null }).eq('profile_id', person.id)
    const deviceTries = device.failed_attempts + 1
    await service.from('shared_devices').update({
      failed_attempts: deviceTries >= DEVICE_MAX_ATTEMPTS ? 0 : deviceTries,
      locked_until: deviceTries >= DEVICE_MAX_ATTEMPTS ? new Date(Date.now() + DEVICE_LOCK_MINUTES * 60_000).toISOString() : null,
    }).eq('id', device.id)
    await logAudit(person.id as string, lockNow ? 'pin_locked' : 'pin_failed', 'auth', person.id as string, { device: device.name })
    return { success: false, error: lockNow ? 'Wrong PIN. It is now locked — ask an admin to reset it.' : `Wrong PIN. ${PIN_MAX_ATTEMPTS - tries} ${PIN_MAX_ATTEMPTS - tries === 1 ? 'try' : 'tries'} left.` }
  }

  const started = await startSessionFor(person.id as string, { viaPin: true })
  if (!started.ok) return { success: false, error: started.error }
  await service.from('staff_pins').update({ failed_attempts: 0 }).eq('profile_id', person.id)
  await service.from('shared_devices').update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() }).eq('id', device.id)
  await logAudit(person.id as string, 'switch_in', 'auth', person.id as string, { device: device.name })
  return { success: true }
}

/** Confirms a staff member's password without touching this browser's session. */
async function passwordIsRight(profileId: string, password: string): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false
  const { data: u } = await createServiceClient().auth.admin.getUserById(profileId)
  const email = u?.user?.email
  if (!email) return false
  const anon = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) return false
  await anon.auth.signOut({ scope: 'local' }).catch(() => {})   // that check's own session is not kept
  return true
}

async function savePin(profileId: string, tenantId: string, pin: string): Promise<Result> {
  const problem = pinProblem(pin)
  if (problem) return { success: false, error: problem }
  const { error } = await createServiceClient().from('staff_pins').upsert({
    profile_id: profileId, tenant_id: tenantId, pin_hash: hashPin(pin), failed_attempts: 0, locked_at: null, set_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' })
  return error ? { success: false, error: error.message } : { success: true }
}

/** First time at the counter: password once, choose a PIN, and you are in. */
export async function setPinAtCounter(profileId: string, password: string, pin: string): Promise<Result> {
  const got = await counterPerson(profileId)
  if ('error' in got) return { success: false, error: got.error as string }
  const problem = pinProblem(pin)
  if (problem) return { success: false, error: problem }
  if (!(await passwordIsRight(got.person.id as string, password))) {
    await logAudit(got.person.id as string, 'pin_set_failed', 'auth', got.person.id as string, { device: got.device.name })
    return { success: false, error: 'That password is not right.' }
  }
  const saved = await savePin(got.person.id as string, got.device.tenant_id, pin)
  if (!saved.success) return saved
  await logAudit(got.person.id as string, 'pin_set', 'auth', got.person.id as string, { device: got.device.name })
  const started = await startSessionFor(got.person.id as string, { viaPin: true })
  if (!started.ok) return { success: false, error: started.error }
  await logAudit(got.person.id as string, 'switch_in', 'auth', got.person.id as string, { device: got.device.name })
  return { success: true }
}

// ── My own PIN (signed in) ─────────────────────────────────────────────────

export async function getMyPinStatus(): Promise<{ eligible: boolean; hasPin: boolean; locked: boolean }> {
  const actor = await getActorProfile()
  if (actor.role === 'admin') return { eligible: false, hasPin: false, locked: false }
  const { data } = await createServiceClient().from('staff_pins').select('locked_at').eq('profile_id', actor.id).maybeSingle()
  return { eligible: true, hasPin: !!data, locked: !!data?.locked_at }
}

/** Set or change my PIN. Always asks for my password. */
export async function setMyPin(password: string, pin: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  if (actor.role === 'admin') return { success: false, error: 'Admins sign in with their password, not a PIN.' }
  const problem = pinProblem(pin)
  if (problem) return { success: false, error: problem }
  if (!(await passwordIsRight(actor.id, password))) return { success: false, error: 'That password is not right.' }
  const saved = await savePin(actor.id, actor.tenant_id, pin)
  if (!saved.success) return saved
  await logAudit(actor.id, 'pin_set', 'auth', actor.id, {})
  return { success: true }
}

// ── Reset (staff management) ───────────────────────────────────────────────

/** Clear someone's PIN — after they forgot it or it locked. The admin never sees a PIN. */
export async function resetStaffPin(profileId: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')
  if (await isPinSession()) return { success: false, error: 'Sign in with your password to change staff accounts.' }
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return { success: false, error: 'Unknown staff member' }
  const { data, error } = await createServiceClient().from('staff_pins').delete()
    .eq('profile_id', profileId).eq('tenant_id', actor.tenant_id).select('profile_id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'This person has no PIN to reset.' }
  await logAudit(actor.id, 'pin_reset', 'staff', profileId, {})
  return { success: true }
}

/** Which staff have a PIN, and which are locked — for the staff list. */
export async function listPinStatus(): Promise<Record<string, 'set' | 'locked'>> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:read')
  const { data } = await createServiceClient().from('staff_pins').select('profile_id, locked_at').eq('tenant_id', actor.tenant_id)
  return Object.fromEntries((data ?? []).map((p) => [p.profile_id as string, p.locked_at ? 'locked' : 'set']))
}

// ── Locking ────────────────────────────────────────────────────────────────

/** Sign out here — the idle timer and the "Switch user" button. */
export async function signOutHere(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  await markPinSession(false)
}

/** Whether this browser is an approved counter (for the shell's Switch user button and idle lock). */
export async function isSharedCounter(): Promise<boolean> {
  return !!(await readDevice())
}
