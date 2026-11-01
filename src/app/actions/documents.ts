'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { hasPermission, requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { requireTenantId } from '@/lib/tenant'
import type { PatientDocument, DocumentCategory } from '@/lib/types'

const BUCKET = 'documents'
const SIGNED_URL_EXPIRY = 60 * 60 // 1 hour

export async function listDocuments(patientId: string): Promise<PatientDocument[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patient_documents')
    .select('*, uploader:profiles(id, full_name)')
    .eq('patient_id', patientId)
    .order('uploaded_at', { ascending: false })
  return (data ?? []) as unknown as PatientDocument[]
}

// Returns a signed upload URL so the client can upload directly to Supabase Storage.
// The file path is returned so the client can pass it back to saveDocumentRecord.
export async function getUploadUrl(
  patientId: string,
  filename: string
): Promise<{ success: true; signedUrl: string; filePath: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:document:upload')

  const tenantId = await requireTenantId()
  const ext = filename.split('.').pop() ?? 'bin'
  const filePath = `tenants/${tenantId}/patients/${patientId}/${crypto.randomUUID()}.${ext}`

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUploadUrl(filePath)

  if (error || !data) return { success: false, error: error?.message ?? 'Failed to create upload URL' }

  return { success: true, signedUrl: data.signedUrl, filePath }
}

// Called by the client after a successful direct upload to record the metadata.
export async function saveDocumentRecord(input: {
  patientId: string
  title: string
  category: DocumentCategory
  filePath: string
}): Promise<{ success: true; document: PatientDocument } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:document:upload')

  if (!input.title.trim()) return { success: false, error: 'Title is required' }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('patient_documents').insert({
    id,
    tenant_id: actor.tenant_id,
    patient_id: input.patientId,
    title: input.title.trim(),
    category: input.category,
    file_path: input.filePath,
    uploaded_by: actor.id,
  })

  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'patient_document', id, {
    patient_id: input.patientId, title: input.title, category: input.category,
  })

  const { data } = await supabase
    .from('patient_documents')
    .select('*, uploader:profiles(id, full_name)')
    .eq('id', id)
    .single()
  return { success: true, document: data as unknown as PatientDocument }
}

// Returns a short-lived signed read URL for a document.
export async function getDocumentUrl(
  id: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  // Tenancy was already safe here — the row is read through the user's client,
  // so RLS applies — but no PERMISSION was checked, so any authenticated user
  // in the hospital could open any patient's uploaded document given its id.
  // There was no permission to check: only upload and delete existed.
  //
  // 'emr:file:read' is granted to admin, doctor, nurse, lab_tech and
  // receptionist. The front desk is included on the hospital's own answer —
  // they print reports and hand them to patients at the counter. Accountant,
  // pharmacist and hr are not.
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'emr:file:read')) {
    return { success: false, error: 'You do not have permission to open patient documents.' }
  }

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('patient_documents')
    .select('file_path')
    .eq('id', id)
    .single()

  if (!doc) return { success: false, error: 'Document not found' }

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path as string, SIGNED_URL_EXPIRY)

  if (error || !data) return { success: false, error: error?.message ?? 'Failed to create URL' }
  return { success: true, url: data.signedUrl }
}

export async function deleteDocument(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:document:delete')

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('patient_documents')
    .select('file_path, patient_id, title')
    .eq('id', id)
    .single()

  if (!doc) return { success: false, error: 'Document not found' }

  // Delete from Storage
  const service = createServiceClient()
  await service.storage.from(BUCKET).remove([doc.file_path as string])

  // Delete record
  const { error } = await supabase.from('patient_documents').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'patient_document', id, {
    patient_id: doc.patient_id, title: doc.title,
  })
  return { success: true }
}
