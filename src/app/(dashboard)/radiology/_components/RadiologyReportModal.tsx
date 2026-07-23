'use client'

import { useEffect, useState } from 'react'
import { Printer, ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DateText from '@/components/ui/DateText'
import { getRadiologyImageUrl } from '@/app/actions/radiology'
import type { RadiologyOrder } from '@/lib/types'

interface Props {
  order: RadiologyOrder
  onClose: () => void
}

export default function RadiologyReportModal({ order, onClose }: Props) {
  const [image, setImage] = useState<{ url: string | null; isPdf: boolean } | null>(null)
  const [loadingImage, setLoadingImage] = useState(!!order.image_url)

  useEffect(() => {
    let active = true
    if (!order.image_url) { setLoadingImage(false); return }
    getRadiologyImageUrl(order.id).then((res) => {
      if (active) { setImage(res); setLoadingImage(false) }
    })
    return () => { active = false }
  }, [order.id, order.image_url])

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

        {/* Attached scan image */}
        {order.image_url && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: '#0F766E', fontWeight: 700, letterSpacing: '0.5px' }}>
              Scan Image
            </p>
            {loadingImage ? (
              <p className="text-sm" style={{ color: '#94A3B8' }}>Loading image…</p>
            ) : !image?.url ? (
              <p className="text-sm" style={{ color: '#DC2626' }}>Image could not be loaded.</p>
            ) : image.isPdf ? (
              <a href={image.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: '#0D9488' }}>
                <ExternalLink className="w-3.5 h-3.5" /> Open PDF report
              </a>
            ) : (
              <a href={image.url} target="_blank" rel="noreferrer" className="block" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="Radiology scan"
                  className="rounded-xl w-full"
                  style={{ maxHeight: '22rem', objectFit: 'contain', background: '#0F172A', border: '1px solid #E2E8F0' }} />
              </a>
            )}
          </div>
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
