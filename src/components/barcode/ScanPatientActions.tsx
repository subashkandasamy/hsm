'use client'

import { useRouter } from 'next/navigation'
import { User, CalendarPlus, BedDouble, ExternalLink, X } from 'lucide-react'

export interface ScanPatient {
  id: string
  name: string
  uhid: string
}

// Shared quick-action panel shown after a barcode/QR resolves to a patient —
// used by both the desktop text scanner and the mobile camera scanner.
export default function ScanPatientActions({ patient, onClose }: { patient: ScanPatient; onClose: () => void }) {
  const router = useRouter()
  const go = (path: string) => { onClose(); router.push(path) }

  return (
    <>
      {/* Patient header */}
      <div className="px-4 py-3 flex items-center gap-3"
        style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1' }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(13,148,136,0.15)' }}>
          <User className="w-4 h-4" style={{ color: '#0D9488' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{patient.name}</p>
          <p className="text-xs font-mono font-semibold" style={{ color: '#0D9488' }}>{patient.uhid}</p>
        </div>
        <button onClick={onClose}
          style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="p-3 space-y-1.5">
        <p className="text-xs font-medium px-1 mb-2" style={{ color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Quick Actions
        </p>

        <button
          onClick={() => go(`/appointments?patient=${patient.id}`)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
          style={{ background: '#F0FDF9', color: '#0D9488', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#CCFBF1' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F0FDF9' }}
        >
          <CalendarPlus className="w-4 h-4 flex-shrink-0" />
          Book Appointment
        </button>

        <button
          onClick={() => go(`/ipd?admit=${patient.id}`)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
          style={{ background: '#EFF6FF', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#DBEAFE' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#EFF6FF' }}
        >
          <BedDouble className="w-4 h-4 flex-shrink-0" />
          Admit to IPD
        </button>

        <button
          onClick={() => go(`/patients/${patient.id}`)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
          style={{ background: '#F8FAFC', color: '#475569', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
        >
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          View Full Profile
        </button>
      </div>
    </>
  )
}
