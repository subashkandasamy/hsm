'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { getUploadUrl } from '@/app/actions/documents'
import { attachSignedUpload } from '@/app/actions/ipdDeclaration'

interface Props {
  admissionId: string
  patientId: string
  patientName: string
  onClose: () => void
  onDone: () => void
}

export default function UploadDeclarationModal({ admissionId, patientId, patientName, onClose, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('Signed Treatment Declaration')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) { setError('Please select the signed document'); return }
    if (!title.trim()) { setError('Title is required'); return }

    setUploading(true); setError(null); setProgress('Requesting upload URL…')

    const urlResult = await getUploadUrl(patientId, file.name, file.size)
    if (!urlResult.success) { setUploading(false); setError(urlResult.error); setProgress(null); return }

    setProgress('Uploading file…')
    const uploadResp = await fetch(urlResult.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!uploadResp.ok) { setUploading(false); setError('File upload failed — please try again'); setProgress(null); return }

    setProgress('Saving…')
    const res = await attachSignedUpload({ admissionId, filePath: urlResult.filePath, title: title.trim() })
    setUploading(false); setProgress(null)
    if (!res.success) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`Upload Signed Declaration — ${patientName}`} maxWidth="28rem">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: '#64748B' }}>
          Attach the scanned or photographed copy of the physically signed declaration to clear the pending-upload status.
        </p>
        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Title</label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>File</label>
          <input
            ref={fileRef} type="file" accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

        {progress && <p className="text-xs" style={{ color: '#94A3B8' }}>{progress}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm"
            style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>Cancel</button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: uploading ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
        </div>
      </div>
    </Modal>
  )
}
