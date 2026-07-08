'use client'

import { X } from 'lucide-react'
import BarcodeRenderer from './BarcodeRenderer'
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

export default function PatientBarcodeModal({ patient, onClose }: Props) {
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

        {/* Barcode */}
        <div className="px-6 py-5 flex flex-col items-center gap-3">
          <div className="w-full flex justify-center py-3 px-4 rounded-xl"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <BarcodeRenderer
              value={patient.uhid}
              height={56}
              width={1.8}
              displayValue={false}
            />
          </div>

          {/* UHID — big and prominent */}
          <p className="text-xl font-bold tracking-widest" style={{ color: '#0D9488', fontVariantNumeric: 'tabular-nums' }}>
            {patient.uhid}
          </p>

          {/* Patient details */}
          <div className="w-full rounded-xl px-4 py-3 space-y-1"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: '#64748B' }}>Name</span>
              <span className="font-semibold" style={{ color: '#0F172A' }}>{patient.full_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: '#64748B' }}>Age / Gender</span>
              <span className="font-medium" style={{ color: '#0F172A' }}>
                {computeAge(patient.dob)} · {patient.gender ?? '—'}
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
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Done — Go to Patient
          </button>
        </div>
      </div>
    </div>
  )
}
