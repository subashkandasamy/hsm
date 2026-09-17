'use client'

import { X, Printer } from 'lucide-react'
import QrRenderer from './QrRenderer'
import type { Patient } from '@/lib/types'

interface Props {
  patient: Patient
  onClose: () => void
  /** When true, changes footer button label to "Close" (already on patient page) */
  inline?: boolean
}

function computeAge(dob: string | null): string {
  if (!dob) return '—'
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000)}y`
}

export default function PatientBarcodeModal({ patient, onClose, inline }: Props) {
  // Card printers take the CR80 page; everyone else prints the A4 sheet and cuts it out.
  function printIdCard(layout: 'card' | 'a4') {
    window.open(`/print/id-card/${patient.id}/pdf${layout === 'a4' ? '?layout=a4' : ''}`, '_blank')
  }

  const age = computeAge(patient.dob)

  return (
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
            <QrRenderer value={patient.uhid} size={132} />
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
            The wristband is printed from the admission.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <button
            onClick={() => printIdCard('a4')}
            title="Card at true size on A4 with cut marks"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#F0FDF9', color: '#0D9488', border: '1px solid #CCFBF1', cursor: 'pointer', flexShrink: 0 }}
          >
            <Printer className="w-4 h-4" />
            ID card (A4)
          </button>
          <button
            onClick={() => printIdCard('card')}
            title="85.6 × 54 mm, for PVC card printers"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#F0FDF9', color: '#0D9488', border: '1px solid #CCFBF1', cursor: 'pointer', flexShrink: 0 }}
          >
            Card printer
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
  )
}
