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
