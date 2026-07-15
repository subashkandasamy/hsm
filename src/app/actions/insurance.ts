'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  InsurancePolicySchema, InsuranceClaimSchema, AdvanceClaimSchema,
  PreauthSchema, EnhanceClaimSchema, InsuranceTpaSchema,
} from '@/lib/schemas'
import type {
  InsurancePolicy, InsuranceClaim, InsuranceClaimStatus,
  InsuranceTpa, PolicyCoverage, InsuranceReceivables,
} from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const VALID_TRANSITIONS: Record<InsuranceClaimStatus, InsuranceClaimStatus[]> = {
  draft:     ['preauth', 'submitted'],
  preauth:   ['submitted'],
  submitted: ['approved', 'rejected'],
  approved:  ['settled'],
  rejected:  [],
  settled:   [],
}

const CLAIM_SELECT = `*,
  bill:bills(id,bill_no,total,paid,status),
  admission:admissions(id,admitted_at),
  policy:insurance_policies(id,provider,policy_no,coverage_amount,patient:patients(id,full_name,uhid))`

// ── internal helpers ──────────────────────────────────────────────────────────

/** Non-cancelled bills for a claim's encounter, oldest first (settlement order). */
async function encounterBills(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: { admission_id?: string | null; visit_id?: string | null; bill_id?: string | null },
): Promise<{ id: string; total: number; paid: number }[]> {
  let q = supabase
    .from('bills')
    .select('id, total, paid, created_at, billing_date')
    .neq('status', 'cancelled')
    .neq('bill_source', 'consolidated')
  if (scope.admission_id) q = q.eq('admission_id', scope.admission_id)
  else if (scope.visit_id) q = q.eq('visit_id', scope.visit_id)
  else if (scope.bill_id) q = q.eq('id', scope.bill_id)
  else return []
  const { data } = await q
    .order('billing_date', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []).map((b) => ({ id: b.id as string, total: b.total as number, paid: b.paid as number }))
}

/** The claimable total (sum of encounter bill totals) and outstanding balance. */
function billsTotals(bills: { total: number; paid: number }[]) {
  const total = bills.reduce((s, b) => s + b.total, 0)
  const paid = bills.reduce((s, b) => s + b.paid, 0)
  return { total, paid, balance: Math.max(0, total - paid) }
}

/** Resolve the patient a policy belongs to (for cross-checking against an encounter). */
async function policyPatient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  policyId: string,
): Promise<{ patient_id: string; valid_till: string | null; coverage_amount: number | null } | null> {
  const { data } = await supabase
    .from('insurance_policies')
    .select('patient_id, valid_till, coverage_amount')
    .eq('id', policyId).maybeSingle()
  return (data as { patient_id: string; valid_till: string | null; coverage_amount: number | null } | null) ?? null
}

async function encounterPatientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: { admission_id?: string | null; visit_id?: string | null; bill_id?: string | null },
): Promise<string | null> {
  if (scope.admission_id) {
    const { data } = await supabase.from('admissions').select('patient_id').eq('id', scope.admission_id).maybeSingle()
    return (data?.patient_id as string) ?? null
  }
  if (scope.visit_id) {
    const { data } = await supabase.from('visits').select('patient_id').eq('id', scope.visit_id).maybeSingle()
    return (data?.patient_id as string) ?? null
  }
  if (scope.bill_id) {
    const { data } = await supabase.from('bills').select('patient_id').eq('id', scope.bill_id).maybeSingle()
    return (data?.patient_id as string) ?? null
  }
  return null
}

/** Sum of already-committed claim amounts on a policy (everything except rejected). */
async function committedOnPolicy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  policyId: string,
  excludeClaimId?: string,
): Promise<number> {
  let q = supabase
    .from('insurance_claims')
    .select('claim_amount, estimated_amount, status')
    .eq('policy_id', policyId)
    .neq('status', 'rejected')
  if (excludeClaimId) q = q.neq('id', excludeClaimId)
  const { data } = await q
  return (data ?? []).reduce((s, c) => s + ((c.claim_amount as number | null) ?? (c.estimated_amount as number | null) ?? 0), 0)
}

