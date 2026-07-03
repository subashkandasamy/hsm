import { createClient } from './supabase/server'
import { getCachedUser } from './supabase/cached-user'
import type { Role } from './types'

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
