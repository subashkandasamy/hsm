'use client'

import { useState, useCallback } from 'react'
import { X, Printer, RefreshCw } from 'lucide-react'
import BarcodeRenderer from './BarcodeRenderer'
import { stampWristbandPrinted } from '@/app/actions/barcode'
import type { Patient } from '@/lib/types'

interface Props {
  patient: Patient
  onClose: () => void
}

function computeAge(dob: string | null): string {
  if (!dob) return '—'
  const diff = Date.now() - new Date(dob).getTime()
  return `${Math.floor(diff / 31557600000)}y`
}

const LABEL_ID = 'wristband-label-print'

export default function WristbandLabelModal({ patient, onClose }: Props) {
  const [printing, setPrinting] = useState(false)
  const [printed, setPrinted] = useState(!!patient.wristband_printed_at)

  const handlePrint = useCallback(async () => {
    setPrinting(true)

    // Stamp server-side before printing
    stampWristbandPrinted(patient.id)

    // Inject print CSS — isolate just the label
    const style = document.createElement('style')
    style.id = 'wristband-print-css'
    style.textContent = `
      @media print {
        @page { size: 101.6mm 25.4mm landscape; margin: 0; }
        body > * { visibility: hidden !important; }
        #${LABEL_ID}, #${LABEL_ID} * { visibility: visible !important; }
        #${LABEL_ID} {
          position: fixed !important;
          top: 0; left: 0;
          width: 101.6mm; height: 25.4mm;
          box-shadow: none !important;
          border: none !important;
        }
      }
    `
    document.head.appendChild(style)
    window.print()
    document.head.removeChild(style)

    setPrinted(true)
    setPrinting(false)
  }, [patient.id])

  const gender = patient.gender
    ? patient.gender.charAt(0).toUpperCase()
    : '—'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl shadow-2xl"
          style={{ background: '#fff', border: '1px solid #E2E8F0' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
            <div>
              <h2 className="font-semibold text-base" style={{ color: '#0F172A' }}>Print Wristband</h2>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Code 128 · UHID encoded · 101.6 × 25.4 mm</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer', background: 'transparent' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview */}
          <div className="px-5 py-5">
            <p className="text-xs font-medium mb-3" style={{ color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Label Preview
            </p>

            {/* The actual printable label */}
            <div
              id={LABEL_ID}
              style={{
                width: '100%',
                border: '1.5px solid #CBD5E1',
                borderRadius: '6px',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#fff',
                minHeight: '72px',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {/* Barcode */}
              <div style={{ flexShrink: 0 }}>
                <BarcodeRenderer
                  value={patient.uhid}
                  height={40}
                  width={1.2}
                  displayValue={false}
                />
              </div>

              {/* Patient info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {patient.full_name}
                </p>
                <p style={{ fontSize: '11px', color: '#0D9488', fontWeight: 600, margin: '2px 0 0', letterSpacing: '0.03em' }}>
                  {patient.uhid}
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', color: '#475569' }}>
                    {computeAge(patient.dob)} · {gender}
                  </span>
                  {patient.blood_group && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '0 4px', borderRadius: '3px' }}>
                      {patient.blood_group}
                    </span>
                  )}
                  {patient.phone && (
                    <span style={{ fontSize: '10px', color: '#475569' }}>{patient.phone}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Reprint notice */}
            {printed && (
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#0D9488' }}>
                <RefreshCw className="w-3 h-3" />
                {patient.wristband_printed_at
                  ? `Last printed ${new Date(patient.wristband_printed_at).toLocaleDateString()}`
                  : 'Marked as printed'}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Send to your label/thermal printer after clicking Print.
            </p>
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: printing ? '#CBD5E1' : '#0D9488',
                color: '#fff',
                border: 'none',
                cursor: printing ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              <Printer className="w-4 h-4" />
              {printing ? 'Printing…' : 'Print'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
