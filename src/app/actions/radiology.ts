'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signViewerLink, VIEWER_LINK_TTL_SECONDS } from '@/lib/lab/viewerLink'
import { logAudit } from '@/lib/audit'
import { removeOrderFromBills } from '@/lib/billing/orderBilling'
import { createServiceBill } from '@/lib/billing/serviceBill'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { requireTenantId } from '@/lib/tenant'
import { isBillCashlessCovered, resolveServiceBill } from '@/lib/cashlessCover'
import { RadiologyCatalogSchema, RadiologyOrderSchema } from '@/lib/schemas'
import type { RadiologyOrder, RadiologyCatalog, RadiologyMaster } from '@/lib/types'

const IMAGE_BUCKET = 'radiology'
const SIGNED_URL_EXPIRY = 60 * 60 // 1 hour

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Catalog ----

export async function listRadiologyCatalog(modality?: string): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  let q = supabase.from('radiology_catalog').select('*').eq('is_active', true).order('name')
  if (modality) q = q.eq('modality', modality)
  const { data } = await q
  return (data ?? []) as RadiologyCatalog[]
}

export async function listAllRadiologyCatalog(): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_catalog').select('*').order('name')
  return (data ?? []) as RadiologyCatalog[]
}

export async function updateRadiologyTest(
  id: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_catalog').update(input).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'radiology_test', id, input)
  return { success: true }
}

export async function createRadiologyTest(
  input: Record<string, unknown>
): Promise<{ success: true; test: RadiologyCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  const parsed = RadiologyCatalogSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_catalog').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'radiology_test', id, { name: parsed.data.name })
  const { data: test } = await supabase.from('radiology_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as RadiologyCatalog }
}

// ---- Orders ----

export async function createRadiologyOrder(
  input: Record<string, unknown>
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const parsed = RadiologyOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, visit_id, test_id } = parsed.data
  const supabase = await createClient()

  const { data: test } = await supabase
    .from('radiology_catalog').select('price').eq('id', test_id).single()
  if (!test) return { success: false, error: 'Test not found' }

  const id = crypto.randomUUID()
  const priceSnapshot = test.price as number

  const { error } = await supabase.from('radiology_orders').insert({
    id, tenant_id: actor.tenant_id, patient_id, visit_id: visit_id ?? null, test_id,
    ordered_by: actor.id, price_snapshot: priceSnapshot,
    status: 'ordered', billing_status: 'unbilled',
  })
  if (error) return { success: false, error: error.message }

  // Bill the order immediately (OPD scans are paid before they are performed).
  if (priceSnapshot > 0) {
    const { data: testDetail } = await supabase
      .from('radiology_catalog').select('name').eq('id', test_id).single()
    const bill = await createServiceBill(supabase, {
      tenantId: actor.tenant_id, patientId: patient_id, actorId: actor.id, visitId: visit_id ?? null,
      billSource: 'radiology',
      lines: [{ source: 'radiology', ref_id: id, description: (testDetail?.name as string) ?? 'Radiology scan', qty: 1, unit_price: priceSnapshot }],
    })
    if ('error' in bill) console.error('[createRadiologyOrder] bill failed:', bill.error)
    else await supabase.from('radiology_orders').update({ billing_status: 'billed' }).eq('id', id)
  }

  await logAudit(actor.id, 'create', 'radiology_order', id, { patient_id, test_id })
  return { success: true, orderId: id }
}

export async function markPerformed(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:process')
  const supabase = await createClient()

  // Fetch order to distinguish IPD (has admission_id) from OPD
  const { data: order } = await supabase
    .from('radiology_orders')
    .select('id, admission_id, patient_id, tenant_id, price_snapshot, test:radiology_catalog(name)')
    .eq('id', orderId)
    .single()

  if (order?.admission_id) {
    // IPD path: NOT gated on payment. The charge was captured as a bill at order
    // time and settles into the combined bill at discharge, so an admitted patient
    // is never held back from their scan by a cash payment. (Only OPD cash is gated
    // below; cashless is exempt in both paths.)
    const { error } = await supabase
      .from('radiology_orders').update({ status: 'performed' })
      .eq('id', orderId).eq('status', 'ordered')
    if (error) return { success: false, error: error.message }

    await logAudit(actor.id, 'perform', 'radiology_order', orderId)
    return { success: true }
  }

  // OPD path: gate on payment before performing the scan
  const linkedBill = await resolveServiceBill(supabase, 'radiology', orderId)
  // Cashless-approved patients don't pay cash up front — an eligibility-approved
  // claim on this encounter lifts the payment gate.
  if (linkedBill && linkedBill.status !== 'paid' && !(await isBillCashlessCovered(supabase, linkedBill))) {
    return { success: false, error: 'Awaiting payment — please collect payment before performing this scan' }
  }

  const { error } = await supabase
    .from('radiology_orders').update({ status: 'performed' })
    .eq('id', orderId).eq('status', 'ordered')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'perform', 'radiology_order', orderId)
  return { success: true }
}

