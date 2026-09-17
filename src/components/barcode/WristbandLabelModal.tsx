'use client'

import { useState } from 'react'
import { X, Printer, RefreshCw } from 'lucide-react'
import { stampWristbandPrinted } from '@/app/actions/barcode'
import LabelPrintTips from './LabelPrintTips'
import type { Patient } from '@/lib/types'

interface Props {
  admissionId: string
  patient: Pick<Patient, 'id' | 'full_name' | 'uhid'> & { wristband_printed_at?: string | null }
  onClose: () => void
}

// The wristband is a generated PDF at the band's exact print size, so what is
// previewed here is exactly what the printer receives.
export default function WristbandLabelModal({ admissionId, patient, onClose }: Props) {
  const [printed, setPrinted] = useState(!!patient.wristband_printed_at)
  const pdfUrl = `/print/wristband/${admissionId}/pdf`

  function handlePrint() {
    window.open(pdfUrl, '_blank')
    stampWristbandPrinted(patient.id)
    setPrinted(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl" style={{ background: '#fff', border: '1px solid #E2E8F0' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#0F172A' }}>Print wristband</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>QR (UHID) at both ends · 101.6 × 25.4 mm (4 × 1 in)</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer', background: 'transparent' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <iframe title="Wristband preview" src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
            className="w-full rounded-lg" style={{ height: '150px', border: '1px solid #E2E8F0', background: '#F8FAFC' }} />
          <p className="text-xs" style={{ color: '#475569' }}>
            Prints name, DOB / age / sex, UHID, IP number, admission date, ward / bed, consultant, blood group and an
            allergy alert. Scanning the code opens this admission.
          </p>
          <LabelPrintTips paper="101.6 × 25.4 mm (4 × 1 in)" />
          {printed && (
            <p className="text-xs flex items-center gap-1" style={{ color: '#0D9488' }}>
              <RefreshCw className="w-3 h-3" />
              {patient.wristband_printed_at ? `Last printed ${new Date(patient.wristband_printed_at).toLocaleDateString('en-IN')}` : 'Marked as printed'}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Printer className="w-4 h-4" /> {printed ? 'Reprint wristband' : 'Print wristband'}
          </button>
        </div>
      </div>
    </div>
  )
}
