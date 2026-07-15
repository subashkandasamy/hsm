'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { isValidSlug, RESERVED_SLUGS } from '@/lib/tenant'
import { seedLabCatalog, seedRadiologyCatalog } from '@/lib/catalogSeed'
import { sendWelcomeEmail } from '@/lib/email'
import { z } from 'zod'

// Map from user-facing department choice to clinical_template
const DEPT_TEMPLATE_MAP: Record<string, 'dental' | 'ophthalmology' | 'general'> = {
  'Dental':        'dental',
  'Eye Care':      'ophthalmology',
}

// All offered starter departments
const ALL_OFFERED_DEPTS = [
  'General Medicine', 'Dental', 'Eye Care', 'Paediatrics',
  'Gynaecology', 'Orthopaedics', 'Surgery', 'ENT',
]

// Bump when the Terms/Privacy content materially changes.
// (Not exported — a 'use server' module may only export async functions.)
const TERMS_VERSION = '2026-07-12'

const SignupSchema = z.object({
  hospitalName:   z.string().min(2, 'Hospital name must be at least 2 characters').max(200),
  slug:           z.string().min(3).max(63).refine(isValidSlug, {
    message: 'Slug must be lowercase letters, numbers, hyphens only (3-63 chars) and not reserved',
  }),
  adminName:      z.string().min(2, 'Admin name required').max(200),
  adminEmail:     z.string().email('Valid email required'),
  adminPhone:     z.string().optional(),
  password:       z.string().min(8, 'Password must be at least 8 characters'),
  plan:           z.enum(['starter', 'growth']).default('starter'),
  departments:    z.array(z.string()).optional(), // selected starting departments
  acceptedTerms:  z.boolean().refine((v) => v === true, {
    message: 'You must accept the Terms of Service and Privacy Policy to continue.',
  }),
})

export type SignupResult =
  | { success: true; tenantId: string; slug: string; loginUrl: string | null }
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

// Look up a hospital by its subdomain slug so returning users can find their
// login page from the apex site. Returns the stable subdomain login URL.
export async function findHospitalLoginUrl(
  input: string
): Promise<{ found: true; loginUrl: string; name: string } | { found: false }> {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.uyirly\.com.*$/, '')
    .replace(/[^a-z0-9-]/g, '')

  if (!slug || slug.length < 3) return { found: false }

  const service = createServiceClient()
  const { data } = await service
    .from('tenants')
    .select('slug, name')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) return { found: false }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  return { found: true, loginUrl: `https://${data.slug}.${rootDomain}/login`, name: data.name }
}

const DEFAULT_DEPARTMENTS = [
  'General Medicine', 'Surgery', 'Paediatrics', 'Gynaecology',
  'Orthopaedics', 'ENT', 'Ophthalmology', 'Dermatology',
  'Radiology', 'Pathology / Laboratory', 'Pharmacy', 'Emergency',
]

// Display label → DB department name mapping
const DEPT_DISPLAY_TO_DB: Record<string, string> = {
  'Eye Care': 'Ophthalmology',
}