// ── TPA master ────────────────────────────────────────────────────────────────

export async function listTpas(): Promise<InsuranceTpa[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('insurance_tpas').select('*').order('name')
  return (data ?? []) as InsuranceTpa[]
}

export async function upsertTpa(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const parsed = InsuranceTpaSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const row = {
    tenant_id: actor.tenant_id, name: d.name, code: d.code ?? null,
    contact_person: d.contact_person ?? null, phone: d.phone ?? null,
    email: d.email ?? null, notes: d.notes ?? null, is_active: d.is_active,
  }
  const { error } = d.id
    ? await supabase.from('insurance_tpas').update(row).eq('id', d.id)
    : await supabase.from('insurance_tpas').insert({ id: crypto.randomUUID(), ...row })
  if (error) {
    if (error.code === '23505') return { success: false, error: `A TPA named "${d.name}" already exists` }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, d.id ? 'update' : 'create', 'insurance_tpa', d.id ?? d.name, { name: d.name })
  return { success: true }
}

export async function deleteTpa(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_tpas').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'insurance_tpa', id, {})
  return { success: true }
}

// ── Insurance providers (global master + per-tenant custom) ────────────────────

export async function listProviders(): Promise<{ id: string; name: string; tenant_id: string | null }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_providers')
    .select('id, name, tenant_id')
    .eq('is_active', true)
    .order('name')
  // RLS already returns globals + this tenant's custom rows.
  return (data ?? []) as { id: string; name: string; tenant_id: string | null }[]
}

export async function deleteCustomProvider(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  // RLS only allows deleting the tenant's own (tenant_id = current) rows.
  const { error } = await supabase.from('insurance_providers').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'insurance_provider', id, {})
  return { success: true }
}

/** Best-effort: remember a novel provider name as this tenant's custom insurer. */
async function rememberProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const { data: existing } = await supabase
    .from('insurance_providers')
    .select('id')
    .ilike('name', trimmed)
    .limit(1)
  if (existing && existing.length > 0) return   // already global or custom
  await supabase.from('insurance_providers').insert({
    id: crypto.randomUUID(), tenant_id: tenantId, name: trimmed,
  })
}

// ── Policies ──────────────────────────────────────────────────────────────────

export async function addPolicy(
  input: Record<string, unknown>
): Promise<{ success: true; policy: InsurancePolicy } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = InsurancePolicySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_policies').insert({
    id,
    tenant_id:       actor.tenant_id,
    patient_id:      parsed.data.patient_id,
    provider:        parsed.data.provider,
    policy_no:       parsed.data.policy_no,
    valid_till:      parsed.data.valid_till ?? null,
    coverage_amount: parsed.data.coverage_amount ?? null,
    tpa_id:          parsed.data.tpa_id ?? null,
  })
  if (error) return { success: false, error: error.message }

  // Remember a novel provider name as this tenant's custom insurer (best-effort).
  await rememberProvider(supabase, actor.tenant_id, parsed.data.provider)

  await logAudit(actor.id, 'create', 'insurance_policy', id, {
    provider: parsed.data.provider, policy_no: parsed.data.policy_no,
  })

  const { data: policy } = await supabase
    .from('insurance_policies')
    .select('*, patient:patients(id,full_name,uhid), tpa:insurance_tpas(id,name)')
    .eq('id', id).single()

  return { success: true, policy: policy as unknown as InsurancePolicy }
}

