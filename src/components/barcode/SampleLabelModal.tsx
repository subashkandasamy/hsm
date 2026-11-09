'use client'

import { X, Printer } from 'lucide-react'
import { stampSampleLabelPrinted } from '@/app/actions/barcode'
import LabelPrintTips from './LabelPrintTips'
import type { LabOrder } from '@/lib/types'

interface Props {
  order: LabOrder
  onClose: () => void
}

// One tube per sample type — must match the grouping in the label PDF route.
function tubes(order: LabOrder): Array<{ sampleType: string; tests: string[] }> {
  const map = new Map<string, { sampleType: string; tests: string[] }>()
  for (const item of order.items ?? []) {
    const type = item.test?.sample_type?.trim() || 'Sample'
    const tube = map.get(type.toLowerCase()) ?? { sampleType: type, tests: [] }
    tube.tests.push(item.test?.name ?? 'Test')
    map.set(type.toLowerCase(), tube)
  }
  return [...map.values()]
}

export default function SampleLabelModal({ order, onClose }: Props) {
  // The stored tubes when we have them: their order is NABL's draw order and
  // their barcodes are what prints. The grouping below is only a fallback.
  const list = order.samples?.length
    ? order.samples.map((s) => ({
        code: s.barcode,
        sampleType: s.tube?.label ?? 'Sample',
        // Same rule as ensure_lab_samples: a test goes in its catalogue tube.
        tests: (order.items ?? [])
          .filter((it) => ((it.test as { tube_type?: string | null } | undefined)?.tube_type ?? 'other') === s.tube_type)
          .map((it) => it.test?.name ?? 'Test'),
      }))
    : tubes(order).map((t, i) => ({ ...t, code: `${order.accession_no ?? ''}${String(i + 1).padStart(2, '0')}` }))
  const pdfUrl = `/print/sample-labels/${order.id}/pdf`

  function handlePrint() {
    window.open(pdfUrl, '_blank')
    stampSampleLabelPrinted(order.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #E2E8F0' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#0F172A' }}>Print tube label{list.length > 1 ? 's' : ''}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {list.length} label{list.length > 1 ? 's' : ''} · Code 128 · 50 × 25 mm · Accession {order.accession_no ?? '—'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer', background: 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          <iframe title="Label preview" src={`${pdfUrl}#toolbar=0&navpanes=0&view=Fit`}
            className="w-full rounded-lg" style={{ height: '190px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
          <ul className="space-y-1">
            {list.map((t) => (
              <li key={t.code} className="text-xs flex gap-2" style={{ color: '#334155' }}>
                <span className="font-mono font-semibold tabular-nums">{t.code}</span>
                <span className="font-semibold uppercase">{t.sampleType}</span>
                <span className="truncate" style={{ color: '#64748B' }}>{t.tests.join(', ')}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs" style={{ color: '#475569' }}>
            Stick the label <strong>lengthwise</strong> along the tube, barcode running along its length, below the cap and
            clear of the tube&apos;s own label — analyzers and scanners cannot read a barcode wrapped around the tube.
          </p>
          <LabelPrintTips paper="50 × 25 mm (2 × 1 in)" />
        </div>

        <div className="px-5 pb-5 pt-3 flex justify-end" style={{ borderTop: '1px solid #E2E8F0' }}>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Printer className="w-4 h-4" /> Print {list.length > 1 ? `${list.length} labels` : 'label'}
          </button>
        </div>
      </div>
    </div>
  )
}
