'use client'

import { useRef, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import BarcodeRenderer from './BarcodeRenderer'
import type { Patient } from '@/lib/types'

interface Props {
  patient: Patient
  onClose: () => void
  /** When true, changes footer button label to "Close" (use when already on the patient page) */
  inline?: boolean
}

function computeAge(dob: string | null): string {
  if (!dob) return '—'
  const diff = Date.now() - new Date(dob).getTime()
  return `${Math.floor(diff / 31557600000)}y`
}

export default function PatientBarcodeModal({ patient, onClose, inline }: Props) {
  const printSvgRef = useRef<SVGSVGElement>(null)

  // Render barcode on the hidden print card SVG
  useEffect(() => {
    if (!printSvgRef.current || !patient.uhid) return
    try {
      JsBarcode(printSvgRef.current, patient.uhid, {
        format: 'CODE128',
        width: 1.4,
        height: 34,
        displayValue: true,
        fontSize: 9,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {}
  }, [patient.uhid])

  function printIdCard() {
    const style = document.createElement('style')
    style.id = '__id-card-print'
    style.textContent = `
      @media print {
        @page { size: 85.6mm 54mm landscape; margin: 0; }
        body > * { visibility: hidden !important; }
        #__patient-id-card,
        #__patient-id-card * { visibility: visible !important; }
        #__patient-id-card {
          position: fixed !important;
          inset: 0 !important;
          left: 0 !important;
          top: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          width: 85.6mm !important;
          height: 54mm !important;
        }
      }
    `
    document.head.appendChild(style)
    window.print()
    document.head.removeChild(style)
  }

  const age = computeAge(patient.dob)
  const meta = [age !== '—' ? age : null, patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null].filter(Boolean).join(' · ')

  return (
    <>
      {/* ── Hidden print card — off-screen so jsbarcode renders, visible only in @media print ── */}
      <div
        id="__patient-id-card"
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: '85.6mm',
          height: '54mm',
          background: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          padding: '3.5mm 4mm 3mm',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Card header */}
        <div style={{ marginBottom: '1.5mm' }}>
          <span style={{
            fontSize: '6.5pt', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0D9488',
          }}>
            ID Card
          </span>
        </div>

        <div style={{ height: '0.4mm', background: '#E2E8F0', marginBottom: '2mm' }} />

        {/* Name + UHID row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2mm', marginBottom: '1mm' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '13pt', fontWeight: 700, color: '#0F172A', lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {patient.full_name}
            </div>
            {meta && (
              <div style={{ fontSize: '7pt', color: '#64748B', marginTop: '0.8mm' }}>{meta}</div>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1mm' }}>
            <div style={{
              fontSize: '7.5pt', fontWeight: 700, fontFamily: 'monospace',
              background: 'rgba(13,148,136,0.08)', color: '#0D9488',
              padding: '0.8mm 2mm', borderRadius: '1.5mm',
              border: '0.3mm solid rgba(13,148,136,0.3)',
              whiteSpace: 'nowrap',
            }}>
              {patient.uhid}
            </div>
            {patient.blood_group && (
              <div style={{
                fontSize: '7.5pt', fontWeight: 700, color: '#DC2626',
                background: '#FEF2F2', padding: '0.5mm 2mm', borderRadius: '1.5mm',
                border: '0.3mm solid #FECACA', whiteSpace: 'nowrap',
              }}>
                {patient.blood_group}
              </div>
            )}
          </div>
        </div>

        {/* Barcode */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <svg ref={printSvgRef} style={{ maxWidth: '62mm' }} />
        </div>
      </div>

      {/* ── Modal UI ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #E2E8F0' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between"
            style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#0D9488' }}>
                Patient Registered
              </p>
              <h2 className="text-base font-bold mt-0.5" style={{ color: '#0F172A' }}>
                Barcode Generated
              </h2>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer', background: '#fff' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Barcode preview */}
          <div className="px-6 py-5 flex flex-col items-center gap-3">
            <div className="w-full flex justify-center py-3 px-4 rounded-xl"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <BarcodeRenderer value={patient.uhid} height={56} width={1.8} displayValue={false} />
            </div>

            <p className="text-xl font-bold tracking-widest"
              style={{ color: '#0D9488', fontVariantNumeric: 'tabular-nums' }}>
              {patient.uhid}
            </p>

            <div className="w-full rounded-xl px-4 py-3 space-y-1"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#64748B' }}>Name</span>
                <span className="font-semibold" style={{ color: '#0F172A' }}>{patient.full_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#64748B' }}>Age / Gender</span>
                <span className="font-medium" style={{ color: '#0F172A' }}>
                  {age} · {patient.gender ?? '—'}
                </span>
              </div>
              {patient.blood_group && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#64748B' }}>Blood Group</span>
                  <span className="font-bold" style={{ color: '#DC2626' }}>{patient.blood_group}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
              This barcode is the patient&apos;s permanent ID — used across all OPD visits, IPD admissions, and bills for life.
              The physical wristband is printed at time of IPD admission.
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={printIdCard}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#F0FDF9', color: '#0D9488', border: '1px solid #CCFBF1', cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#CCFBF1' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#F0FDF9' }}
            >
              <Printer className="w-4 h-4" />
              Print ID Card
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
            >
              {inline ? 'Close' : 'Done — Go to Patient'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
