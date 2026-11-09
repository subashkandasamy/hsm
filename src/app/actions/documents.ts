'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { hasPermission, requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { requireTenantId } from '@/lib/tenant'
import { DOCUMENT_UPLOAD, checkUploadName, checkUploadSize } from '@/lib/upload/allowedFiles'
import type { PatientDocument, DocumentCategory } from '@/lib/types'
import { hospitalFileLink, queueForHospitalComputer } from '@/lib/localFiles'

const BUCKET = 'documents'
const SIGNED_URL_EXPIRY = 60 * 60 // 1 hour

export async function listDocuments(patientId: string): Promise<PatientDocument[]> {
  // Opening a document was gated; LISTING them was not (F-65) — and a document
  // list is itself clinical: "HIV ELISA report.pdf" against a patient's name
  // discloses the thing the file contains without opening it.
  //
  // Same permission as getDocumentUrl, deliberately: if you may not open them,
  // you may not enumerate them. Non-throwing, unlike the MLC reads, because
  // this is called from the patient detail page, which pharmacists can open —
  // they hold patients:read but not emr:file:read. Throwing would crash the
  // page rather than hide a section. The cost is that an empty list reads the
  // same as "no documents"; the alternative is a UI change to the page.
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'emr:file:read')) return []

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
  filename: string,
  sizeBytes?: number,
): Promise<{ success: true; signedUrl: string; filePath: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:document:upload')

  // The bucket's own limits are the real control (set in 0255); this is here so
  // the person uploading gets a sentence they can act on rather than a storage
  // error after the fact (F-58). `ext` below is one of OUR strings, not the tail
  // of the client's filename, which the old code interpolated straight into the
  // object path.
  const checked = checkUploadName(filename, DOCUMENT_UPLOAD)
  if (!checked.ok) return { success: false, error: checked.error }
  const tooBig = checkUploadSize(sizeBytes, DOCUMENT_UPLOAD)
  if (tooBig) return { success: false, error: tooBig.error }

  const tenantId = await requireTenantId()
  const filePath = `tenants/${tenantId}/patients/${patientId}/${crypto.randomUUID()}.${checked.ext}`

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
  // Moves to the hospital computer if this hospital keeps uploads there (0275).
  await queueForHospitalComputer(actor.tenant_id, 'documents', input.filePath, 'patient_document')

  const { data } = await supabase
    .from('patient_documents')
    .select('*, uploader:profiles(id, full_name)')
    .eq('id', id)
    .single()
  return { success: true, document: data as unknown as PatientDocument }
}

// Returns a short-lived read URL for a document — from the cloud, or from the
// hospital computer once it has moved there (0275). `where` is set only for the
// latter: 'hospital' means the link opens on the hospital network only, so the
// page opens it in a new tab instead of embedding it.
export async function getDocumentUrl(
  id: string
): Promise<{ success: true; url: string; where?: 'hospital' | 'internet' } | { success: false; error: string }> {
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

  const kept = await hospitalFileLink(actor.tenant_id, 'documents', doc.file_path as string)
  if (kept.state === 'computer') {
    if (!kept.url || !kept.where) {
      return { success: false, error: 'This document is kept on the hospital computer, which cannot be reached right now.' }
    }
    return { success: true, url: kept.url, where: kept.where }
  }

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
