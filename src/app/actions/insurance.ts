'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  InsurancePolicySchema, UpdatePolicySchema, InsuranceClaimSchema, AdvanceClaimSchema,
  StartClaimSchema, EligibilityFieldsSchema, DecideEligibilitySchema, RecordSettlementSchema,
  EnhanceClaimSchema, InsuranceTpaSchema, InsuranceBankAccountSchema, ClaimNoteSchema, UpdateClaimNoteSchema,
  ClaimIdentifiersSchema, ClaimDeductionSchema, ClaimFieldsSchema,
  SetClaimOwnerSchema, ChecklistItemSchema, EnhancementSchema, DecideEnhancementSchema,
  TariffPackageSchema, RemittanceBatchSchema,
} from '@/lib/schemas'
import { INSURANCE_CREDIT_COLUMNS, totalInsuranceCredit, type InsuranceCreditRow } from '@/lib/insuranceCredit'
import { listAdmissions } from '@/app/actions/ipd'
import { getPatientVisits } from '@/app/actions/opd'
import type {
  InsurancePolicy, InsuranceClaim, InsuranceClaimStatus,
  InsuranceTpa, InsuranceBankAccount, PolicyCoverage, InsuranceReceivables,
  InsuranceClaimNote, InsuranceClaimHistoryEntry, InsurancePatientEncounter,
  InsuranceClaimDeduction, InsuranceClaimChecklistItem, InsuranceClaimEnhancement,
  InsuranceTariffPackage, InsuranceRemittanceBatch,
  Admission, Visit,
} from '@/lib/types'
import { istToday } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }

// Stage 3/4 (Claim/Settlement) lifecycle only. A claim is created directly in
// 'awaiting_eligibility' and only advances once eligibility_status='approved'
// (checked in code in advanceClaim, not representable in this table alone).
// Settlement is its own dedicated action (recordSettlement) since it needs a
// bank account — 'approved' has no advanceClaim-driven next status.
const VALID_TRANSITIONS: Record<InsuranceClaimStatus, InsuranceClaimStatus[]> = {
  draft:                ['awaiting_eligibility'],
  awaiting_eligibility:  ['raised'],
  raised:                ['submitted'],
  submitted:             ['approved', 'rejected'],
  approved:              [],
  rejected:              [],
  settled:               [],
}

const CLAIM_SELECT = `*,
  bill:bills(id,bill_no,total,paid,status),
  admission:admissions(id,admitted_at),
  policy:insurance_policies(id,provider,policy_no,coverage_amount,room_rent_limit_per_day,sub_limit_notes,member_id,policyholder_name,policyholder_relationship,corporate_name,employee_id,copay_percent,patient:patients(id,full_name,uhid)),
  settlement_account:insurance_bank_accounts(id,account_name,bank_name),
  owner:profiles!insurance_claims_owner_id_fkey(id,full_name)`

// ── internal helpers ──────────────────────────────────────────────────────────

/** Non-cancelled bills for a claim's encounter, oldest first (settlement order). */
async function encounterBills(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: { admission_id?: string | null; visit_id?: string | null; bill_id?: string | null },
): Promise<{ id: string; total: number; paid: number }[]> {
  let q = supabase
    .from('bills')
    .select('id, total, paid, bill_source, created_at, billing_date')
    .neq('status', 'cancelled')
  if (scope.admission_id) {
    // Sweep in the source OPD visit's bills too, if this admission followed
    // one on the same day — the whole OPD→IPD episode is one claimable
    // encounter, not two.
    const { data: adm } = await supabase
      .from('admissions').select('source_visit_id').eq('id', scope.admission_id).maybeSingle()
    const sourceVisitId = adm?.source_visit_id as string | null | undefined
    q = sourceVisitId
      ? q.or(`admission_id.eq.${scope.admission_id},visit_id.eq.${sourceVisitId}`)
      : q.eq('admission_id', scope.admission_id)
  }
  else if (scope.visit_id) q = q.eq('visit_id', scope.visit_id)
  else if (scope.bill_id) q = q.eq('id', scope.bill_id)
  else return []
  const { data } = await q
    .order('billing_date', { ascending: true })
    .order('created_at', { ascending: true })
  // Filter bill_source in JS, not in the query — Postgres NEQ silently drops
  // rows where the column is NULL (most bills have no bill_source at all),
  // which would otherwise make every un-sourced bill invisible to insurance.
  return (data ?? [])
    .filter((b) => (b.bill_source as string | null) !== 'consolidated')
    .map((b) => ({ id: b.id as string, total: b.total as number, paid: b.paid as number }))
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
    .select('claim_amount, eligibility_approved_amount, estimated_amount, status')
    .eq('policy_id', policyId)
    .neq('status', 'rejected')
  if (excludeClaimId) q = q.neq('id', excludeClaimId)
  const { data } = await q
  // Firmest figure first: the raised claim amount, else the eligibility-approved
  // amount (a cashless approval commits cover), else the estimate.
  return (data ?? []).reduce((s, c) => s + (
    (c.claim_amount as number | null) ??
    (c.eligibility_approved_amount as number | null) ??
    (c.estimated_amount as number | null) ?? 0
  ), 0)
}

