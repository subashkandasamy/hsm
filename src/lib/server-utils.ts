import { createClient } from './supabase/server'
import type { Role } from './types'

export async function getActorProfile(): Promise<{ id: string; role: Role }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('PROFILE_NOT_FOUND')
  return profile as { id: string; role: Role }
}
