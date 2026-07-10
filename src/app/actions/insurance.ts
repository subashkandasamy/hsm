'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  InsurancePolicySchema, InsuranceClaimSchema, AdvanceClaimSchema,
} from '@/lib/schemas'
import type { InsurancePolicy, InsuranceClaim, InsuranceClaimStatus } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const VALID_TRANSITIONS: Record<InsuranceClaimStatus, InsuranceClaimStatus[]> = {
  draft:     ['preauth', 'submitted'],
  preauth:   ['submitted'],
  submitted: ['approved', 'rejected'],
  approved:  ['settled'],
  rejected:  [],
  settled:   [],
}

// ---- Policies ----

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
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'insurance_policy', id, {
    provider: parsed.data.provider, policy_no: parsed.data.policy_no,
  })

  const { data: policy } = await supabase
    .from('insurance_policies')
    .select('*, patient:patients(id,full_name,uhid)')
    .eq('id', id).single()

  return { success: true, policy: policy as unknown as InsurancePolicy }
}

export async function listPolicies(patientId: string): Promise<InsurancePolicy[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_policies')
    .select('*, patient:patients(id,full_name,uhid)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as InsurancePolicy[]
}

// ---- Claims ----

export async function createClaim(
  input: Record<string, unknown>
): Promise<{ success: true; claimId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'insurance:write')

  const parsed = InsuranceClaimSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('insurance_claims').insert({
    id,
    tenant_id:    actor.tenant_id,
    bill_id:      parsed.data.bill_id,
    policy_id:    parsed.data.policy_id,
    claim_amount: parsed.data.claim_amount,
    status:       'draft',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'insurance_claim', id, {
    bill_id: parsed.data.bill_id, claim_amount: parsed.data.claim_amount,
  })
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
    .select('status, bill_id, claim_amount, approved_amount')
    .eq('id', id).single()

  if (!claim) return { success: false, error: 'Claim not found' }

  const currentStatus = claim.status as InsuranceClaimStatus
  const nextStatus = parsed.data.next_status
  const allowed = VALID_TRANSITIONS[currentStatus] ?? []

  if (!allowed.includes(nextStatus)) {
    return { success: false, error: `Cannot transition from ${currentStatus} to ${nextStatus}` }
  }

  const updateData: Record<string, unknown> = { status: nextStatus }

  if (nextStatus === 'submitted') {
    updateData.submitted_at = new Date().toISOString()
  }

  if (nextStatus === 'approved' || nextStatus === 'settled') {
    if (parsed.data.approved_amount != null) {
      updateData.approved_amount = parsed.data.approved_amount
    }
  }

  if (parsed.data.remarks != null) {
    updateData.remarks = parsed.data.remarks
  }

  const { error } = await supabase
    .from('insurance_claims').update(updateData).eq('id', id)
  if (error) return { success: false, error: error.message }

  // On settled: record an insurance payment against the bill
  if (nextStatus === 'settled') {
    const approvedAmt =
      (parsed.data.approved_amount as number | undefined) ??
      (claim.approved_amount as number | undefined) ??
      (claim.claim_amount as number)

    if (approvedAmt > 0) {
      // Import recordPayment logic inline to avoid circular dependency
      const { data: bill } = await supabase
        .from('bills').select('total, paid, status').eq('id', claim.bill_id as string).single()

      if (bill && (bill.status as string) !== 'cancelled') {
        const { error: payErr } = await supabase.from('payments').insert({
          id: crypto.randomUUID(),
          tenant_id: actor.tenant_id,
          bill_id: claim.bill_id,
          amount: approvedAmt,
          method: 'insurance',
          reference: `Claim ${id}`,
          received_by: actor.id,
        })
        if (!payErr) {
          const newPaid = (bill.paid as number) + approvedAmt
          const newStatus = newPaid >= (bill.total as number) ? 'paid' : 'partial'
          await supabase.from('bills').update({ paid: newPaid, status: newStatus })
            .eq('id', claim.bill_id as string)
        }
      }
    }
  }

  await logAudit(actor.id, 'advance', 'insurance_claim', id, {
    from: currentStatus, to: nextStatus,
  })
  return { success: true }
}

export async function getClaim(id: string): Promise<InsuranceClaim | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insurance_claims')
    .select(`*,
      bill:bills(id,bill_no,total,paid,status),
      policy:insurance_policies(id,provider,policy_no),
      patient:insurance_policies!inner(patient:patients(id,full_name,uhid))`)
    .eq('id', id).single()
  return data as unknown as InsuranceClaim | null
}

export async function listClaims(filters?: { status?: string }): Promise<InsuranceClaim[]> {
  const supabase = await createClient()
  let q = supabase
    .from('insurance_claims')
    .select(`*,
      bill:bills(id,bill_no,total,paid,status),
      policy:insurance_policies(id,provider,policy_no,patient:patients(id,full_name,uhid))`)
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)

  const { data } = await q.limit(300)
  return (data ?? []) as unknown as InsuranceClaim[]
}
