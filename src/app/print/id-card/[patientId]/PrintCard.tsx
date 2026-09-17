'use client'

import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Patient } from '@/lib/types'
import QrRenderer from '@/components/barcode/QrRenderer'

function computeAge(dob: string | null): string {
  if (!dob) return '—'
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000)}y`
}

export default function PrintCard({ patient, hospitalName }: { patient: Patient; hospitalName: string | null }) {
  useEffect(() => {
    // Small delay so the QR SVG paints before the print dialog opens
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [])

  const age = computeAge(patient.dob)
  const meta = [age !== '—' ? age : null, patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null].filter(Boolean).join(' · ')

  return (
    <>
      <style>{`
        @page { size: 85.6mm 54mm; margin: 0; }

        @media print {
          html, body { width: 85.6mm; height: 54mm; margin: 0; padding: 0; overflow: hidden; background: #fff !important; }
          .screen-only { display: none !important; }
          .card { box-shadow: none !important; }
        }

        @media screen {
          body { background: #F1F5F9; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 20px; }
        }
      `}</style>

      {/* Screen-only controls */}
      <div className="screen-only" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={() => window.history.back()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui' }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <button
          onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#0D9488', color: '#fff', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui', fontWeight: 600 }}
        >
          <Printer size={15} /> Print
        </button>
      </div>

      {/* The card — same design, shown on screen as preview and printed */}
      <div
        className="card"
        style={{
          width: '85.6mm',
          height: '54mm',
          background: '#ffffff',
          fontFamily: 'system-ui, -apple-system, Arial, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          padding: '3.5mm 4mm 3mm',
          boxSizing: 'border-box',
          border: '0.5mm solid #CBD5E1',
          borderRadius: '3mm',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '2mm', marginBottom: '1.5mm' }}>
          <div style={{ fontSize: '8pt', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hospitalName ?? ''}
          </div>
          <div style={{ fontSize: '6pt', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0F766E', whiteSpace: 'nowrap' }}>
            Patient ID Card
          </div>
        </div>

        <div style={{ height: '0.4mm', background: '#E2E8F0', marginBottom: '2mm' }} />

        {/* Name + badges row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2mm', marginBottom: '1mm' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13pt', fontWeight: 700, color: '#0F172A', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {patient.full_name}
            </div>
            {meta && (
              <div style={{ fontSize: '7pt', color: '#64748B', marginTop: '0.8mm' }}>{meta}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1mm', flexShrink: 0 }}>
            <div style={{ fontSize: '7.5pt', fontWeight: 700, fontFamily: 'monospace', color: '#0D9488', background: 'rgba(13,148,136,0.08)', padding: '0.8mm 2mm', borderRadius: '1.5mm', border: '0.3mm solid rgba(13,148,136,0.3)', whiteSpace: 'nowrap' }}>
              {patient.uhid}
            </div>
            {patient.blood_group && (
              <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '0.5mm 2mm', borderRadius: '1.5mm', border: '0.3mm solid #FECACA', whiteSpace: 'nowrap' }}>
                {patient.blood_group}
              </div>
            )}
          </div>
        </div>

        {/* QR code */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '16mm' }}>
            <QrRenderer value={patient.uhid} size={140} />
          </div>
        </div>
      </div>
    </>
  )
}
