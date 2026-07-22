'use client'

import { Printer, Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DateText from '@/components/ui/DateText'
import type { LabOrder, LabOrderItem, LabFlag } from '@/lib/types'

const FLAG_COLORS: Record<LabFlag, { bg: string; color: string; label: string }> = {
  pending: { bg: '#F1F5F9', color: '#64748B', label: 'PENDING' },
  normal:  { bg: '#DCFCE7', color: '#15803D', label: 'NORMAL' },
  high:    { bg: '#FEE2E2', color: '#DC2626', label: 'HIGH' },
  low:     { bg: '#DBEAFE', color: '#1D4ED8', label: 'LOW' },
}

function refRange(item: LabOrderItem): string {
  const t = item.test
  if (t?.reference_range) return t.reference_range
  if (t?.ref_low != null && t?.ref_high != null) return `${t.ref_low} – ${t.ref_high}`
  if (t?.ref_high != null) return `< ${t.ref_high}`
  if (t?.ref_low != null) return `> ${t.ref_low}`
  return '—'
}

interface Props {
  order: LabOrder
  canEdit: boolean
  onClose: () => void
  onEdit: () => void
}

export default function LabReportModal({ order, canEdit, onClose, onEdit }: Props) {
  const items = order.items ?? []

  return (
    <Modal open onClose={onClose} title={`Lab Report — ${order.patient?.full_name ?? '—'}`} maxWidth="46rem">
      <div className="space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl p-3.5"
          style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <Meta label="Patient" value={order.patient?.full_name ?? '—'} />
          <Meta label="UHID" value={order.patient?.uhid ?? '—'} mono />
          <Meta label="Ordered By" value={order.orderer?.full_name ?? '—'} />
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wide" style={{ color: '#94A3B8', minWidth: '4.5rem' }}>Reported</span>
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              {order.reported_at ? <DateText date={order.reported_at} /> : '—'}
            </span>
          </div>
        </div>

        {/* Results table */}
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={th}>Investigation</th>
                <th style={{ ...th, textAlign: 'right' }}>Result</th>
                <th style={th}>Unit</th>
                <th style={th}>Reference</th>
                <th style={{ ...th, textAlign: 'center' }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const fc = FLAG_COLORS[item.flag] ?? FLAG_COLORS.pending
                const abnormal = item.flag === 'high' || item.flag === 'low'
                const resultDisplay = item.result_value != null ? String(item.result_value) : (item.result_text || '—')
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#0F172A' }}>{item.test?.name ?? 'Test'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: abnormal ? 800 : 600, color: abnormal ? fc.color : '#0F172A' }}>
                      {resultDisplay}
                    </td>
                    <td style={{ ...td, color: '#64748B' }}>{item.unit ?? item.test?.unit ?? '—'}</td>
                    <td style={{ ...td, color: '#64748B' }}>{refRange(item)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: fc.bg, color: fc.color }}>
                        {fc.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#94A3B8' }}>No tests on this order.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          {canEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <Pencil className="w-3.5 h-3.5" /> Edit Results
            </button>
          )}
          <a href={`/print/lab/${order.id}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', textDecoration: 'none' }}>
            <Printer className="w-3.5 h-3.5" /> Print Report
          </a>
        </div>
      </div>
    </Modal>
  )
}

const th: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', color: '#0F766E',
  textTransform: 'uppercase', textAlign: 'left', padding: '8px 10px',
}
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' }

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: '#94A3B8', minWidth: '4.5rem' }}>{label}</span>
      <span className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: '#0F172A' }}>{value}</span>
    </div>
  )
}