export async function listPolicies(patientId: string): Promise<InsurancePolicy[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_policies')
    .select('*, patient:patients(id,full_name,uhid), tpa:insurance_tpas(id,name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as InsurancePolicy[]
}

/** Coverage remaining on a policy after existing non-rejected claims + expiry check. */
export async function getPolicyCoverage(policyId: string): Promise<PolicyCoverage> {
  const supabase = await createClient()
  const pol = await policyPatient(supabase, policyId)
  const claimed = await committedOnPolicy(supabase, policyId)
  const coverage = pol?.coverage_amount ?? null
  const validTill = pol?.valid_till ?? null
  const expired = !!validTill && validTill < new Date().toISOString().split('T')[0]
  return {
    coverage_amount: coverage,
    claimed,
    remaining: coverage != null ? Math.max(0, coverage - claimed) : null,
    valid_till: validTill,
    expired,
  }
}

// ── Claims ────────────────────────────────────────────────────────────────────

/** Suggested claim amount + guardrail context for the "new claim" UI. */
export async function getClaimContext(scope: {
  admission_id?: string | null; visit_id?: string | null; bill_id?: string | null
}): Promise<{ total: number; balance: number }> {
  const supabase = await createClient()
  const bills = await encounterBills(supabase, scope)
  const t = billsTotals(bills)
  return { total: t.total, balance: t.balance }
}

export async function createClaim(
  input: Record<string, unknown>
): Promise<{ success: true; claimId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = InsuranceClaimSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const scope = { admission_id: d.admission_id ?? null, visit_id: d.visit_id ?? null, bill_id: d.bill_id ?? null }

  // Guardrail: policy must belong to the same patient as the encounter.
  const [pol, encPatient] = await Promise.all([
    policyPatient(supabase, d.policy_id),
    encounterPatientId(supabase, scope),
  ])
  if (!pol) return { success: false, error: 'Policy not found' }
  if (encPatient && pol.patient_id !== encPatient)
    return { success: false, error: 'This policy belongs to a different patient than the selected encounter' }

  // Guardrail: policy must be valid on the claim date.
  const today = new Date().toISOString().split('T')[0]
  if (pol.valid_till && pol.valid_till < today)
    return { success: false, error: `Policy expired on ${pol.valid_till} — cannot raise a claim against it` }

  // Guardrail: don't exceed remaining coverage.
  if (pol.coverage_amount != null) {
    const committed = await committedOnPolicy(supabase, d.policy_id)
    if (committed + d.claim_amount > pol.coverage_amount) {
      const remaining = Math.max(0, pol.coverage_amount - committed)
      return { success: false, error: `Claim exceeds remaining coverage. ₹${remaining.toFixed(0)} available on this policy.` }
    }
  }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('insurance_claims').insert({
    id,
    tenant_id:    actor.tenant_id,
    admission_id: scope.admission_id,
    visit_id:     scope.visit_id,
    bill_id:      scope.bill_id,
    policy_id:    d.policy_id,
    claim_amount: d.claim_amount,
    claim_type:   d.claim_type,
    status:       'draft',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'insurance_claim', id, { ...scope, claim_amount: d.claim_amount })
  return { success: true, claimId: id }
}

/** Raise a pre-authorization against an admission before any bill exists. */
export async function createPreauth(
  input: Record<string, unknown>
): Promise<{ success: true; claimId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = PreauthSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const [pol, encPatient] = await Promise.all([
    policyPatient(supabase, d.policy_id),
    encounterPatientId(supabase, { admission_id: d.admission_id }),
  ])
  if (!pol) return { success: false, error: 'Policy not found' }
  if (encPatient && pol.patient_id !== encPatient)
    return { success: false, error: 'This policy belongs to a different patient than the admission' }
  const today = new Date().toISOString().split('T')[0]
  if (pol.valid_till && pol.valid_till < today)
    return { success: false, error: `Policy expired on ${pol.valid_till}` }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('insurance_claims').insert({
    id,
    tenant_id:        actor.tenant_id,
    admission_id:     d.admission_id,
    policy_id:        d.policy_id,
    estimated_amount: d.estimated_amount,
    claim_type:       d.claim_type,
    status:           'preauth',
    remarks:          d.remarks ?? null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'preauth', 'insurance_claim', id, { admission_id: d.admission_id, estimated_amount: d.estimated_amount })
  return { success: true, claimId: id }
}

export async function advanceClaim(
  id: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = AdvanceClaimSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: claim } = await supabase
    .from('insurance_claims')
    .select('status, bill_id, admission_id, visit_id, claim_amount, estimated_amount, approved_amount')
    .eq('id', id).single()
  if (!claim) return { success: false, error: 'Claim not found' }

  const currentStatus = claim.status as InsuranceClaimStatus
  const nextStatus = parsed.data.next_status
  if (!(VALID_TRANSITIONS[currentStatus] ?? []).includes(nextStatus))
    return { success: false, error: `Cannot transition from ${currentStatus} to ${nextStatus}` }

  const updateData: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'submitted') updateData.submitted_at = new Date().toISOString()

  if (nextStatus === 'approved' || nextStatus === 'settled') {
    if (parsed.data.approved_amount != null) updateData.approved_amount = parsed.data.approved_amount
    if (parsed.data.copay_amount != null) {
      updateData.copay_amount = parsed.data.copay_amount
    } else {
      // Default co-pay = claimed − approved (the patient's residual share).
      const claimed = (claim.claim_amount as number | null) ?? (claim.estimated_amount as number | null) ?? 0
      const approved = (parsed.data.approved_amount as number | undefined) ?? (claim.approved_amount as number | null) ?? claimed
      updateData.copay_amount = Math.max(0, claimed - approved)
    }
  }
  if (parsed.data.remarks != null) updateData.remarks = parsed.data.remarks

  const { error } = await supabase.from('insurance_claims').update(updateData).eq('id', id)
  if (error) return { success: false, error: error.message }

  // On settlement: allocate the approved amount across the encounter's unpaid
  // bills, oldest first, as insurance payments — mirrors advance-credit allocation.
  if (nextStatus === 'settled') {
    const approvedAmt =
      (parsed.data.approved_amount as number | undefined) ??
      (claim.approved_amount as number | undefined) ??
      (claim.claim_amount as number | undefined) ?? 0

    if (approvedAmt > 0) {
      const bills = await encounterBills(supabase, {
        admission_id: claim.admission_id as string | null,
        visit_id: claim.visit_id as string | null,
        bill_id: claim.bill_id as string | null,
      })
      let leftover = approvedAmt
      for (const b of bills) {
        if (leftover <= 0) break
        const remaining = b.total - b.paid
        if (remaining <= 0) continue
        const pay = Math.min(remaining, leftover)
        const { error: payErr } = await supabase.from('payments').insert({
          id: crypto.randomUUID(),
          tenant_id: actor.tenant_id,
          bill_id: b.id,
          amount: pay,
          method: 'insurance',
          reference: `Claim ${id}`,
          received_by: actor.id,
        })
        if (payErr) continue
        const newPaid = b.paid + pay
        await supabase.from('bills')
          .update({ paid: newPaid, status: newPaid >= b.total ? 'paid' : 'partial' })
          .eq('id', b.id)
        leftover -= pay
      }
    }
  }

  await logAudit(actor.id, 'advance', 'insurance_claim', id, { from: currentStatus, to: nextStatus })
  return { success: true }
}

/** Enhancement: increase the claimed amount mid-stay (cost overran the estimate). */
export async function enhanceClaim(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = EnhanceClaimSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: claim } = await supabase
    .from('insurance_claims').select('status, policy_id, claim_amount').eq('id', id).single()
  if (!claim) return { success: false, error: 'Claim not found' }
  if (['settled', 'rejected'].includes(claim.status as string))
    return { success: false, error: 'Cannot enhance a settled or rejected claim' }

  // Re-check coverage against the enhanced amount.
  const pol = await policyPatient(supabase, claim.policy_id as string)
  if (pol?.coverage_amount != null) {
    const committed = await committedOnPolicy(supabase, claim.policy_id as string, id)
    if (committed + parsed.data.claim_amount > pol.coverage_amount) {
      const remaining = Math.max(0, pol.coverage_amount - committed)
      return { success: false, error: `Enhanced amount exceeds remaining coverage (₹${remaining.toFixed(0)} available).` }
    }
  }

  const { error } = await supabase.from('insurance_claims')
    .update({ claim_amount: parsed.data.claim_amount, remarks: parsed.data.remarks ?? null })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'enhance', 'insurance_claim', id, { claim_amount: parsed.data.claim_amount })
  return { success: true }
}

