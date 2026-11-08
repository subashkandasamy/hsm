import { cache } from 'react'
import { headers } from 'next/headers'
import { planHasModule, type PlanKey, type TenantStatus } from '@/lib/plans'
import { createClient } from './supabase/server'
import { getCachedUser } from './supabase/cached-user'
import type { Permission, Role } from './types'
import { hasPermission, registerGrantResolver } from './rbac'
import { permissionsFromGroups } from './access'

/**
 * Is this request missing its tenant headers, and is that legitimate?
 *
 * proxy.ts stamps x-tenant-* in exactly one place, inside the tenant-subdomain
 * branch, so they are absent on every other host. These three helpers used to
 * read "absent" as "allow": requireWriteAccess only threw on an explicit '1',
 * and hasModule opened with `if (!x-tenant-id) return true`, commented
 * "non-tenant context — don't block". Combined with F-12 that meant a lapsed or
 * Starter hospital reaching the app by an unrecognised hostname had neither
 * restriction.
 *
 * The comment described a caller that does not exist. Every caller of these
 * three is a server action under src/app/actions, plus setup.ts using hasModule
 * to decide which checklist rows to show. Nothing headless calls them — the
 * nightly cron and the /api/device/* routes use tenantHasModule() in
 * lib/tenantModule.ts, which reads the plan from the database because it has no
 * headers to read. The patient portal (my.*), the partner portal and the
 * platform-admin panel are served from hosts that never stamp these headers,
 * and none of their actions call any of these three — checked, not assumed.
 *
 * So absence can fail closed. Bare-localhost development is the one exemption,
 * gated on NODE_ENV as well as the hostname so it cannot become a production
 * bypass — the same test the dashboard layout uses.
 */
async function noTenantContext(): Promise<{ missing: boolean; devExempt: boolean }> {
  const h = await headers()
  if (h.get('x-tenant-id')) return { missing: false, devExempt: false }
  const host = (h.get('host') ?? '').split(':')[0]
  return {
    missing: true,
    devExempt: process.env.NODE_ENV === 'development' && host === 'localhost',
  }
}

// Throws if the tenant is in read-only mode (trial ended or subscription lapsed).
// The proxy stamps x-tenant-readonly on every request so no extra DB query is needed.
// Call this at the top of every mutation server action.
export async function requireWriteAccess(): Promise<void> {
  const h = await headers()
  if (h.get('x-tenant-readonly') === '1') {
    throw new Error('READONLY: Your subscription has ended. Renew to make changes.')
  }
  const { missing, devExempt } = await noTenantContext()
  if (missing && !devExempt) {
    throw new Error('NOTENANT: This address does not identify a hospital. Sign in from your hospital’s own web address.')
  }
}

/** True when the tenant is in read-only mode (expired trial / lapsed subscription). */
export async function isReadOnlyRequest(): Promise<boolean> {
  const h = await headers()
  if (h.get('x-tenant-readonly') === '1') return true
  // No hospital in context: treat as read-only rather than writable.
  const { missing, devExempt } = await noTenantContext()
  return missing && !devExempt
}

/** Whether the current tenant's plan includes a module (trial includes everything). */
export async function hasModule(moduleKey: string): Promise<boolean> {
  const { missing, devExempt } = await noTenantContext()
  if (missing) return devExempt
  const h = await headers()
  const plan = (h.get('x-tenant-plan') ?? 'starter') as PlanKey
  const status = (h.get('x-tenant-status') ?? 'active') as TenantStatus
  return planHasModule(plan, status, moduleKey)
}

/**
 * Blocks a server action when the tenant's plan doesn't include the module.
 * The proxy only hides the pages; this stops the actions themselves — e.g. a
 * hospital that moved to Starter after its trial can't act on IPD patients
 * admitted during the trial until it upgrades.
 */
export async function requireModule(moduleKey: string): Promise<void> {
  if (!(await hasModule(moduleKey))) {
    throw new Error('PLAN: This feature is not included in your plan. Upgrade to Growth to use it.')
  }
}

// Cached for the request: several actions (and every permission check) ask for
// the actor, and each lookup was its own round trip to the database.
const actorProfile = cache(async (): Promise<{ id: string; role: Role; tenant_id: string }> => {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('PROFILE_NOT_FOUND')
  return profile as { id: string; role: Role; tenant_id: string }
})

export async function getActorProfile(): Promise<{ id: string; role: Role; tenant_id: string }> {
  return actorProfile()
}

/**
 * What an admin has added to the caller's role (role_access_grants, 0271), as
 * permissions. Cached for the request. Empty when nothing is granted — and when
 * the table cannot be read (migration not applied), which is the behaviour
 * before grants existed rather than an outage.
 */
const actorGrants = cache(async (): Promise<Permission[]> => {
  const actor = await actorProfile()
  if (actor.role === 'admin') return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('role_access_grants')
    .select('access_group')
    .eq('tenant_id', actor.tenant_id)
    .eq('role', actor.role)
  if (error) {
    console.error('[actorGrants] could not read role grants:', error.message)
    return []
  }
  return permissionsFromGroups((data ?? []).map((r) => r.access_group as string))
})

export async function getActorGrantedPermissions(): Promise<Permission[]> {
  return actorGrants()
}

/** For a server page or route: may the current person do this, counting what their role was granted? */
export async function actorCan(permission: Permission): Promise<boolean> {
  const actor = await actorProfile()
  return hasPermission(actor.role, permission, await actorGrants())
}

// requirePermission (rbac.ts) consults this when a role's built-in permissions
// say no. It only ever answers for the current request's own actor.
registerGrantResolver(async (role, permission) => {
  const actor = await actorProfile()
  if (actor.role !== role) return false
  return (await actorGrants()).includes(permission)
})
