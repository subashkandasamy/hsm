import { cache } from 'react'
import { headers } from 'next/headers'
import { planHasModule, type PlanKey, type TenantStatus } from '@/lib/plans'
import { createClient } from './supabase/server'
import { getCachedUser } from './supabase/cached-user'
import type { Role } from './types'

// Throws if the tenant is in read-only mode (trial ended or subscription lapsed).
// The proxy stamps x-tenant-readonly on every request so no extra DB query is needed.
// Call this at the top of every mutation server action.
export async function requireWriteAccess(): Promise<void> {
  const h = await headers()
  if (h.get('x-tenant-readonly') === '1') {
    throw new Error('READONLY: Your subscription has ended. Renew to make changes.')
  }
}

/** True when the tenant is in read-only mode (expired trial / lapsed subscription). */
export async function isReadOnlyRequest(): Promise<boolean> {
  const h = await headers()
  return h.get('x-tenant-readonly') === '1'
}

/** Whether the current tenant's plan includes a module (trial includes everything). */
export async function hasModule(moduleKey: string): Promise<boolean> {
  const h = await headers()
  // No tenant headers (non-tenant context) — don't block.
  if (!h.get('x-tenant-id')) return true
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
