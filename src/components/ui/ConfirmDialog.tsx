'use client'

import Modal from './Modal'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  loading?: boolean
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const confirmStyle = confirmVariant === 'danger'
    ? { background: '#DC2626', color: '#fff' }
    : { background: '#0D9488', color: '#fff' }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="24rem">
      <div className="flex gap-4">
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: '#FEE2E2', border: '1px solid #FECACA' }}
        >
          <AlertTriangle className="w-5 h-5" style={{ color: '#DC2626' }} />
        </div>
        <p className="text-sm pt-1" style={{ color: '#475569' }}>{description}</p>
      </div>

      <div className="flex gap-3 mt-6 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ ...confirmStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer', border: 'none' }}
        >
          {loading ? 'Processing…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
