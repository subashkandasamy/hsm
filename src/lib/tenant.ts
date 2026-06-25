import { headers } from 'next/headers'
import type { TenantContext } from './types'

// Read the tenant context injected by middleware via request headers.
// Falls back to a dev sentinel when running on localhost (no subdomain).
export async function getTenantContext(): Promise<TenantContext | null> {
  const hdrs = await headers()
  const id     = hdrs.get('x-tenant-id')
  const slug   = hdrs.get('x-tenant-slug')
  const name   = hdrs.get('x-tenant-name')
  const status = hdrs.get('x-tenant-status')
  const plan   = hdrs.get('x-tenant-plan')

  if (!id || !slug || !name) return null

  return {
    id,
    slug,
    name,
    status: (status ?? 'active') as TenantContext['status'],
    plan: (plan ?? 'starter') as TenantContext['plan'],
  }
}

// Returns the tenant_id string; throws if not resolvable.
// Server actions call this to get the tenant_id for inserting new rows.
export async function requireTenantId(): Promise<string> {
  const ctx = await getTenantContext()
  if (ctx) return ctx.id

  // Localhost dev: fall back to the default seed tenant
  if (process.env.NODE_ENV === 'development') {
    return '00000000-0000-0000-0000-000000000001'
  }

  throw new Error('TENANT_NOT_RESOLVED')
}

export const RESERVED_SLUGS = new Set([
  'admin', 'app', 'api', 'www', 'platform', 'static', 'assets', 'default',
])

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug) && !RESERVED_SLUGS.has(slug)
}