export async function uploadReport(
  orderId: string,
  report: string,
  imageUrl: string | null
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:process')
  const supabase = await createClient()
  // Writing a report no longer releases it. It waits for verifyRadiologyOrder,
  // and re-writing one withdraws any authorisation it already had.
  const { error } = await supabase.from('radiology_orders').update({
    report,
    image_url: imageUrl,
    status: 'performed',
    verified_by: null,
    verified_at: null,
  }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'report_draft', 'radiology_order', orderId)
  return { success: true }
}

/**
 * Authorise a radiology report for release. Until this happens the report is
 * not shown to the patient and will not print.
 */
export async function verifyRadiologyOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:verify')
  const supabase = await createClient()

  const { data: cur } = await supabase
    .from('radiology_orders').select('status, report').eq('id', orderId).single()
  if (!cur?.report?.trim()) return { success: false, error: 'There is no report to verify yet' }

  const { error } = await supabase.from('radiology_orders').update({
    status: 'reported',
    verified_by: actor.id,
    verified_at: new Date().toISOString(),
    reported_at: new Date().toISOString(),
  }).eq('id', orderId).eq('status', 'performed')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'verify', 'radiology_order', orderId)
  return { success: true }
}

// Returns a signed upload URL so the report modal can upload the scan image
// directly to the private `radiology` bucket. We store the returned filePath in
// radiology_orders.image_url (a storage path, not a public URL) and sign it for
// reading on demand — the same PHI-safe pattern as patient documents.
export async function getRadiologyImageUploadUrl(
  orderId: string,
  filename: string,
): Promise<{ success: true; signedUrl: string; filePath: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:process')

  const tenantId = await requireTenantId()
  const ext = filename.split('.').pop() ?? 'bin'
  const filePath = `tenants/${tenantId}/radiology/${orderId}/${crypto.randomUUID()}.${ext}`

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from(IMAGE_BUCKET)
    .createSignedUploadUrl(filePath)

  if (error || !data) return { success: false, error: error?.message ?? 'Failed to create upload URL' }
  return { success: true, signedUrl: data.signedUrl, filePath }
}

// Returns a short-lived signed read URL for a radiology order's scan image, or
// null if there is no image. Back-compatible: legacy rows may hold a full
// http(s) URL (older public-URL scheme) — those are returned as-is.
export async function getRadiologyImageUrl(
  orderId: string,
): Promise<{ url: string | null; isPdf: boolean }> {
  const supabase = await createClient()
  const { data: order } = await supabase
    .from('radiology_orders').select('image_url').eq('id', orderId).maybeSingle()
  const stored = (order?.image_url as string | null) ?? null
  if (!stored) return { url: null, isPdf: false }

  const isPdf = stored.toLowerCase().split('?')[0].endsWith('.pdf')
  if (/^https?:\/\//i.test(stored)) return { url: stored, isPdf }

  const service = createServiceClient()
  const { data } = await service.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(stored, SIGNED_URL_EXPIRY)
  return { url: data?.signedUrl ?? null, isPdf }
}

export async function cancelRadiologyOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const supabase = await createClient()
  const { error } = await supabase
    .from('radiology_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }

  // Take the order off its bill(s) — only its own lines, never other charges.
  const billing = await removeOrderFromBills(supabase, 'radiology', orderId)

  await logAudit(actor.id, 'cancel', 'radiology_order', orderId, { billing })
  return { success: true }
}

export async function getRadiologyOrder(id: string): Promise<RadiologyOrder | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_orders')
    .select('*, patient:patients(id,full_name,uhid,gender), test:radiology_catalog(*), orderer:profiles!ordered_by(id,full_name)')
    .eq('id', id).single()
  return data as unknown as RadiologyOrder | null
}