export async function getClaim(id: string): Promise<InsuranceClaim | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('insurance_claims').select(CLAIM_SELECT).eq('id', id).single()
  return data as unknown as InsuranceClaim | null
}

export async function listClaims(filters?: { status?: string }): Promise<InsuranceClaim[]> {
  const supabase = await createClient()
  let q = supabase.from('insurance_claims').select(CLAIM_SELECT).order('created_at', { ascending: false })
  if (filters?.status) q = q.eq('status', filters.status)
  const { data } = await q.limit(300)
  return (data ?? []) as unknown as InsuranceClaim[]
}

/** Claims linked to a specific admission — for the IPD detail panel & discharge guard. */
export async function listClaimsForAdmission(admissionId: string): Promise<InsuranceClaim[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims').select(CLAIM_SELECT)
    .eq('admission_id', admissionId).order('created_at', { ascending: false })
  return (data ?? []) as unknown as InsuranceClaim[]
}

// ── Claim documents (reuse patient_documents) ──────────────────────────────────

export async function attachClaimDocument(params: {
  claimId: string; patientId: string; title: string; filePath: string
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('patient_documents').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    patient_id: params.patientId,
    claim_id: params.claimId,
    title: params.title,
    category: 'insurance',
    file_path: params.filePath,
    uploaded_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'attach_doc', 'insurance_claim', params.claimId, { title: params.title })
  return { success: true }
}

