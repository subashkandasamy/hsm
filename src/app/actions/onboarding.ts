'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { isValidSlug, RESERVED_SLUGS } from '@/lib/tenant'
import { z } from 'zod'

const SignupSchema = z.object({
  hospitalName: z.string().min(2, 'Hospital name must be at least 2 characters').max(200),
  slug:         z.string().min(3).max(63).refine(isValidSlug, {
    message: 'Slug must be lowercase letters, numbers, hyphens only (3-63 chars) and not reserved',
  }),
  adminName:    z.string().min(2, 'Admin name required').max(200),
  adminEmail:   z.string().email('Valid email required'),
  adminPhone:   z.string().optional(),
  password:     z.string().min(8, 'Password must be at least 8 characters'),
})

export type SignupResult =
  | { success: true; tenantId: string; slug: string }
  | { success: false; error: string }

export async function checkSlugAvailable(
  slug: string
): Promise<{ available: boolean; reason?: string }> {
  if (!slug || slug.length < 3) return { available: false, reason: 'Too short (min 3 characters)' }
  if (slug.length > 63)         return { available: false, reason: 'Too long (max 63 characters)' }
  if (!isValidSlug(slug))       return { available: false, reason: 'Invalid format or reserved name' }
  if (RESERVED_SLUGS.has(slug)) return { available: false, reason: 'That name is reserved' }

  const service = createServiceClient()
  const { data } = await service.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (data) return { available: false, reason: 'Already taken' }
  return { available: true }
}

const DEFAULT_DEPARTMENTS = [
  'General Medicine', 'Surgery', 'Paediatrics', 'Gynaecology',
  'Orthopaedics', 'ENT', 'Ophthalmology', 'Dermatology',
  'Radiology', 'Pathology / Laboratory', 'Pharmacy', 'Emergency',
]

export async function signupHospital(input: Record<string, unknown>): Promise<SignupResult> {
  const parsed = SignupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { hospitalName, slug, adminName, adminEmail, adminPhone, password } = parsed.data

  // Re-check slug availability atomically
  const avail = await checkSlugAvailable(slug)
  if (!avail.available) return { success: false, error: avail.reason ?? 'Slug unavailable' }

  const service = createServiceClient()
  const tenantId = crypto.randomUUID()
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Create tenant row
  const { error: tenantErr } = await service.from('tenants').insert({
    id: tenantId, name: hospitalName, slug,
    status: 'trial', plan: 'starter', trial_ends_at: trialEnd,
  })
  if (tenantErr) return { success: false, error: tenantErr.message }

  // 2. Create the Supabase auth user
  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: adminName },
  })
  if (authErr || !authData.user) {
    await service.from('tenants').delete().eq('id', tenantId)
    return { success: false, error: authErr?.message ?? 'Failed to create user' }
  }

  // 3. Create the admin profile (service role bypasses RLS bootstrapping issue)
  const profileId = authData.user.id
  const { error: profileErr } = await service.from('profiles').insert({
    id: profileId,
    full_name: adminName,
    role: 'admin',
    phone: adminPhone ?? null,
    tenant_id: tenantId,
    is_active: true,
  })
  if (profileErr) {
    await service.auth.admin.deleteUser(profileId)
    await service.from('tenants').delete().eq('id', tenantId)
    return { success: false, error: profileErr.message }
  }

  // 4. Seed default departments for this tenant
  const deptRows = DEFAULT_DEPARTMENTS.map((name) => ({
    id: crypto.randomUUID(), name, tenant_id: tenantId,
  }))
  await service.from('departments').insert(deptRows)

  // 5. Seed default notification templates for this tenant
  const tplRows = [
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'appointment_reminder', channel: 'whatsapp', body_preview: 'Hi {{1}}, your appointment is on {{2}} at {{3}}.', is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'bill_ready',           channel: 'whatsapp', body_preview: 'Hi {{1}}, your bill {{2}} for ₹{{3}} is ready. {{4}}', is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'prescription_ready',   channel: 'whatsapp', body_preview: 'Hi {{1}}, your prescription from Dr {{2}} is ready. {{3}}', is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'lab_result_ready',     channel: 'whatsapp', body_preview: 'Hi {{1}}, your lab results are ready. {{2}}', is_active: true },
  ]
  await service.from('notification_templates').insert(tplRows)

  // Audit log using service role (no user session yet)
  await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: profileId,
    action: 'create',
    entity: 'tenant',
    entity_id: tenantId,
    meta: { hospital_name: hospitalName, slug, plan: 'starter' },
    tenant_id: tenantId,
  })

  return { success: true, tenantId, slug }
}
