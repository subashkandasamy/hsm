'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getActorProfile } from '@/lib/server-utils'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import type { TenantProfile } from '@/lib/types'

export async function getTenantProfile(): Promise<TenantProfile | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenant_profiles')
    .select('*')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()
  return data as TenantProfile | null
}

type ProfileInput = Omit<TenantProfile, 'tenant_id' | 'updated_at' | 'logo_url'>

export async function upsertTenantProfile(
  input: ProfileInput
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')

  const supabase = await createClient()
  const { error } = await supabase.from('tenant_profiles').upsert(
    { ...input, tenant_id: actor.tenant_id, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id' }
  )
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'tenant_profile', actor.tenant_id, {})
  return { success: true }
}

// ── Hospital code (document-number prefix) ────────────────────────────────────
// Mirrors the SQL tenant_doc_prefix(): sanitise to A-Z0-9, uppercase, and fall
// back to the slug when no code is set. Keep this in sync with migration 0128.
function computePrefix(code: string | null, slug: string): string {
  const src = (code && code.trim()) ? code : slug
  const cleaned = src.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return cleaned || 'HOSP'
}

export async function getTenantCode(): Promise<{ code: string | null; slug: string; prefix: string }> {
  const actor = await getActorProfile()
  const svc = createServiceClient()
  const { data } = await svc.from('tenants').select('code, slug').eq('id', actor.tenant_id).maybeSingle()
  const code = (data?.code as string | null) ?? null
  const slug = (data?.slug as string) ?? ''
  return { code, slug, prefix: computePrefix(code, slug) }
}

export async function setTenantCode(
  rawCode: string
): Promise<{ success: true; prefix: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')

  const code = rawCode.trim().toUpperCase()
  // Empty clears it → generators fall back to the slug.
  if (code && !/^[A-Z0-9]{2,8}$/.test(code)) {
    return { success: false, error: 'Code must be 2–8 letters or digits (A–Z, 0–9), no spaces.' }
  }

  const svc = createServiceClient()

  // Uniqueness must be on the EFFECTIVE prefix, not the raw code — otherwise a
  // code could collide with another tenant's slug-derived fallback (e.g. code
  // "CITY" vs a tenant whose slug is "city" with no code set). Compare the prefix
  // this change would produce against every other tenant's effective prefix.
  // (The DB unique index on code is a backstop for the raw code-vs-code case.)
  const { data: allTenants } = await svc.from('tenants').select('id, code, slug')
  const self = (allTenants ?? []).find((t) => t.id === actor.tenant_id)
  const candidate = computePrefix(code || null, (self?.slug as string) ?? '')
  const clash = (allTenants ?? []).find(
    (t) => t.id !== actor.tenant_id && computePrefix(t.code as string | null, (t.slug as string) ?? '') === candidate
  )
  if (clash) {
    return { success: false, error: `Prefix “${candidate}” is already used by another hospital — pick a different code.` }
  }

  const { data: tenant, error } = await svc
    .from('tenants').update({ code: code || null }).eq('id', actor.tenant_id).select('code, slug').single()
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'tenant_code', actor.tenant_id, { code: code || null })
  return { success: true, prefix: computePrefix((tenant?.code as string | null) ?? null, (tenant?.slug as string) ?? '') }
}

// ── Patient app directory opt-in ──────────────────────────────────────────────
export async function getDirectoryListing(): Promise<{ listed: boolean; city: string | null }> {
  const actor = await getActorProfile()
  const svc = createServiceClient()
  const { data } = await svc.from('tenants').select('directory_listed, city').eq('id', actor.tenant_id).maybeSingle()
  return { listed: !!data?.directory_listed, city: (data?.city as string | null) ?? null }
}

export async function setDirectoryListing(
  input: { listed: boolean; city?: string | null }
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  // Service role: the tenants row isn't tenant-user-writable via RLS.
  const svc = createServiceClient()
  const { error } = await svc.from('tenants')
    .update({ directory_listed: input.listed, city: input.city?.trim() || null })
    .eq('id', actor.tenant_id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'tenant_directory', actor.tenant_id, { listed: input.listed })
  return { success: true }
}

export async function uploadTenantLogo(
  formData: FormData
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { success: false, error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { success: false, error: 'Logo must be under 2 MB' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return { success: false, error: 'Only PNG, JPG, or WebP allowed' }
  }

  const service = createServiceClient()

  // Remove all old logo files for this tenant before uploading
  await service.storage.from('tenant-logos').remove([
    `${actor.tenant_id}/logo.png`,
    `${actor.tenant_id}/logo.jpg`,
    `${actor.tenant_id}/logo.jpeg`,
    `${actor.tenant_id}/logo.webp`,
  ])

  const path = `${actor.tenant_id}/logo.${ext}`
  const bytes = await file.arrayBuffer()
  const { error: upErr } = await service.storage
    .from('tenant-logos')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (upErr) return { success: false, error: upErr.message }

  const { data: urlData } = service.storage.from('tenant-logos').getPublicUrl(path)
  const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // Persist logo_url in tenant_profiles
  const supabase = await createClient()
  await supabase.from('tenant_profiles').upsert(
    { tenant_id: actor.tenant_id, logo_url: logoUrl, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id' }
  )

  return { success: true, url: logoUrl }
}