/** Refuses an amount that would take the policy past its coverage (null coverage = no limit). */
async function checkCoverage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claimId: string,
  amount: number,
): Promise<string | null> {
  const { data: claim } = await supabase.from('insurance_claims').select('policy_id').eq('id', claimId).maybeSingle()
  if (!claim) return 'Claim not found'
  const pol = await policyPatient(supabase, claim.policy_id as string)
  if (pol?.coverage_amount == null) return null
  const committed = await committedOnPolicy(supabase, claim.policy_id as string, claimId)
  if (committed + amount > pol.coverage_amount + 0.005) {
    const remaining = Math.max(0, pol.coverage_amount - committed)
    return `This exceeds the policy's remaining coverage — ₹${remaining.toFixed(0)} available.`
  }
  return null
}

/** Another live (non-rejected) claim on the same encounter as this one, if any. */
async function otherLiveClaimOnEncounter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claim: { id: string; admission_id: string | null; visit_id: string | null; bill_id: string | null },
): Promise<boolean> {
  let q = supabase.from('insurance_claims').select('id', { count: 'exact', head: true }).neq('status', 'rejected').neq('id', claim.id)
  if (claim.admission_id) q = q.eq('admission_id', claim.admission_id)
  else if (claim.visit_id) q = q.eq('visit_id', claim.visit_id)
  else if (claim.bill_id) q = q.eq('bill_id', claim.bill_id)
  else return false
  const { count } = await q
  return (count ?? 0) > 0
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
    room_rent_limit_per_day: parsed.data.room_rent_limit_per_day ?? null,
    sub_limit_notes:         parsed.data.sub_limit_notes ?? null,
    member_id:                 parsed.data.member_id ?? null,
    policyholder_name:         parsed.data.policyholder_name ?? null,
    policyholder_relationship: parsed.data.policyholder_relationship ?? null,
    corporate_name:            parsed.data.corporate_name ?? null,
    employee_id:               parsed.data.employee_id ?? null,
    copay_percent:             parsed.data.copay_percent ?? null,
    policy_start_date:         parsed.data.policy_start_date ?? null,
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

export async function updatePolicy(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = UpdatePolicySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_policies').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'insurance_policy', id, parsed.data)
  return { success: true }
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
  const expired = !!validTill && validTill < istToday()
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
  const today = istToday()
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

/**
 * Stage 1 "Add Policy" — creates the claim itself, attaching a policy to an
 * encounter. No amount yet; that's entered at Stage 2. If a non-rejected
 * claim already exists on this exact encounter, returns it instead of
 * creating a duplicate (retry-after-rejection creates a genuinely new one).
 */
export async function startClaim(
  input: Record<string, unknown>
): Promise<{ success: true; claimId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = StartClaimSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const scope = { admission_id: d.admission_id ?? null, visit_id: d.visit_id ?? null, bill_id: d.bill_id ?? null }

  const [pol, encPatient] = await Promise.all([
    policyPatient(supabase, d.policy_id),
    encounterPatientId(supabase, scope),
  ])
  if (!pol) return { success: false, error: 'Policy not found' }
  if (encPatient && pol.patient_id !== encPatient)
    return { success: false, error: 'This policy belongs to a different patient than the encounter' }
  const today = istToday()
  if (pol.valid_till && pol.valid_till < today)
    return { success: false, error: `Policy expired on ${pol.valid_till}` }

  let q = supabase.from('insurance_claims').select('id').neq('status', 'rejected')
  if (scope.admission_id) q = q.eq('admission_id', scope.admission_id)
  else if (scope.visit_id) q = q.eq('visit_id', scope.visit_id)
  else if (scope.bill_id) q = q.eq('bill_id', scope.bill_id)
  const { data: existing } = await q.maybeSingle()
  if (existing) return { success: true, claimId: existing.id as string }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('insurance_claims').insert({
    id,
    tenant_id:    actor.tenant_id,
    admission_id: scope.admission_id,
    visit_id:     scope.visit_id,
    bill_id:      scope.bill_id,
    policy_id:    d.policy_id,
    claim_type:   'cashless',
    status:       'awaiting_eligibility',
    eligibility_status: 'pending',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'start_claim', 'insurance_claim', id, { ...scope, policy_id: d.policy_id })
  return { success: true, claimId: id }
}

/** Stage 2 fields — editable independently of the approve/reject decision. */
export async function updateEligibilityFields(claimId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = EligibilityFieldsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: claim } = await supabase.from('insurance_claims').select('eligibility_status').eq('id', claimId).maybeSingle()
  if (!claim) return { success: false, error: 'Claim not found' }
  if (claim.eligibility_status !== 'pending') return { success: false, error: 'Eligibility has already been decided — fields are locked' }

  const { error } = await supabase.from('insurance_claims').update(parsed.data).eq('id', claimId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update_eligibility_fields', 'insurance_claim', claimId, parsed.data)
  return { success: true }
}

/**
 * Stage 2's decision — the front-desk verification (corporate ID / policy
 * card / a quick portal check) is a 2-3 minute lookup, not the multi-day TPA
 * claim process that follows at Stage 3. Independent of the claim's main
 * `status`; on rejection also sets status='rejected' so list/card badges
 * stay accurate without a second query.
 */
export async function decideEligibility(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = DecideEligibilitySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data: claim } = await supabase
    .from('insurance_claims').select('eligibility_status, estimated_amount').eq('id', d.id).maybeSingle()
  if (!claim) return { success: false, error: 'Claim not found' }
  if (claim.eligibility_status !== 'pending') return { success: false, error: 'Eligibility has already been decided for this claim' }
  if (d.decision === 'approved' && !claim.estimated_amount)
    return { success: false, error: 'Enter an estimated amount before approving' }
  if (d.decision === 'approved') {
    const coverageErr = await checkCoverage(supabase, d.id, (d.approved_amount ?? claim.estimated_amount) as number)
    if (coverageErr) return { success: false, error: coverageErr }
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    eligibility_status: d.decision,
    eligibility_decided_at: now,
  }
  if (d.decision === 'approved') updateData.eligibility_approved_amount = d.approved_amount ?? claim.estimated_amount
  if (d.decision === 'rejected') { updateData.status = 'rejected'; updateData.rejected_at = now; if (d.denial_reason) updateData.denial_reason = d.denial_reason }
  if (d.remarks != null) updateData.remarks = d.remarks

  const { error } = await supabase.from('insurance_claims').update(updateData).eq('id', d.id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, `eligibility_${d.decision}`, 'insurance_claim', d.id, { approved_amount: updateData.eligibility_approved_amount })
  return { success: true }
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
    .select('status, eligibility_status, bill_id, admission_id, visit_id, claim_amount, estimated_amount, approved_amount')
    .eq('id', id).single()
  if (!claim) return { success: false, error: 'Claim not found' }

  const currentStatus = claim.status as InsuranceClaimStatus
  const nextStatus = parsed.data.next_status
  if (!(VALID_TRANSITIONS[currentStatus] ?? []).includes(nextStatus))
    return { success: false, error: `Cannot transition from ${currentStatus} to ${nextStatus}` }

  // Stage 3 can only begin once Stage 2 (eligibility) has been approved —
  // this is the one gate that isn't representable in VALID_TRANSITIONS alone.
  if (nextStatus === 'raised' && claim.eligibility_status !== 'approved')
    return { success: false, error: 'Eligibility must be approved before the claim can be raised' }

  // Raising a claim is the moment the estimate becomes a firm amount — the
  // hospital must commit to a real claim_amount before it can be submitted.
  if (nextStatus === 'raised' && parsed.data.claim_amount == null && claim.claim_amount == null)
    return { success: false, error: 'Claim amount is required to raise this claim' }
  if (nextStatus === 'raised' && parsed.data.claim_amount != null) {
    const coverageErr = await checkCoverage(supabase, id, parsed.data.claim_amount)
    if (coverageErr) return { success: false, error: coverageErr }
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'raised')    { updateData.raised_at = now; if (parsed.data.claim_amount != null) updateData.claim_amount = parsed.data.claim_amount }
  if (nextStatus === 'submitted') updateData.submitted_at = now
  if (nextStatus === 'approved')  updateData.approved_at = now
  if (nextStatus === 'rejected')  { updateData.rejected_at = now; if (parsed.data.denial_reason) updateData.denial_reason = parsed.data.denial_reason }

  if (nextStatus === 'approved') {
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

  await logAudit(actor.id, 'advance', 'insurance_claim', id, { from: currentStatus, to: nextStatus })
  return { success: true }
}

/**
 * Stage 4 "Settlement" — records which bank account received the payment and
 * what was actually settled (which can legitimately differ from the approved
 * amount in either direction). Allocates the settled amount across the
 * encounter's unpaid bills, oldest first, as insurance payments.
 */
export async function recordSettlement(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = RecordSettlementSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data: claim } = await supabase
    .from('insurance_claims')
    .select('status, admission_id, visit_id, bill_id, eligibility_approved_amount')
    .eq('id', d.id).maybeSingle()
  if (!claim) return { success: false, error: 'Claim not found' }
  if (claim.status !== 'approved') return { success: false, error: 'The claim must be approved before it can be settled' }

  // The gap between what pre-auth covered and what actually settled must be
  // resolved explicitly — otherwise it silently reads as fully covered while
  // less money was collected (the revenue-leak fix). Force a choice.
  const covered = (claim.eligibility_approved_amount as number | null) ?? 0
  const shortfall = Math.max(0, covered - d.settled_amount)
  if (shortfall > 0 && !d.shortfall_resolution) {
    return {
      success: false,
      error: `Settlement is ₹${shortfall.toFixed(0)} short of the ₹${covered.toFixed(0)} covered at eligibility. Choose whether to write it off or recover it from the patient.`,
    }
  }

  const now = new Date().toISOString()
  // Conditional on status: two settlement clicks at once used to both pass the
  // 'approved' check above and post the insurer's money twice.
  const { data: settledRows, error } = await supabase.from('insurance_claims').update({
    status: 'settled',
    settled_at: now,
    settled_amount: d.settled_amount,
    settlement_account_id: d.settlement_account_id,
    settlement_notes: d.settlement_notes ?? null,
    settlement_utr: d.settlement_utr ?? null,
    tds_amount: d.tds_amount ?? null,
    shortfall_amount: shortfall > 0 ? shortfall : null,
    shortfall_resolution: shortfall > 0 ? (d.shortfall_resolution ?? null) : null,
  }).eq('id', d.id).eq('status', 'approved').select('id')
  if (error) return { success: false, error: error.message }
  if (!settledRows?.length) return { success: false, error: 'This claim has already been settled' }

  let unallocated = 0
  if (d.settled_amount > 0) {
    const bills = await encounterBills(supabase, {
      admission_id: claim.admission_id as string | null,
      visit_id: claim.visit_id as string | null,
      bill_id: claim.bill_id as string | null,
    })
    let leftover = Math.round(d.settled_amount * 100) / 100
    for (const b of bills) {
      if (leftover <= 0) break
      // Balance from the payments table (bills.paid can drift), posted through the
      // row-locked record_bill_payment so paid/status stay consistent.
      const { data: pays } = await supabase.from('payments').select('amount').eq('bill_id', b.id)
      const paidSoFar = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const remaining = Math.round((b.total - paidSoFar) * 100) / 100
      if (remaining <= 0) continue
      const pay = Math.min(remaining, leftover)
      const { data: res, error: payErr } = await supabase.rpc('record_bill_payment', {
        p_bill_id: b.id, p_amount: pay, p_method: 'insurance', p_reference: `Claim ${d.id}`,
      })
      if (payErr || !(res as { ok?: boolean } | null)?.ok) {
        console.error('[recordSettlement] posting to bill failed', b.id, payErr?.message ?? (res as { error?: string } | null)?.error)
        continue
      }
      leftover = Math.round((leftover - pay) * 100) / 100
    }
    unallocated = leftover
  }

  await logAudit(actor.id, 'settle', 'insurance_claim', d.id, {
    settled_amount: d.settled_amount, account_id: d.settlement_account_id, unallocated,
    tds: d.tds_amount ?? 0, shortfall, shortfall_resolution: d.shortfall_resolution ?? null,
  })
  return { success: true }
}

// ── Claim identifiers (insurer-side references, editable any time) ──────────────

export async function updateClaimIdentifiers(claimId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = ClaimIdentifiersSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claims').update(parsed.data).eq('id', claimId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update_identifiers', 'insurance_claim', claimId, parsed.data)
  return { success: true }
}

/** Correct any recorded value on a claim (the per-stage "Edit" action). */
export async function updateClaimFields(claimId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = ClaimFieldsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  if (Object.keys(parsed.data).length === 0) return { success: true }

  const supabase = await createClient()
  // Settlement already posted the insurer's money to the bills; changing the
  // settled figure here would leave the claim and the bills disagreeing.
  if (parsed.data.settled_amount !== undefined) {
    const { data: cur } = await supabase.from('insurance_claims').select('status, settled_amount').eq('id', claimId).maybeSingle()
    if (cur?.status === 'settled' && Number(cur.settled_amount ?? 0) !== Number(parsed.data.settled_amount ?? 0)) {
      return { success: false, error: 'The settled amount is already posted to the bills and can’t be edited here. Record a refund or adjustment from Billing instead.' }
    }
  }
  const { error } = await supabase.from('insurance_claims').update(parsed.data).eq('id', claimId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'edit_fields', 'insurance_claim', claimId, parsed.data)
  return { success: true }
}

// ── Disallowance / deduction lines ──────────────────────────────────────────────

export async function addDeduction(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = ClaimDeductionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claim_deductions').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    claim_id: d.claim_id,
    description: d.description,
    amount: d.amount,
    deduction_type: d.deduction_type,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add_deduction', 'insurance_claim', d.claim_id, { amount: d.amount, type: d.deduction_type })
  return { success: true }
}

export async function listDeductions(claimId: string): Promise<InsuranceClaimDeduction[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claim_deductions')
    .select('*')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })
  return (data ?? []) as InsuranceClaimDeduction[]
}