export async function signupHospital(input: Record<string, unknown>): Promise<SignupResult> {
  const parsed = SignupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { hospitalName, slug, adminName, adminEmail, adminPhone, password, plan, departments: chosenDepts } = parsed.data

  const avail = await checkSlugAvailable(slug)
  if (!avail.available) return { success: false, error: avail.reason ?? 'Slug unavailable' }

  const service = createServiceClient()
  const tenantId = crypto.randomUUID()
  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Create tenant row (records proof of terms acceptance)
  const { error: tenantErr } = await service.from('tenants').insert({
    id: tenantId, name: hospitalName, slug,
    status: 'trial', plan, trial_ends_at: trialEnd,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
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

  // 3. Create the admin profile
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

  // 4. Seed departments — use chosen ones if provided, else fall back to defaults
  const deptsToSeed: { name: string; clinical_template: string }[] =
    (chosenDepts && chosenDepts.length > 0)
      ? chosenDepts.map((displayName) => {
          const dbName = DEPT_DISPLAY_TO_DB[displayName] ?? displayName
          const template = DEPT_TEMPLATE_MAP[displayName] ?? 'general'
          return { name: dbName, clinical_template: template }
        })
      : DEFAULT_DEPARTMENTS.map((name) => ({ name, clinical_template: 'general' }))

  const deptRows = deptsToSeed.map((d) => ({
    id: crypto.randomUUID(),
    name: d.name,
    clinical_template: d.clinical_template,
    tenant_id: tenantId,
  }))
  await service.from('departments').insert(deptRows)

  // 5. Seed default notification templates
  const tplRows = [
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'appointment_reminder', channel: 'whatsapp', body_preview: 'Hi {{1}}, your appointment is on {{2}} at {{3}}.', is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'bill_ready',           channel: 'whatsapp', body_preview: 'Hi {{1}}, your bill {{2}} for ₹{{3}} is ready. {{4}}', is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'prescription_ready',   channel: 'whatsapp', body_preview: 'Hi {{1}}, your prescription from Dr {{2}} is ready. {{3}}', is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, key: 'lab_result_ready',     channel: 'whatsapp', body_preview: 'Hi {{1}}, your lab results are ready. {{2}}', is_active: true },
  ]
  await service.from('notification_templates').insert(tplRows)

  // 5b. Seed default nursing shifts (Morning/Night active, Evening off — configurable later)
  const shiftRows = [
    { id: crypto.randomUUID(), tenant_id: tenantId, code: 'morning', label: 'Morning', start_time: '07:00', end_time: '19:00', crosses_midnight: false, sort_order: 1, is_active: true },
    { id: crypto.randomUUID(), tenant_id: tenantId, code: 'evening', label: 'Evening', start_time: '14:00', end_time: '21:00', crosses_midnight: false, sort_order: 2, is_active: false },
    { id: crypto.randomUUID(), tenant_id: tenantId, code: 'night',   label: 'Night',   start_time: '19:00', end_time: '07:00', crosses_midnight: true,  sort_order: 3, is_active: true },
  ]
  await service.from('shift_definitions').insert(shiftRows)

  // 5c. Seed the standard Indian TPA list (tenant can prune/add its own)
  const tpaNames = [
    'Medi Assist', 'Paramount Health Services', 'MDIndia Health Insurance TPA',
    'Health India TPA', 'Vidal Health TPA', 'Family Health Plan (FHPL)',
    'Heritage Health TPA', 'Raksha Health Insurance TPA', 'Ericson TPA',
    'Good Health TPA', 'Vipul MedCorp TPA', 'Safeway TPA',
    'East West Assist TPA', 'Park Mediclaim TPA', 'Genins India TPA',
  ]
  await service.from('insurance_tpas').insert(
    tpaNames.map((name) => ({ id: crypto.randomUUID(), tenant_id: tenantId, name }))
  )

  // 6. Seed default lab & radiology catalogs (inactive, ₹1 each — admin enables & prices)
  await Promise.all([
    seedLabCatalog(tenantId),
    seedRadiologyCatalog(tenantId),
  ])

  // 7. Audit log
  await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: profileId,
    action: 'create',
    entity: 'tenant',
    entity_id: tenantId,
    meta: { hospital_name: hospitalName, slug, plan },
    tenant_id: tenantId,
  })

  // 8. Generate a magic link so the new admin lands on their subdomain already signed in.
  //    The link points to /auth/callback on the new subdomain, which exchanges the token
  //    for a proper cookie session before redirecting to /dashboard?welcome=1.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const redirectTo = `https://${slug}.${rootDomain}/auth/callback`
  let loginUrl: string | null = null

  try {
    const { data: linkData } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: adminEmail,
      options: { redirectTo },
    })
    loginUrl = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null
  } catch {
    // Non-fatal: fall back to showing the subdomain link manually
  }

  // 9. Send the welcome email with the stable subdomain login URL + username.
  //    Best-effort — sendWelcomeEmail never throws, so signup won't fail if email does.
  await sendWelcomeEmail({
    to:           adminEmail,
    hospitalName,
    loginUrl:     `https://${slug}.${rootDomain}/login`,
    username:     adminEmail,
  })

  return { success: true, tenantId, slug, loginUrl }
}
