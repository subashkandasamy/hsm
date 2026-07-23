'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { autoIpdBill } from '@/lib/ipdBilling'
import { BloodDonorSchema, BloodUnitSchema, BloodRequestSchema, BloodComponentChargeSchema, BloodScreeningSchema, BloodCrossmatchSchema, BloodTransfusionSchema, BloodReactionSchema, BloodDonationCampSchema, BloodSeparationSchema } from '@/lib/schemas'
import { compatibleDonorGroups, isCompatible } from '@/lib/bloodCompat'
import type { BloodDonor, BloodUnit, BloodRequest, BloodInventoryCell, BloodGroup, BloodComponent, BloodComponentCharge, BloodIssuedUnit, BloodDonationCamp } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const COMPONENT_LABELS: Record<BloodComponent, string> = {
  whole: 'Whole Blood', prbc: 'Packed Red Cells', plasma: 'Plasma (FFP)', platelets: 'Platelets',
}

// ---- Component processing charges (per-tenant config) ----

export async function listComponentCharges(): Promise<BloodComponentCharge[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('blood_component_charges').select('*').order('component')
  return (data ?? []) as BloodComponentCharge[]
}

export async function upsertComponentCharge(
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodComponentChargeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('blood_component_charges').upsert({
    tenant_id: actor.tenant_id,
    component: parsed.data.component,
    price: parsed.data.price,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,component' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'blood_component_charge', parsed.data.component, { price: parsed.data.price })
  return { success: true }
}

const BLOOD_GROUPS: BloodGroup[]     = ['A+','A-','B+','B-','AB+','AB-','O+','O-']
const BLOOD_COMPONENTS: BloodComponent[] = ['whole','prbc','plasma','platelets']

// ---- Donors ----

export async function addDonor(
  input: Record<string, unknown>
): Promise<{ success: true; donor: BloodDonor } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodDonorSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('blood_donors').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'blood_donor', id, { name: parsed.data.name })
  const { data: row } = await supabase.from('blood_donors').select('*').eq('id', id).single()
  return { success: true, donor: row as BloodDonor }
}

export async function listDonors(): Promise<BloodDonor[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('blood_donors').select('*').order('name')
  return (data ?? []) as BloodDonor[]
}

// ---- Blood Units ----

export async function addBloodUnit(
  input: Record<string, unknown>
): Promise<{ success: true; unit: BloodUnit } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodUnitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('blood_units').insert({
    id, tenant_id: actor.tenant_id, ...parsed.data,
    donor_id:     parsed.data.donor_id ?? null,
    collected_at: parsed.data.collected_at ?? null,
    status: 'available',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add_unit', 'blood_unit', id, {
    blood_group: parsed.data.blood_group, component: parsed.data.component,
  })
  const { data: row } = await supabase.from('blood_units').select('*').eq('id', id).single()
  return { success: true, unit: row as BloodUnit }
}

// Record TTI screening results for a unit. Passes only if every marker is
// non-reactive; a single reactive marker fails the unit (and blocks issue).
export async function recordScreening(
  unitId: string,
  input: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:screen')
  const parsed = BloodScreeningSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const markers = parsed.data
  const anyReactive = Object.values(markers).some((v) => v === 'reactive')
  const status = anyReactive ? 'failed' : 'passed'

  const supabase = await createClient()
  const { error } = await supabase.from('blood_units').update({
    ...markers,
    screening_status: status,
    screened_by: actor.id,
    screened_at: new Date().toISOString(),
    // A failed unit is taken out of stock immediately.
    ...(status === 'failed' ? { status: 'discarded' } : {}),
  }).eq('id', unitId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'screen', 'blood_unit', unitId, { screening_status: status })
  return { success: true }
}

export async function discardUnit(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('blood_units')
    .update({ status: 'discarded' }).eq('id', id).eq('status', 'available')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'discard', 'blood_unit', id)
  return { success: true }
}

export async function listUnits(filters?: {
  blood_group?: string; component?: string; status?: string
}): Promise<BloodUnit[]> {
  const supabase = await createClient()
  let q = supabase.from('blood_units')
    .select('*, donor:blood_donors(id, name)')
    .order('expiry', { ascending: true })
  if (filters?.blood_group) q = q.eq('blood_group', filters.blood_group)
  if (filters?.component)   q = q.eq('component', filters.component)
  if (filters?.status)      q = q.eq('status', filters.status)
  const { data } = await q.limit(500)
  return (data ?? []) as unknown as BloodUnit[]
}

// ---- Inventory ----