export async function deleteDeduction(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const supabase = await createClient()
  const { data: row } = await supabase.from('insurance_claim_deductions').select('claim_id, amount').eq('id', id).maybeSingle()
  const { error } = await supabase.from('insurance_claim_deductions').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  if (row) await logAudit(actor.id, 'delete_deduction', 'insurance_claim', row.claim_id as string, { amount: row.amount })
  return { success: true }
}

// ── Desk ownership (assignee + follow-up due date) ──────────────────────────────

export async function listInsuranceOwners(): Promise<Array<{ id: string; full_name: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
  return (data ?? []) as Array<{ id: string; full_name: string }>
}

export async function setClaimOwner(claimId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = SetClaimOwnerSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claims').update({
    owner_id: parsed.data.owner_id ?? null,
    follow_up_due: parsed.data.follow_up_due ?? null,
  }).eq('id', claimId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'set_owner', 'insurance_claim', claimId, parsed.data)
  return { success: true }
}

// ── Required-document checklist ──────────────────────────────────────────────────

export async function listChecklist(claimId: string): Promise<InsuranceClaimChecklistItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claim_checklist').select('*')
    .eq('claim_id', claimId).order('created_at', { ascending: true })
  return (data ?? []) as InsuranceClaimChecklistItem[]
}

