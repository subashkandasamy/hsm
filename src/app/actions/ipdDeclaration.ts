'use server'

import { createClient } from '@/lib/supabase/server'
import { queueForHospitalComputer } from '@/lib/localFiles'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { DEFAULT_DECLARATION_TEMPLATE } from '@/lib/ipdDeclarationTemplate'
import type { IpdDeclaration, IpdDeclarationSignerRelationship } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function getDeclaration(admissionId: string): Promise<IpdDeclaration | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_declarations')
    .select('*')
    .eq('admission_id', admissionId)
    .maybeSingle()
  return data as IpdDeclaration | null
}

// Bulk lookup for list pages — avoids one query per row.
export async function listDeclarationsForAdmissions(
  admissionIds: string[]
): Promise<Record<string, IpdDeclaration>> {
  if (admissionIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_declarations')
    .select('*')
    .in('admission_id', admissionIds)

  const map: Record<string, IpdDeclaration> = {}
  for (const row of (data ?? []) as unknown as IpdDeclaration[]) map[row.admission_id] = row
  return map
}

// Blocking gate — call first in every clinical IPD action. Not the same
// permission/insurance check as billing gates: this is purely "has the
// legal consent+liability declaration been signed (or manually overridden)".
export async function assertTreatmentStarted(
  admissionId: string,
  opts: { allowDischarged?: boolean } = {},
): Promise<SimpleResult> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admissions')
    .select('treatment_started_at, status')
    .eq('id', admissionId)
    .maybeSingle()

  // A closed stay takes no new orders, requests or charges. Charting what
  // already happened (a dose given before discharge, a late note) still may —
  // those callers pass allowDischarged.
  if (data && data.status !== 'admitted' && !opts.allowDischarged) {
    return { success: false, error: 'This patient has been discharged — nothing new can be ordered on this admission.' }
  }

  if (!data?.treatment_started_at) {
    return {
      success: false,
      error: 'Treatment declaration has not been signed for this admission. Go to the IPD list and complete "Start Treatment" first.',
    }
  }
  return { success: true }
}

async function currentTemplateText(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string): Promise<string> {
  const { data } = await supabase
    .from('ipd_billing_config')
    .select('declaration_template')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return (data?.declaration_template as string | undefined)?.trim() || DEFAULT_DECLARATION_TEMPLATE
}

export async function signDeclarationDigitally(input: {
  admissionId: string
  signerName: string
  signerRelationship: IpdDeclarationSignerRelationship
  signatureData?: string | null
}): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:notes')

  const signerName = input.signerName.trim()
  if (!signerName) return { success: false, error: 'Signer name is required' }

  const supabase = await createClient()
  const { data: admission } = await supabase
    .from('admissions')
    .select('id, status')
    .eq('id', input.admissionId)
    .maybeSingle()
  if (!admission) return { success: false, error: 'Admission not found' }

  const snapshot = await currentTemplateText(supabase, actor.tenant_id)
  const now = new Date().toISOString()

  const { error } = await supabase.from('ipd_declarations').upsert({
    tenant_id:                  actor.tenant_id,
    admission_id:                input.admissionId,
    status:                      'signed',
    sign_method:                 'digital',
    signer_name:                 signerName,
    signer_relationship:         input.signerRelationship,
    signature_data:              input.signatureData ?? null,
    declaration_text_snapshot:   snapshot,
    signed_at:                   now,
    created_by:                  actor.id,
  }, { onConflict: 'admission_id' })
  if (error) return { success: false, error: error.message }

  const { error: admErr } = await supabase
    .from('admissions')
    .update({ treatment_started_at: now })
    .eq('id', input.admissionId)
  if (admErr) return { success: false, error: admErr.message }

  await logAudit(actor.id, 'sign_declaration', 'admission', input.admissionId, { method: 'digital', signerName })
  return { success: true }
}

export async function markManualPendingUpload(input: {
  admissionId: string
  signerName: string
  signerRelationship: IpdDeclarationSignerRelationship
}): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:notes')

  const signerName = input.signerName.trim()
  if (!signerName) return { success: false, error: 'Signer name is required' }

  const supabase = await createClient()
  const { data: admission } = await supabase
    .from('admissions')
    .select('id, status')
    .eq('id', input.admissionId)
    .maybeSingle()
  if (!admission) return { success: false, error: 'Admission not found' }

  const snapshot = await currentTemplateText(supabase, actor.tenant_id)
  const now = new Date().toISOString()

  const { error } = await supabase.from('ipd_declarations').upsert({
    tenant_id:                  actor.tenant_id,
    admission_id:                input.admissionId,
    status:                      'manual_pending_upload',
    sign_method:                 'physical_upload',
    signer_name:                 signerName,
    signer_relationship:         input.signerRelationship,
    declaration_text_snapshot:   snapshot,
    marked_manual_by:            actor.id,
    marked_manual_at:            now,
    created_by:                  actor.id,
  }, { onConflict: 'admission_id' })
  if (error) return { success: false, error: error.message }

  const { error: admErr } = await supabase
    .from('admissions')
    .update({ treatment_started_at: now })
    .eq('id', input.admissionId)
  if (admErr) return { success: false, error: admErr.message }

  await logAudit(actor.id, 'mark_declaration_manual', 'admission', input.admissionId, { signerName })
  return { success: true }
}

export async function attachSignedUpload(input: {
  admissionId: string
  filePath: string
  title: string
}): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:document:upload')

  const supabase = await createClient()
  const { data: declaration } = await supabase
    .from('ipd_declarations')
    .select('id, status')
    .eq('admission_id', input.admissionId)
    .maybeSingle()
  if (!declaration) return { success: false, error: 'No declaration found for this admission' }
  if (declaration.status === 'signed') return { success: false, error: 'Declaration is already marked signed' }

  const { data: admission } = await supabase
    .from('admissions')
    .select('patient_id')
    .eq('id', input.admissionId)
    .maybeSingle()
  if (!admission) return { success: false, error: 'Admission not found' }

  const docId = crypto.randomUUID()
  const { error: docErr } = await supabase.from('patient_documents').insert({
    id:          docId,
    tenant_id:   actor.tenant_id,
    patient_id:  admission.patient_id,
    title:       input.title.trim() || 'Signed Treatment Declaration',
    category:    'consent_form',
    file_path:   input.filePath,
    uploaded_by: actor.id,
  })
  if (docErr) return { success: false, error: docErr.message }

  const { error } = await supabase
    .from('ipd_declarations')
    .update({ document_id: docId, status: 'signed' })
    .eq('id', declaration.id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'attach_declaration_upload', 'admission', input.admissionId, { docId })
  // Moves to the hospital computer if this hospital keeps uploads there (0275).
  await queueForHospitalComputer(actor.tenant_id, 'documents', input.filePath, 'ipd_declaration')
  return { success: true }
}
