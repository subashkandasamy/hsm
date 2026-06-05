'use client'

import { useState, useRef } from 'react'
import { Upload, Image as ImageIcon } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Textarea from '@/components/ui/Textarea'
import { uploadReport } from '@/app/actions/radiology'
import { createClient } from '@/lib/supabase/client'
import type { RadiologyOrder } from '@/lib/types'

interface Props {
  open: boolean
  order: RadiologyOrder
  onClose: () => void
  onSuccess: () => void
}

export default function ReportEntryModal({ open, order, onClose, onSuccess }: Props) {
  const [report, setReport] = useState(order.report ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(order.image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    if (!report.trim()) { setError('Report text is required'); return }
    setUploading(true); setError(null)

    let imageUrl: string | null = order.image_url ?? null

    if (imageFile) {
      const supabase = createClient()
      const path = `${order.id}/${Date.now()}_${imageFile.name.replace(/\s+/g, '_')}`
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('radiology')
        .upload(path, imageFile, { upsert: true })

      if (uploadErr) {
        setError(`Image upload failed: ${uploadErr.message}. Report saved without image.`)
      } else {
        const { data: { publicUrl } } = supabase.storage.from('radiology').getPublicUrl(uploadData.path)
        imageUrl = publicUrl
      }
    }

    const result = await uploadReport(order.id, report, imageUrl)
    setUploading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose}
      title={`Report — ${order.test?.name} · ${order.patient?.full_name}`}
      maxWidth="38rem">
      <div className="space-y-4">
        <FormField label="Findings / Report" required>
          <Textarea value={report} onChange={(e) => setReport(e.target.value)}
            placeholder="Describe the findings in detail…"
            style={{ minHeight: '8rem' }} />
        </FormField>

        <FormField label="Image Upload" hint="JPEG, PNG, or PDF. Max 10 MB. Requires 'radiology' Storage bucket.">
          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center py-6 rounded-xl cursor-pointer"
            style={{ border: '2px dashed #E2E8F0', background: 'rgba(248,250,252,0.6)', transition: 'border-color 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}>
            {imagePreview && imagePreview.startsWith('blob:') ? (
              <div className="text-center">
                <ImageIcon className="w-8 h-8 mx-auto mb-2" style={{ color: '#0D9488' }} />
                <p className="text-sm font-medium" style={{ color: '#0D9488' }}>{imageFile?.name}</p>
                <p className="text-xs" style={{ color: '#94A3B8' }}>Click to change</p>
              </div>
            ) : imagePreview ? (
              <div className="text-center">
                <p className="text-xs mb-2" style={{ color: '#64748B' }}>Existing image on file</p>
                <a href={imagePreview} target="_blank" rel="noreferrer"
                  className="text-xs" style={{ color: '#0D9488' }} onClick={(e) => e.stopPropagation()}>
                  View current image →
                </a>
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Click area to replace</p>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: '#94A3B8' }} />
                <p className="text-sm" style={{ color: '#64748B' }}>Click to upload image</p>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>JPEG · PNG · PDF</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
        </FormField>

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={handleSave} disabled={uploading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: uploading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? 'Saving…' : 'Save Report'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