export async function getInventory(): Promise<BloodInventoryCell[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const in7   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const { data: units } = await supabase
    .from('blood_units')
    .select('blood_group, component, status, expiry')
    .in('status', ['available', 'expired'])

  const cells: BloodInventoryCell[] = []
  for (const bg of BLOOD_GROUPS) {
    for (const comp of BLOOD_COMPONENTS) {
      const matching = (units ?? []).filter(
        (u) => u.blood_group === bg && u.component === comp
      )
      cells.push({
        blood_group: bg,
        component:   comp,
        available:   matching.filter((u) => u.status === 'available' && u.expiry >= today).length,
        near_expiry: matching.filter((u) => u.status === 'available' && u.expiry >= today && u.expiry <= in7).length,
        expired:     matching.filter((u) => u.expiry < today).length,
      })
    }
  }
  return cells
}

export async function expireOldUnits(): Promise<{ expired: number }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase.from('blood_units')
    .update({ status: 'expired' })
    .eq('status', 'available')
    .lt('expiry', today)
    .select('id')
  if (error) return { expired: 0 }
  await logAudit(actor.id, 'expire_units', 'blood_unit', null, { count: data?.length ?? 0 })
  return { expired: data?.length ?? 0 }
}

// ---- Requests ----

export async function raiseRequest(
  input: Record<string, unknown>
): Promise<{ success: true; requestId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:request')
  const parsed = BloodRequestSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('blood_requests').insert({
    id, tenant_id: actor.tenant_id, ...parsed.data,
    notes:        parsed.data.notes ?? null,
    requested_by: actor.id,
    status:       'requested',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'raise_request', 'blood_request', id, {
    patient_id:  parsed.data.patient_id,
    blood_group: parsed.data.blood_group,
    component:   parsed.data.component,
  })
  return { success: true, requestId: id }
}

// Record a physical cross-match of a specific unit against the recipient's
// sample. Compatible only when the major cross-match is compatible AND the
// donor group is red-cell/plasma compatible with the recipient (allowing valid
// substitutions like O- to any recipient). A compatible cross-match reserves
// the unit and advances the request to cross_matched; the DB then permits issue.
export async function recordCrossMatch(
  requestId: string,
  unitId: string,
  input: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:issue')
  const parsed = BloodCrossmatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()

  const { data: req } = await supabase
    .from('blood_requests').select('blood_group, component, status').eq('id', requestId).single()
  if (!req) return { success: false, error: 'Request not found' }
  const { data: unit } = await supabase
    .from('blood_units').select('blood_group, component, status, screening_status, expiry').eq('id', unitId).single()
  if (!unit) return { success: false, error: 'Blood unit not found' }

  if (unit.component !== req.component) return { success: false, error: 'Component mismatch' }
  if (unit.screening_status !== 'passed') return { success: false, error: 'Unit is not screening-passed' }
  const groupCompatible = isCompatible(req.blood_group as BloodGroup, unit.blood_group as BloodGroup, req.component as BloodComponent)

  const compatible =
    groupCompatible &&
    parsed.data.major_result === 'compatible' &&
    parsed.data.minor_result !== 'incompatible'

  const { error: xmErr } = await supabase.from('blood_crossmatches').insert({
    tenant_id: actor.tenant_id,
    request_id: requestId,
    blood_unit_id: unitId,
    recipient_sample_no: parsed.data.recipient_sample_no ?? null,
    major_result: parsed.data.major_result,
    minor_result: parsed.data.minor_result ?? null,
    compatible,
    technician_id: actor.id,
  })
  if (xmErr) return { success: false, error: xmErr.message }

  if (compatible) {
    // Reserve the unit and advance the request
    await supabase.from('blood_units').update({ status: 'reserved' }).eq('id', unitId).eq('status', 'available')
    if (req.status === 'requested') {
      await supabase.from('blood_requests').update({
        status: 'cross_matched',
        recipient_sample_no: parsed.data.recipient_sample_no ?? null,
      }).eq('id', requestId)
    }
  }

  await logAudit(actor.id, 'cross_match', 'blood_request', requestId, { unit_id: unitId, compatible })
  return { success: true }
}

// Units eligible for cross-match: screening-passed, available, non-expired, of
// the requested component, whose group is compatible with the recipient.
export async function listCompatibleUnits(requestId: string): Promise<BloodUnit[]> {
  const supabase = await createClient()
  const { data: req } = await supabase
    .from('blood_requests').select('blood_group, component').eq('id', requestId).single()
  if (!req) return []
  const groups = compatibleDonorGroups(req.blood_group as BloodGroup, req.component as BloodComponent)
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('blood_units')
    .select('*, donor:blood_donors(id, name)')
    .eq('component', req.component)
    .eq('status', 'available')
    .eq('screening_status', 'passed')
    .in('blood_group', groups)
    .gte('expiry', today)
    .order('expiry', { ascending: true })
  return (data ?? []) as unknown as BloodUnit[]
}

// Units that have a compatible cross-match for this request and are still
// reserved/available + screening-passed + non-expired — ready to issue.
export async function listCrossMatchedUnits(requestId: string): Promise<BloodUnit[]> {
  const supabase = await createClient()
  const { data: xms } = await supabase
    .from('blood_crossmatches').select('blood_unit_id, compatible').eq('request_id', requestId)
  const unitIds = [...new Set((xms ?? []).filter((x) => x.compatible).map((x) => x.blood_unit_id as string))]
  if (!unitIds.length) return []
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('blood_units')
    .select('*, donor:blood_donors(id, name)')
    .in('id', unitIds)
    .in('status', ['reserved', 'available'])
    .eq('screening_status', 'passed')
    .gte('expiry', today)
    .order('expiry', { ascending: true })
  return (data ?? []) as unknown as BloodUnit[]
}

export async function cancelRequest(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:request')
  const supabase = await createClient()
  const { error } = await supabase.from('blood_requests')
    .update({ status: 'cancelled' }).eq('id', id).in('status', ['requested','cross_matched'])
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel_request', 'blood_request', id)
  return { success: true }
}

export async function listRequests(status?: string): Promise<BloodRequest[]> {
  const supabase = await createClient()
  let q = supabase.from('blood_requests').select(`
    *,
    patient:patients(id, full_name, uhid),
    requester:profiles(id, full_name)
  `).order('requested_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data } = await q.limit(200)
  return (data ?? []) as unknown as BloodRequest[]
}

// ---- Donation camps + component separation (Phase 5) ----

export async function listCamps(): Promise<BloodDonationCamp[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('blood_donation_camps').select('*').order('camp_date', { ascending: false })
  return (data ?? []) as BloodDonationCamp[]
}

export async function createCamp(
  input: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodDonationCampSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('blood_donation_camps').insert({
    tenant_id: actor.tenant_id, ...parsed.data, created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'blood_camp', parsed.data.name, {})
  return { success: true }
}

// Split a screened whole-blood unit into components. Each child inherits the
// parent's group/donor/camp and screening result (screening is done on the
// whole unit); the parent is marked 'separated' and consumed.
export async function separateComponents(
  wholeUnitId: string,
  input: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodSeparationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()

  const { data: unit } = await supabase.from('blood_units').select('*').eq('id', wholeUnitId).single()
  if (!unit) return { success: false, error: 'Unit not found' }
  if (unit.component !== 'whole') return { success: false, error: 'Only whole-blood units can be separated' }
  if (unit.status !== 'available') return { success: false, error: 'Unit must be available to separate' }
  if (unit.screening_status !== 'passed') return { success: false, error: 'Screen the unit before separating (children inherit screening)' }

  const children = parsed.data.components.map((comp) => ({
    tenant_id:        actor.tenant_id,
    blood_group:      unit.blood_group,
    component:        comp,
    donor_id:         unit.donor_id,
    camp_id:          unit.camp_id ?? null,
    parent_unit_id:   wholeUnitId,
    collected_at:     unit.collected_at,
    expiry:           unit.expiry,
    status:           'available',
    // Screening inherited from the parent whole-blood unit
    screening_status: 'passed',
    hiv: unit.hiv, hbsag: unit.hbsag, hcv: unit.hcv, syphilis: unit.syphilis, malaria: unit.malaria,
    screened_by: unit.screened_by, screened_at: unit.screened_at,
    bag_number: unit.bag_number ? `${unit.bag_number}-${comp.toUpperCase().slice(0, 3)}` : null,
    volume_ml: null,
  }))

  const { error: insErr } = await supabase.from('blood_units').insert(children)
  if (insErr) return { success: false, error: insErr.message }

  const { error: updErr } = await supabase.from('blood_units').update({ status: 'separated' }).eq('id', wholeUnitId)
  if (updErr) return { success: false, error: updErr.message }

  await logAudit(actor.id, 'separate', 'blood_unit', wholeUnitId, { components: parsed.data.components })
  return { success: true }
}

// ---- Transfusion (Phase 4) ----

// Issued units for a request, each with its transfusion record (if any) — for
// the bedside transfusion / reaction flow.
export async function listIssuedUnitsForRequest(requestId: string): Promise<BloodIssuedUnit[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blood_issues')
    .select(`id, blood_unit_id,
      unit:blood_units(blood_group, component, bag_number),
      transfusion:blood_transfusions(*, reactions:blood_transfusion_reactions(*))`)
    .eq('request_id', requestId)
    .order('issued_at', { ascending: true })
  return (data ?? []).map((r) => {
    const u = r.unit as unknown as { blood_group: BloodGroup; component: BloodComponent; bag_number: string | null } | null
    const tf = r.transfusion as unknown as BloodIssuedUnit['transfusion'][] | null
    return {
      id: r.id as string,
      blood_unit_id: r.blood_unit_id as string,
      blood_group: (u?.blood_group ?? 'O+') as BloodGroup,
      component: (u?.component ?? 'whole') as BloodComponent,
      bag_number: u?.bag_number ?? null,
      transfusion: Array.isArray(tf) ? (tf[0] ?? null) : (tf ?? null),
    }
  })
}

export async function recordTransfusion(
  issueId: string,
  input: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:transfuse')
  const parsed = BloodTransfusionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()

  // Resolve the admission via the issue's request, for encounter context.
  const { data: issue } = await supabase
    .from('blood_issues').select('request_id').eq('id', issueId).single()
  let admissionId: string | null = null
  if (issue?.request_id) {
    const { data: req } = await supabase
      .from('blood_requests').select('admission_id').eq('id', issue.request_id).single()
    admissionId = (req?.admission_id as string | null) ?? null
  }

  const { error } = await supabase.from('blood_transfusions').insert({
    tenant_id: actor.tenant_id,
    issue_id: issueId,
    admission_id: admissionId,
    started_at: parsed.data.started_at ?? null,
    ended_at: parsed.data.ended_at ?? null,
    vitals_pre: parsed.data.vitals_pre ?? null,
    vitals_post: parsed.data.vitals_post ?? null,
    administered_by: actor.id,
    notes: parsed.data.notes ?? null,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'transfuse', 'blood_issue', issueId, {})
  return { success: true }
}

export async function recordTransfusionReaction(
  transfusionId: string,
  input: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:transfuse')
  const parsed = BloodReactionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('blood_transfusion_reactions').insert({
    tenant_id: actor.tenant_id,
    transfusion_id: transfusionId,
    reaction_type: parsed.data.reaction_type,
    severity: parsed.data.severity,
    action_taken: parsed.data.action_taken ?? null,
    reported_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'transfusion_reaction', 'blood_transfusion', transfusionId, {
    reaction_type: parsed.data.reaction_type, severity: parsed.data.severity,
  })
  return { success: true }
}

// ---- Issue ----

export async function issueUnit(input: {
  requestId: string; bloodUnitId: string
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:issue')

  const supabase = await createClient()

  // Request context (patient + encounter) and the unit's component (for pricing)
  const { data: req } = await supabase
    .from('blood_requests').select('patient_id, admission_id').eq('id', input.requestId).single()
  if (!req) return { success: false, error: 'Request not found' }

  const { data: unit } = await supabase
    .from('blood_units').select('blood_group, component').eq('id', input.bloodUnitId).single()
  if (!unit) return { success: false, error: 'Blood unit not found' }

  // Price from the configured per-component processing charge (0 if unconfigured)
  const { data: charge } = await supabase
    .from('blood_component_charges').select('price').eq('component', unit.component).maybeSingle()
  const price = (charge?.price as number | undefined) ?? 0

  const issueId = crypto.randomUUID()
  const { data: result, error: rpcErr } = await supabase.rpc('issue_blood_unit', {
    p_issue_id:       issueId,
    p_request_id:     input.requestId,
    p_blood_unit_id:  input.bloodUnitId,
    p_patient_id:     req.patient_id,
    p_price_snapshot: price,
    p_issued_by:      actor.id,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }
  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Issue failed' }

  // IPD: auto-attach the processing charge to the admission bill so it isn't
  // missed at the manual counter (OPD/OT issues stay billable via the counter).
  if (req.admission_id && price > 0) {
    const today = new Date().toISOString().split('T')[0]
    await autoIpdBill(supabase, actor.id, {
      tenantId:    actor.tenant_id,
      admissionId: req.admission_id as string,
      patientId:   req.patient_id as string,
      billingDate: today,
      billSource:  'blood',
      lineItems: [{
        source:      'blood',
        ref_id:      issueId,
        description: `Blood: ${unit.blood_group} ${COMPONENT_LABELS[unit.component as BloodComponent]}`,
        qty:         1,
        unit_price:  price,
      }],
    })
    await supabase.from('blood_issues').update({ billing_status: 'billed' }).eq('id', issueId)
  }

  await logAudit(actor.id, 'issue_unit', 'blood_unit', input.bloodUnitId, {
    request_id: input.requestId, patient_id: req.patient_id,
  })
  return { success: true }
}

