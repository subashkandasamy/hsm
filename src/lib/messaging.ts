import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/service'

// Global platform switch: WhatsApp/SMS features are OFF until the messaging
// provider accounts are live (post company registration). Cached per request.
export const isMessagingEnabled = cache(async (): Promise<boolean> => {
  try {
    const svc = createServiceClient()
    const { data } = await svc.from('platform_settings').select('value').eq('key', 'messaging_enabled').maybeSingle()
    return data?.value === 'true'
  } catch {
    return false
  }
})
