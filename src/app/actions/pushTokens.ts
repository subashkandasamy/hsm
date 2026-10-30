'use server'

import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'

export async function upsertPushToken(
  token: string,
  platform: 'ios' | 'android'
): Promise<{ success: boolean }> {
  try {
    const actor = await getActorProfile()
    const supabase = await createClient()

    await supabase.from('device_push_tokens').upsert(
      {
        id: crypto.randomUUID(),
        tenant_id: actor.tenant_id,
        profile_id: actor.id,
        platform,
        push_token: token,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,push_token', ignoreDuplicates: false }
    )

    return { success: true }
  } catch {
    return { success: false }
  }
}

/**
 * Fetch all push tokens for a given profile.
 * Used server-side only (e.g. by the check-in push trigger).
 */
