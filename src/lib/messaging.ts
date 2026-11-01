import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { createTtlCache } from '@/lib/ttlCache'

// One platform-wide row, identical for every tenant and every user, which
// changes once (when the provider accounts go live). React's cache() deduped it
// per request, so it still cost a round trip on every dashboard navigation
// (F-19). Five minutes across requests is generous for a switch that flips
// once, and the request-level cache() stays so a single render never asks
// twice.
const switchCache = createTtlCache<boolean>({ ttlMs: 5 * 60 * 1000, max: 4 })

// Global platform switch: WhatsApp/SMS features are OFF until the messaging
// provider accounts are live (post company registration).
export const isMessagingEnabled = cache(async (): Promise<boolean> => {
  const hit = switchCache.get('messaging_enabled')
  if (hit !== undefined) return hit
  try {
    const svc = createServiceClient()
    const { data } = await svc.from('platform_settings').select('value').eq('key', 'messaging_enabled').maybeSingle()
    const on = data?.value === 'true'
    switchCache.set('messaging_enabled', on)
    return on
  } catch {
    // Not cached: a transient failure must not pin the switch off for 5 minutes.
    return false
  }
})
