'use client'

import { useState, useCallback } from 'react'
import { X, Printer } from 'lucide-react'
import BarcodeRenderer from './BarcodeRenderer'
import { stampSampleLabelPrinted } from '@/app/actions/barcode'
import type { LabOrder } from '@/lib/types'

interface Props {
  order: LabOrder
  onClose: () => void
}

// Group items by sample_type — one sticker per distinct sample type
function groupBySampleType(order: LabOrder): Array<{ sampleType: string; testNames: string[] }> {
  const map = new Map<string, string[]>()
  for (const item of order.items ?? []) {
    const st = (item.test?.sample_type ?? 'General').trim()
    if (!map.has(st)) map.set(st, [])
    map.get(st)!.push(item.test?.name ?? 'Unknown')
  }
  return Array.from(map.entries()).map(([sampleType, testNames]) => ({ sampleType, testNames }))
}

const STICKER_ID_PREFIX = 'sample-sticker-print'

export default function SampleLabelModal({ order, onClose }: Props) {
  const [printing, setPrinting] = useState(false)
  const groups = groupBySampleType(order)
  const patient = order.patient
  const orderedDate = new Date(order.ordered_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const handlePrint = useCallback(async () => {
    setPrinting(true)
    stampSampleLabelPrinted(order.id)

    // Print all stickers — inject CSS that shows only the sticker containers
    const style = document.createElement('style')
    style.id = 'sample-label-print-css'
    style.textContent = `
      @media print {
        @page { size: 50mm 30mm; margin: 0; }
        body > * { visibility: hidden !important; }
        .sample-sticker-wrap, .sample-sticker-wrap * { visibility: visible !important; }
        .sample-sticker-wrap {
          position: relative !important;
          page-break-after: always;
          width: 50mm; height: 30mm;
          overflow: hidden;
          box-shadow: none !important;
          border: none !important;
          padding: 3px !important;
        }
        .sample-sticker-wrap:last-child { page-break-after: auto; }
      }
    `
    document.head.appendChild(style)
    window.print()
    document.head.removeChild(style)

    setPrinting(false)
  }, [order.id])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid #E2E8F0' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#0F172A' }}>Print Sample Label{groups.length > 1 ? 's' : ''}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {groups.length} sticker{groups.length > 1 ? 's' : ''} · Code 128 · Order ID encoded · 50 × 30 mm
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer', background: 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sticker previews */}
        <div className="px-5 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs font-medium" style={{ color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {groups.length > 1 ? 'Label Previews (one per sample type)' : 'Label Preview'}
          </p>

          {groups.map(({ sampleType, testNames }) => (
            <div
              key={sampleType}
              className="sample-sticker-wrap"
              style={{
                border: '1.5px solid #CBD5E1',
                borderRadius: '6px',
                padding: '6px 8px',
                background: '#fff',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {/* Sample type banner */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '4px',
              }}>
                <span style={{
                  fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: '#7C3AED',
                  background: '#F3E8FF', padding: '1px 5px', borderRadius: '3px',
                }}>
                  {sampleType}
                </span>
                <span style={{ fontSize: '8px', color: '#94A3B8' }}>{orderedDate}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                {/* Barcode — encodes the full lab_order UUID */}
                <div style={{ flexShrink: 0 }}>
                  <BarcodeRenderer
                    value={order.id}
                    height={32}
                    width={0.9}
                    displayValue={false}
                  />
                </div>

                {/* Text content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {patient?.full_name ?? '—'}
                  </p>
                  <p style={{ fontSize: '9px', color: '#0D9488', fontWeight: 600, margin: '1px 0' }}>
                    {patient?.uhid ?? '—'}
                  </p>
                  <p style={{ fontSize: '9px', color: '#475569', margin: 0, lineHeight: 1.3 }}>
                    {testNames.join(' · ')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Each sticker prints on a separate 50×30mm label.
          </p>
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: printing ? '#CBD5E1' : '#7C3AED',
              color: '#fff',
              border: 'none',
              cursor: printing ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            <Printer className="w-4 h-4" />
            {printing ? 'Printing…' : `Print ${groups.length > 1 ? `${groups.length} Labels` : 'Label'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
