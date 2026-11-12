'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
  /** Optional sticky footer — rendered below a separator, always visible on mobile */
  footer?: ReactNode
}

export default function Modal({ open, onClose, title, children, maxWidth = '32rem', footer }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4"
      style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="glass-card w-full flex flex-col rounded-t-2xl md:rounded-2xl"
        style={{ maxWidth, maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: '#E2E8F0' }}>
          {/* Drag handle on mobile */}
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full md:hidden"
            style={{ background: '#CBD5E1' }} />
          <h2 className="text-base font-semibold" style={{ color: '#0F172A' }}>{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all flex-shrink-0"
            style={{ color: '#94A3B8' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5 overscroll-contain">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div className="flex-shrink-0 px-5 py-4 border-t" style={{ borderColor: '#E2E8F0' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
