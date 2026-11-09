'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Trash2, Eye, X, Camera } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import EmptyState from '@/components/ui/EmptyState'
import DateText from '@/components/ui/DateText'
import {
  getUploadUrl, saveDocumentRecord, getDocumentUrl, deleteDocument,
} from '@/app/actions/documents'
import type { PatientDocument, DocumentCategory } from '@/lib/types'

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  external_report: 'External Report',
  referral:        'Referral Letter',
  consent_form:    'Consent Form',
  identity:        'Identity Document',
  insurance:       'Insurance Document',
  other:           'Other',
}

const CATEGORY_STYLE: Record<DocumentCategory, { bg: string; color: string }> = {
  external_report: { bg: '#EFF6FF', color: '#1D4ED8' },
  referral:        { bg: '#F0FDF4', color: '#15803D' },
  consent_form:    { bg: '#FEF3C7', color: '#B45309' },
  identity:        { bg: '#F3E8FF', color: '#7C3AED' },
  insurance:       { bg: '#E0F2FE', color: '#0369A1' },
  other:           { bg: '#F1F5F9', color: '#475569' },
}

interface Props {
  patientId: string
  initialDocuments: PatientDocument[]
  canUpload: boolean
  canDelete: boolean
}

export default function DocumentsTab({ patientId, initialDocuments, canUpload, canDelete }: Props) {
  const [documents, setDocuments] = useState<PatientDocument[]>(initialDocuments)
  const [form, setForm] = useState({ title: '', category: 'other' as DocumentCategory })
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerTitle, setViewerTitle] = useState<string>('')
  // Set when the file is on the hospital computer with no internet link: a
  // secure page cannot embed a local address, so it opens in a new tab.
  const [viewerLocal, setViewerLocal] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null)
  const [isNative, setIsNative] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    import('@capacitor/core')
      .then(({ Capacitor }) => setIsNative(Capacitor.isNativePlatform()))
      .catch(() => {})
  }, [])

  async function handleCameraCapture() {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      })
      if (!photo.dataUrl) return
      // Convert data URL to File object
      const res = await fetch(photo.dataUrl)
      const blob = await res.blob()
      const filename = `photo_${Date.now()}.jpg`
      setFile(new File([blob], filename, { type: 'image/jpeg' }))
      setUploadError(null)
    } catch (e: unknown) {
      if ((e as { message?: string })?.message !== 'User cancelled photos app') {
        setUploadError('Camera access failed. Check permissions.')
      }
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setUploadError('Please select a file'); return }
    if (!form.title.trim()) { setUploadError('Title is required'); return }

    setUploading(true)
    setUploadError(null)
    setUploadProgress('Requesting upload URL…')

    // 1. Get signed upload URL from server
    const urlResult = await getUploadUrl(patientId, file.name, file.size)
    if (!urlResult.success) {
      setUploading(false)
      setUploadError(urlResult.error)
      setUploadProgress(null)
      return
    }

    setUploadProgress('Uploading file…')

    // 2. Upload directly to Supabase Storage
    const uploadResp = await fetch(urlResult.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })

    if (!uploadResp.ok) {
      setUploading(false)
      setUploadError('File upload failed — please try again')
      setUploadProgress(null)
      return
    }

    setUploadProgress('Saving record…')

    // 3. Save metadata record
    const saveResult = await saveDocumentRecord({
      patientId,
      title: form.title.trim(),
      category: form.category,
      filePath: urlResult.filePath,
    })

    setUploading(false)
    setUploadProgress(null)

    if (!saveResult.success) {
      setUploadError(saveResult.error)
      return
    }

    setDocuments((prev) => [saveResult.document, ...prev])
    setForm({ title: '', category: 'other' })
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleView(doc: PatientDocument) {
    setLoadingViewId(doc.id)
    setViewError(null)
    const result = await getDocumentUrl(doc.id)
    setLoadingViewId(null)
    if (result.success) {
      setViewerUrl(result.url)
      setViewerTitle(doc.title)
      setViewerLocal(result.where === 'hospital')
    } else {
      setViewError(result.error)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const result = await deleteDocument(id)
    setDeletingId(null)
    if (result.success) setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  const isImage = (url: string) => /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(url)

  return (
    <div className="space-y-4">
      {/* Upload form */}
      {canUpload && (
        <GlassCard className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
            Upload Document
          </p>
          <form onSubmit={handleUpload} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Title" htmlFor="doc_title" required>
                <Input
                  id="doc_title" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. MRI Brain Report"
                  required
                />
              </FormField>
              <FormField label="Category" htmlFor="doc_category">
                <Select id="doc_category" value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as DocumentCategory }))}>
                  {(Object.entries(CATEGORY_LABELS) as [DocumentCategory, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            {/* File picker */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748B' }}>
                File <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer min-h-[52px]"
                style={{ border: '2px dashed #E2E8F0', background: 'rgba(248,250,252,0.8)' }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-5 h-5 flex-shrink-0" style={{ color: '#94A3B8' }} />
                <span className="text-sm" style={{ color: file ? '#0F172A' : '#94A3B8' }}>
                  {file ? file.name : 'Click to select PDF or image'}
                </span>
                {file && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="ml-auto p-1 rounded" style={{ color: '#94A3B8' }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input
                ref={fileRef} type="file" className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {/* Native-only: Take Photo option */}
              {isNative && (
                <button
                  type="button"
                  onClick={handleCameraCapture}
                  className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl text-sm font-medium min-h-[40px]"
                  style={{ background: 'rgba(13,148,136,0.07)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)', cursor: 'pointer' }}
                >
                  <Camera className="w-4 h-4" /> Take Photo
                </button>
              )}
            </div>

            {uploadError && (
              <p className="text-sm" style={{ color: '#DC2626' }}>{uploadError}</p>
            )}
            {uploadProgress && (
              <p className="text-sm" style={{ color: '#0D9488' }}>{uploadProgress}</p>
            )}

            <button
              type="submit" disabled={uploading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold min-h-[44px]"
              style={{ background: uploading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer' }}
            >
              <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
          </form>
        </GlassCard>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <EmptyState title="No documents uploaded" description="External reports, referral letters, and consent forms uploaded here." />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const catStyle = CATEGORY_STYLE[doc.category]
            return (
              <GlassCard key={doc.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: catStyle.bg, color: catStyle.color }}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{doc.title}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: catStyle.bg, color: catStyle.color }}>
                        {CATEGORY_LABELS[doc.category]}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                      <DateText date={doc.uploaded_at} />
                      {doc.uploader && ` · ${(doc.uploader as { full_name: string }).full_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleView(doc)}
                      disabled={loadingViewId === doc.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium min-h-[36px]"
                      style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {loadingViewId === doc.id ? '…' : 'View'}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        className="p-2 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                        aria-label="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {viewError && (
        <p className="text-xs mt-2 rounded-lg px-3 py-2"
          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          {viewError}
        </p>
      )}

      {/* Viewer modal */}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewerUrl(null) }}
        >
          <div className="w-full sm:w-auto sm:max-w-3xl h-[90vh] sm:h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ background: '#fff' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid #E2E8F0' }}>
              <p className="text-sm font-semibold truncate mr-4" style={{ color: '#0F172A' }}>{viewerTitle}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg font-medium min-h-[36px] flex items-center"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                  Open in new tab
                </a>
                <button onClick={() => setViewerUrl(null)}
                  className="p-2 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
                  style={{ color: '#64748B', background: '#F1F5F9' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {viewerLocal ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm" style={{ color: '#475569' }}>
                    This document is kept on your hospital&apos;s computer. It opens in a new tab,
                    on the hospital network.
                  </p>
                  <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: '#0D9488', color: '#fff' }}>
                    Open document
                  </a>
                </div>
              ) : isImage(viewerUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewerUrl} alt={viewerTitle} className="w-full h-full object-contain" />
              ) : (
                <iframe src={viewerUrl} className="w-full h-full border-0" title={viewerTitle} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