export async function listClaimDocuments(claimId: string): Promise<Array<{ id: string; title: string; file_path: string; uploaded_at: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patient_documents').select('id, title, file_path, uploaded_at')
    .eq('claim_id', claimId).order('uploaded_at', { ascending: false })
  return (data ?? []) as Array<{ id: string; title: string; file_path: string; uploaded_at: string }>
}

// ── Receivables roll-up ─────────────────────────────────────────────────────────

export async function getReceivables(): Promise<InsuranceReceivables> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims')
    .select('status, claim_amount, approved_amount, submitted_at, created_at')
    .in('status', ['submitted', 'approved', 'settled'])
    .limit(2000)

  const rows = data ?? []
  const now = Date.now()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  let pending = 0, approved = 0, settledThisMonth = 0
  const buckets = [
    { label: '0–15 days', max: 15, amount: 0, count: 0 },
    { label: '16–30 days', max: 30, amount: 0, count: 0 },
    { label: '31–60 days', max: 60, amount: 0, count: 0 },
    { label: '60+ days', max: Infinity, amount: 0, count: 0 },
  ]

  for (const c of rows) {
    const claimAmt = (c.claim_amount as number | null) ?? 0
    const apprAmt = (c.approved_amount as number | null) ?? claimAmt
    if (c.status === 'submitted') pending += claimAmt
    if (c.status === 'approved') {
      approved += apprAmt
      // Age approved (unsettled) receivables by submission date.
      const submitted = (c.submitted_at as string | null) ?? (c.created_at as string)
      const days = (now - new Date(submitted).getTime()) / 86400000
      const bucket = buckets.find((b) => days <= b.max)!
      bucket.amount += apprAmt; bucket.count += 1
    }
    if (c.status === 'settled' && (c.submitted_at as string | null ?? c.created_at as string) >= monthStart) {
      settledThisMonth += apprAmt
    }
  }

  return {
    pending, approved, settledThisMonth,
    agingBuckets: buckets.map((b) => ({ label: b.label, amount: b.amount, count: b.count })),
  }
}

/** Approved-but-unsettled insurance receivable for an admission (covers balance at discharge). */
export async function getAdmissionInsuranceReceivable(admissionId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims')
    .select('approved_amount, claim_amount')
    .eq('admission_id', admissionId)
    .eq('status', 'approved')
  return (data ?? []).reduce((s, c) => s + ((c.approved_amount as number | null) ?? (c.claim_amount as number | null) ?? 0), 0)
}
