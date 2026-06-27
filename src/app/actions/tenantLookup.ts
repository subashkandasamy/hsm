'use server'

import { createServiceClient } from '@/lib/supabase/service'

/**
 * Public action — checks whether a tenant slug exists and is active.
 * Returns only ok/not-found; never exposes tenant metadata (enumeration-safe).
 */
export async function checkTenantExists(
  slug: string
): Promise<{ found: true; name: string } | { found: false }> {
  const clean = slug
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')  // strip protocol if user typed full URL
    .replace(/\.uyirly\.com.*$/, '')  // strip domain suffix if pasted
    .replace(/[^a-z0-9-]/g, '')  // only slug-safe chars

  if (!clean || clean.length < 2) return { found: false }

  const service = createServiceClient()
  const { data } = await service
    .from('tenants')
    .select('name, status')
    .eq('slug', clean)
    .single()

  if (!data || data.status === 'cancelled') return { found: false }
  return { found: true, name: data.name }
}
