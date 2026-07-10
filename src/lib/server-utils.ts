import { headers } from 'next/headers'
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

export async function getActorProfile(): Promise<{ id: string; role: Role; tenant_id: string }> {
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
}