export async function addChecklistItem(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = ChecklistItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claim_checklist').insert({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id,
    claim_id: parsed.data.claim_id, item: parsed.data.item,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function toggleChecklistItem(id: string, isProvided: boolean): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claim_checklist')
    .update({ is_provided: isProvided, provided_at: isProvided ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteChecklistItem(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claim_checklist').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Enhancement requests (interim, each with its own authorisation) ─────────────

export async function listEnhancements(claimId: string): Promise<InsuranceClaimEnhancement[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claim_enhancements').select('*')
    .eq('claim_id', claimId).order('created_at', { ascending: true })
  return (data ?? []) as InsuranceClaimEnhancement[]
}

export async function addEnhancement(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = EnhancementSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claim_enhancements').insert({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id, claim_id: d.claim_id,
    requested_amount: d.requested_amount, al_number: d.al_number ?? null,
    remarks: d.remarks ?? null, created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add_enhancement', 'insurance_claim', d.claim_id, { requested_amount: d.requested_amount })
  return { success: true }
}

export async function decideEnhancement(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = DecideEnhancementSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data: enh } = await supabase
    .from('insurance_claim_enhancements').select('claim_id, requested_amount').eq('id', d.id).maybeSingle()
  if (!enh) return { success: false, error: 'Enhancement not found' }

  const approved = d.decision === 'approved' ? (d.approved_amount ?? (enh.requested_amount as number)) : null
  if (approved != null) {
    const coverageErr = await checkCoverage(supabase, enh.claim_id as string, approved)
    if (coverageErr) return { success: false, error: coverageErr }
  }
  const { error } = await supabase.from('insurance_claim_enhancements').update({
    status: d.decision, approved_amount: approved, al_number: d.al_number ?? null,
  }).eq('id', d.id)
  if (error) return { success: false, error: error.message }

  // An approved enhancement raises the claim's committed amount and, since it's
  // a fresh authorisation, the eligibility-covered figure the discharge gate reads.
  if (d.decision === 'approved' && approved != null) {
    await supabase.from('insurance_claims')
      .update({ eligibility_approved_amount: approved, claim_amount: approved })
      .eq('id', enh.claim_id as string)
  }

  await logAudit(actor.id, `enhancement_${d.decision}`, 'insurance_claim', enh.claim_id as string, { approved_amount: approved })
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

export async function listClaims(filters?: { status?: string; statuses?: string[] }): Promise<InsuranceClaim[]> {
  const supabase = await createClient()
  let q = supabase.from('insurance_claims').select(CLAIM_SELECT).order('created_at', { ascending: false })
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.statuses?.length) q = q.in('status', filters.statuses)
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

/** Every claim (any status) for a patient — one encounter/claim per card on their insurance page. */
export async function listClaimsForPatient(patientId: string): Promise<InsuranceClaim[]> {
  const supabase = await createClient()
  const { data: policies } = await supabase
    .from('insurance_policies').select('id').eq('patient_id', patientId)
  const policyIds = (policies ?? []).map((p) => p.id as string)
  if (policyIds.length === 0) return []

  const { data } = await supabase
    .from('insurance_claims').select(CLAIM_SELECT)
    .in('policy_id', policyIds)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as InsuranceClaim[]
}

/**
 * Every OPD visit or IPD admission for a patient, whether or not any claim
 * has been started on it — the patient's insurance page shows one card per
 * encounter. Claims are matched onto their encounter by admission_id/visit_id
 * (0, 1, or several after a rejection retry) — bill-scoped claims aren't
 * tied to a specific admission/visit and so aren't attributable to one card
 * here (they still show on the Insurance front page and via search).
 */
export async function listEncountersForPatient(patientId: string): Promise<InsurancePatientEncounter[]> {
  const supabase = await createClient()
  const [admissions, visits, claims, apptRes] = await Promise.all([
    listAdmissions({ patientId }),
    getPatientVisits(patientId),
    listClaimsForPatient(patientId),
    supabase.from('appointments')
      .select('id, scheduled_at, status, doctor:profiles(full_name)')
      .eq('patient_id', patientId).in('status', ['booked', 'checked_in']),
  ])

  // Pre-visit appointments (booked/checked-in) whose visit hasn't started yet —
  // their consultation bill is the only thing to scope a claim against. Skip any
  // appointment that already has a started visit (that visit is the encounter).
  const visitApptIds = new Set((visits as Visit[]).map((v) => v.appointment_id).filter(Boolean))
  const pendingAppts = (apptRes.data ?? []).filter((a) => !visitApptIds.has(a.id as string))
  const apptBills = pendingAppts.length > 0
    ? (await supabase.from('bills')
        .select('id, bill_no, total, status, appointment_id')
        .in('appointment_id', pendingAppts.map((a) => a.id as string))
        .neq('status', 'cancelled')).data ?? []
    : []

  const encounters: InsurancePatientEncounter[] = [
    ...(admissions as Admission[]).map((a) => ({
      key: `admission:${a.id}`, type: 'admission' as const, id: a.id, date: a.admitted_at,
      label: `IPD · ${new Date(a.admitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${a.ward?.name ? ` · ${a.ward.name}` : ''}${a.status === 'admitted' ? ' · admitted' : ''}`,
      treatmentValue: a.treatment_value ?? null,
      claims: claims.filter((c) => c.admission_id === a.id),
    })),
    ...(visits as Visit[]).map((v) => ({
      key: `visit:${v.id}`, type: 'visit' as const, id: v.id, date: v.visit_date,
      label: `OPD · ${new Date(v.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      claims: claims.filter((c) => c.visit_id === v.id),
    })),
    ...pendingAppts.flatMap((a) => {
      const bill = apptBills.find((b) => b.appointment_id === a.id)
      if (!bill) return []   // no consultation bill → nothing to claim against yet
      const billId = bill.id as string
      const when = a.scheduled_at as string
      return [{
        key: `appointment:${a.id}`, type: 'appointment' as const, id: a.id, date: when, billId,
        label: `OPD Appointment · ${new Date(when).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
        claims: claims.filter((c) => c.bill_id === billId),
      }]
    }),
  ]
  return encounters.sort((a, b) => b.date.localeCompare(a.date))
}

// ── Enquiry log (TPA back-and-forth loop) ───────────────────────────────────────

export async function addClaimNote(claimId: string, note: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = ClaimNoteSchema.safeParse({ claim_id: claimId, note })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: claim } = await supabase.from('insurance_claims').select('status').eq('id', claimId).maybeSingle()
  if (!claim) return { success: false, error: 'Claim not found' }

  const { error } = await supabase.from('insurance_claim_notes').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    claim_id: claimId,
    stage: claim.status,
    note: parsed.data.note,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function listClaimNotes(claimId: string): Promise<InsuranceClaimNote[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claim_notes')
    .select('*, author:profiles(id, full_name)')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as InsuranceClaimNote[]
}

export async function updateClaimNote(noteId: string, note: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = UpdateClaimNoteSchema.safeParse({ id: noteId, note })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claim_notes').update({ note: parsed.data.note }).eq('id', noteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteClaimNote(noteId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const supabase = await createClient()
  const { data: note } = await supabase.from('insurance_claim_notes').select('claim_id, note').eq('id', noteId).maybeSingle()
  if (!note) return { success: false, error: 'Note not found' }

  const { error } = await supabase.from('insurance_claim_notes').delete().eq('id', noteId)
  if (error) return { success: false, error: error.message }

  // The note row is gone, so log its deletion to audit_log — otherwise this
  // action would leave no trace at all in the claim's history feed.
  await logAudit(actor.id, 'delete_note', 'insurance_claim', note.claim_id as string, { note: note.note })
  return { success: true }
}

/** Merged, chronological timeline of enquiry notes + system audit entries for one claim. */
export async function listClaimHistory(claimId: string): Promise<InsuranceClaimHistoryEntry[]> {
  const supabase = await createClient()
  const [notesRes, auditRes] = await Promise.all([
    supabase.from('insurance_claim_notes')
      .select('id, stage, note, created_at, author:profiles(full_name)')
      .eq('claim_id', claimId),
    supabase.from('audit_logs')
      .select('id, action, meta, created_at, actor:profiles(full_name)')
      .eq('entity', 'insurance_claim').eq('entity_id', claimId),
  ])

  const notes: InsuranceClaimHistoryEntry[] = ((notesRes.data ?? []) as unknown as Array<{
    id: string; stage: string; note: string; created_at: string; author: { full_name: string } | null
  }>).map((n) => ({
    id: n.id, kind: 'note', stage: n.stage, action: null, note: n.note,
    actor_name: n.author?.full_name ?? null, created_at: n.created_at,
  }))

  const auditEntries: InsuranceClaimHistoryEntry[] = ((auditRes.data ?? []) as unknown as Array<{
    id: string; action: string; created_at: string; actor: { full_name: string } | null
  }>).map((a) => ({
    id: a.id, kind: 'audit', stage: null, action: a.action, note: null,
    actor_name: a.actor?.full_name ?? null, created_at: a.created_at,
  }))

  return [...notes, ...auditEntries].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** Payments posted against this claim's encounter at settlement — the 'insurance' method rows advanceClaim wrote. */
export async function listClaimSettlementPayments(
  claimId: string
): Promise<Array<{ id: string; amount: number; bill_id: string; created_at: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payments')
    .select('id, amount, bill_id, created_at')
    .eq('reference', `Claim ${claimId}`)
    .eq('method', 'insurance')
  return (data ?? []) as Array<{ id: string; amount: number; bill_id: string; created_at: string }>
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

// ── Policy documents (Stage 1 — scanned copy of the policy / insurance card) ───

export async function attachPolicyDocument(params: {
  policyId: string; patientId: string; title: string; filePath: string
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('patient_documents').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    patient_id: params.patientId,
    policy_id: params.policyId,
    title: params.title,
    category: 'insurance',
    file_path: params.filePath,
    uploaded_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'attach_doc', 'insurance_policy', params.policyId, { title: params.title })
  return { success: true }
}

export async function listPolicyDocuments(policyId: string): Promise<Array<{ id: string; title: string; file_path: string; uploaded_at: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patient_documents').select('id, title, file_path, uploaded_at')
    .eq('policy_id', policyId).order('uploaded_at', { ascending: false })
  return (data ?? []) as Array<{ id: string; title: string; file_path: string; uploaded_at: string }>
}

// ── Bank accounts master (settlement destination) ───────────────────────────────

export async function listBankAccounts(): Promise<InsuranceBankAccount[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('insurance_bank_accounts').select('*').order('account_name')
  return (data ?? []) as InsuranceBankAccount[]
}

export async function upsertBankAccount(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const parsed = InsuranceBankAccountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const row = {
    tenant_id: actor.tenant_id, account_name: d.account_name, bank_name: d.bank_name ?? null,
    account_number: d.account_number ?? null, ifsc_code: d.ifsc_code ?? null, is_active: d.is_active,
  }
  const { error } = d.id
    ? await supabase.from('insurance_bank_accounts').update(row).eq('id', d.id)
    : await supabase.from('insurance_bank_accounts').insert({ id: crypto.randomUUID(), ...row })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, d.id ? 'update' : 'create', 'insurance_bank_account', d.id ?? d.account_name, { account_name: d.account_name })
  return { success: true }
}

export async function deleteBankAccount(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_bank_accounts').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'insurance_bank_account', id, {})
  return { success: true }
}

// ── Appeal / re-open a rejected claim ───────────────────────────────────────────

export async function appealClaim(claimId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const supabase = await createClient()
  const { data: claim } = await supabase
    .from('insurance_claims').select('id, status, eligibility_status, admission_id, visit_id, bill_id').eq('id', claimId).maybeSingle()
  if (!claim) return { success: false, error: 'Claim not found' }
  if (claim.status !== 'rejected') return { success: false, error: 'Only a rejected claim can be appealed' }
  // Reopening next to a newer claim on the same encounter would count cover twice.
  if (await otherLiveClaimOnEncounter(supabase, claim as { id: string; admission_id: string | null; visit_id: string | null; bill_id: string | null })) {
    return { success: false, error: 'A newer claim is already active for this encounter — continue that claim instead of appealing this one.' }
  }

  // Reopen to the right stage: an eligibility rejection returns to the
  // eligibility decision; a claim-stage rejection returns to submitted.
  const update = claim.eligibility_status === 'rejected'
    ? { status: 'awaiting_eligibility', eligibility_status: 'pending', eligibility_decided_at: null, rejected_at: null }
    : { status: 'submitted', rejected_at: null }

  const { error } = await supabase.from('insurance_claims').update(update).eq('id', claimId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'appeal', 'insurance_claim', claimId, {})
  return { success: true }
}

// ── Agreed tariff / package master ──────────────────────────────────────────────

export async function listTariffPackages(): Promise<InsuranceTariffPackage[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('insurance_tariff_packages').select('*').order('package_name')
  return (data ?? []) as InsuranceTariffPackage[]
}

export async function upsertTariffPackage(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const parsed = TariffPackageSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const row = {
    tenant_id: actor.tenant_id, provider: d.provider ?? null, tpa_id: d.tpa_id ?? null,
    package_name: d.package_name, package_code: d.package_code ?? null, amount: d.amount, is_active: d.is_active,
  }
  const { error } = d.id
    ? await supabase.from('insurance_tariff_packages').update(row).eq('id', d.id)
    : await supabase.from('insurance_tariff_packages').insert({ id: crypto.randomUUID(), ...row })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, d.id ? 'update' : 'create', 'insurance_tariff_package', d.id ?? d.package_name, { amount: d.amount })
  return { success: true }
}

export async function deleteTariffPackage(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_tariff_packages').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'insurance_tariff_package', id, {})
  return { success: true }
}

// ── Remittance batches (bulk reconciliation) ────────────────────────────────────

export async function listRemittanceBatches(): Promise<InsuranceRemittanceBatch[]> {
  const supabase = await createClient()
  const { data: batches } = await supabase
    .from('insurance_remittance_batches').select('*').order('created_at', { ascending: false })
  const rows = (batches ?? []) as InsuranceRemittanceBatch[]
  if (rows.length === 0) return rows

  // Roll up how many claims are reconciled to each batch, and their settled total.
  const { data: claims } = await supabase
    .from('insurance_claims').select('remittance_batch_id, settled_amount')
    .in('remittance_batch_id', rows.map((b) => b.id))
  for (const b of rows) {
    const linked = (claims ?? []).filter((c) => c.remittance_batch_id === b.id)
    b.claim_count = linked.length
    b.reconciled_amount = linked.reduce((s, c) => s + ((c.settled_amount as number | null) ?? 0), 0)
  }
  return rows
}

export async function upsertRemittanceBatch(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const parsed = RemittanceBatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const row = {
    tenant_id: actor.tenant_id, reference: d.reference, insurer: d.insurer ?? null,
    total_amount: d.total_amount, received_date: d.received_date ?? null,
    account_id: d.account_id ?? null, notes: d.notes ?? null,
  }
  const { error } = d.id
    ? await supabase.from('insurance_remittance_batches').update(row).eq('id', d.id)
    : await supabase.from('insurance_remittance_batches').insert({ id: crypto.randomUUID(), created_by: actor.id, ...row })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, d.id ? 'update' : 'create', 'insurance_remittance_batch', d.id ?? d.reference, { total: d.total_amount })
  return { success: true }
}

export async function deleteRemittanceBatch(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  // Unlink any claims first so they return to the unreconciled pool.
  await supabase.from('insurance_claims').update({ remittance_batch_id: null }).eq('remittance_batch_id', id)
  const { error } = await supabase.from('insurance_remittance_batches').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'insurance_remittance_batch', id, {})
  return { success: true }
}

/** Settled claims and their current batch link — the working set for reconciliation. */
export async function listSettledClaimsForReconcile(): Promise<Array<{
  id: string; patient_name: string; settled_amount: number; settled_at: string | null; remittance_batch_id: string | null; provider: string | null
}>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims')
    .select('id, settled_amount, settled_at, remittance_batch_id, policy:insurance_policies(provider,patient:patients(full_name))')
    .eq('status', 'settled')
    .order('settled_at', { ascending: false })
    .limit(500)
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((c) => {
    const pol = c.policy as { provider?: string; patient?: { full_name?: string } } | null
    return {
      id: c.id as string,
      patient_name: pol?.patient?.full_name ?? '—',
      settled_amount: (c.settled_amount as number | null) ?? 0,
      settled_at: (c.settled_at as string | null) ?? null,
      remittance_batch_id: (c.remittance_batch_id as string | null) ?? null,
      provider: pol?.provider ?? null,
    }
  })
}

export async function assignClaimToBatch(claimId: string, batchId: string | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claims').update({ remittance_batch_id: batchId }).eq('id', claimId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Receivables roll-up ─────────────────────────────────────────────────────────

export async function getReceivables(): Promise<InsuranceReceivables> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims')
    .select('status, claim_amount, approved_amount, settled_amount, submitted_at, settled_at, created_at')
    .in('status', ['raised', 'submitted', 'approved', 'settled'])
    .limit(2000)

  const rows = data ?? []
  const now = Date.now()
  // First day of the current month in IST.
  const monthStart = `${istToday().slice(0, 8)}01T00:00:00+05:30`

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
    if (c.status === 'raised' || c.status === 'submitted') pending += claimAmt
    if (c.status === 'approved') {
      approved += apprAmt
      // Age approved (unsettled) receivables by submission date.
      const submitted = (c.submitted_at as string | null) ?? (c.created_at as string)
      const days = (now - new Date(submitted).getTime()) / 86400000
      const bucket = buckets.find((b) => days <= b.max)!
      bucket.amount += apprAmt; bucket.count += 1
    }
    if (c.status === 'settled' && c.settled_at && new Date(c.settled_at as string) >= new Date(monthStart)) {
      settledThisMonth += (c.settled_amount as number | null) ?? apprAmt
    }
  }

  return {
    pending, approved, settledThisMonth,
    agingBuckets: buckets.map((b) => ({ label: b.label, amount: b.amount, count: b.count })),
  }
}

/**
 * Eligibility-approved insurance receivable for an admission (covers balance
 * at discharge). Keyed off eligibility_status, not the final claim status —
 * the pre-authorization approval is what unlocks discharge without upfront
 * payment; the final claim only settles the money later, often after the
 * patient has already gone home.
 */
export async function getAdmissionInsuranceReceivable(admissionId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims')
    .select(INSURANCE_CREDIT_COLUMNS)
    .eq('admission_id', admissionId)
    .or('eligibility_status.eq.approved,status.eq.settled')
  return totalInsuranceCredit((data ?? []) as unknown as InsuranceCreditRow[])
}