export async function listRadiologyOrders(filters?: {
  status?: string; visitId?: string; patientId?: string; modality?: string
}): Promise<RadiologyOrder[]> {
  const supabase = await createClient()
  let q = supabase
    .from('radiology_orders')
    .select('*, patient:patients(id,full_name,uhid,gender), test:radiology_catalog(*), orderer:profiles!ordered_by(id,full_name)')
    .order('ordered_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.visitId) q = q.eq('visit_id', filters.visitId)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as RadiologyOrder[]
}

// ---- Master Catalog ----

export async function listRadiologyMaster(): Promise<RadiologyMaster[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_master')
    .select('*')
    .eq('is_active', true)
    .order('modality')
    .order('body_part')
    .order('name')
  return (data ?? []) as RadiologyMaster[]
}

export async function activateRadiologyFromMaster(
  masterTestId: string,
  price: number,
): Promise<{ success: true; test: RadiologyCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  if (!(price > 0)) return { success: false, error: 'Enter a price greater than 0' }
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('radiology_catalog')
    .select('id')
    .eq('radiology_master_id', masterTestId)
    .maybeSingle()
  if (existing) return { success: false, error: 'Already in your catalog' }

  const { data: master } = await supabase
    .from('radiology_master')
    .select('*')
    .eq('id', masterTestId)
    .single()
  if (!master) return { success: false, error: 'Procedure not found in master catalog' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('radiology_catalog').insert({
    id,
    tenant_id: actor.tenant_id,
    name: master.name as string,
    modality: master.modality as string,
    body_part: (master.body_part as string) || 'General',
    price,
    is_active: true,
    radiology_master_id: masterTestId,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'activate', 'radiology_test', id, { name: master.name })
  const { data: test } = await supabase.from('radiology_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as RadiologyCatalog }
}

export interface StudyLink {
  /** Opened in a new tab, on the hospital's own network. */
  url: string
  images: number
  series: number
  modality: string | null
}

/**
 * Where the scan images for an order can be looked at.
 *
 * The images live on the computer the connector runs on, not here — a CT study
 * is hundreds of megabytes and a busy hospital makes gigabytes a day. So this
 * returns a link to that computer rather than the pictures.
 *
 * Which means it only works inside the hospital, and returns null from
 * anywhere else. That is a deliberate limit of storing images locally, not an
 * oversight: a doctor at home and the patient portal both see nothing until
 * there is a cloud copy of something.
 *
 * The page is opened as a normal link rather than loaded into ours. Since
 * Chrome 142 a public site may not even ask a private address for a
 * subresource without the viewer granting a permission first, whereas plain
 * navigation is untouched by those rules — so this way nobody is prompted.
 */
export async function getStudyViewerLink(orderId: string): Promise<StudyLink | null> {
  const supabase = await createClient()

  const { data: study } = await supabase
    .from('radiology_studies')
    .select('study_instance_uid, instance_count, series_count, modality, status')
    .eq('radiology_order_id', orderId)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!study?.study_instance_uid) return null

  // Whichever lab computer received it told us its address when it last
  // checked in. Without one there is nothing to link to.
  const { data: connector } = await supabase
    .from('connectors')
    .select('lan_ip, status, viewer_key')
    .not('lan_ip', 'is', null)
    .neq('status', 'revoked')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!connector?.lan_ip) return null

  // Signed and time-limited. Without this anyone on the hospital network who
  // had the study's identifier could read a patient's scans — and a study id
  // is permanent, so once it reaches a browser history or a chat message it
  // would be a key that never expires.
  const studyUid = study.study_instance_uid as string
  const expiresAt = Math.floor(Date.now() / 1000) + VIEWER_LINK_TTL_SECONDS
  const signature = signViewerLink((connector.viewer_key as string) ?? '', studyUid, expiresAt)

  return {
    // 5152, not the status page on 5151: the status page is bound to loopback
    // and a doctor is at their own desk, not beside the connector.
    url: `http://${connector.lan_ip}:5152/study/${encodeURIComponent(studyUid)}`
       + `?e=${expiresAt}&s=${signature}`,
    images: Number(study.instance_count ?? 0),
    series: Number(study.series_count ?? 0),
    modality: (study.modality as string | null) ?? null,
  }
}
