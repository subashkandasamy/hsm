'use client'

import { Printer, ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DateText from '@/components/ui/DateText'
import type { RadiologyOrder } from '@/lib/types'

interface Props {
  order: RadiologyOrder
  onClose: () => void
}

export default function RadiologyReportModal({ order, onClose }: Props) {
  return (
    <Modal open onClose={onClose} title={`Radiology Report — ${order.patient?.full_name ?? '—'}`} maxWidth="44rem">
      <div className="space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl p-3.5"
          style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <Meta label="Patient" value={order.patient?.full_name ?? '—'} />
          <Meta label="UHID" value={order.patient?.uhid ?? '—'} mono />
          <Meta label="Study" value={order.test?.name ?? '—'} />
          <Meta label="Modality" value={order.test?.modality?.toUpperCase() ?? '—'} />
          <Meta label="Ordered By" value={order.orderer?.full_name ?? '—'} />
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wide" style={{ color: '#94A3B8', minWidth: '4.5rem' }}>Reported</span>
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              {order.reported_at ? <DateText date={order.reported_at} /> : '—'}
            </span>
          </div>
        </div>

        {/* Report body */}
        <div>
          <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: '#0F766E', fontWeight: 700, letterSpacing: '0.5px' }}>
            Findings / Impression
          </p>
          <div className="rounded-xl p-4 text-sm whitespace-pre-wrap"
            style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#334155', minHeight: '6rem', lineHeight: 1.6 }}>
            {order.report?.trim() ? order.report : <span style={{ color: '#94A3B8' }}>No report text recorded.</span>}
          </div>
        </div>

        {order.image_url && (
          <a href={order.image_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: '#0D9488' }}>
            <ExternalLink className="w-3.5 h-3.5" /> View attached image
          </a>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          <a href={`/print/radiology/${order.id}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', textDecoration: 'none' }}>
            <Printer className="w-3.5 h-3.5" /> Print Report
          </a>
        </div>
      </div>
    </Modal>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: '#94A3B8', minWidth: '4.5rem' }}>{label}</span>
      <span className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: '#0F172A' }}>{value}</span>
    </div>
  )
}
