'use client'

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
  function printIdCard() {
    const age = computeAge(patient.dob)
    const meta = [
      age !== '—' ? age : null,
      patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null,
    ].filter(Boolean).join(' · ')

    // ── Build card DOM node directly on body ──────────────────────────────────
    // Using DOM APIs (not innerHTML) so SVG gets the correct namespace for jsbarcode.
    // This node is hidden off-screen until print fires; visibility CSS isolates it.

    const root = document.createElement('div')
    root.id = '__id-card-root'
    Object.assign(root.style, {
      position: 'fixed', left: '-9999px', top: '-9999px',
      width: '85.6mm', height: '54mm',
      fontFamily: 'system-ui, -apple-system, Arial, sans-serif',
      background: '#fff',
      display: 'flex', flexDirection: 'column',
      padding: '3.5mm 4mm 3mm', boxSizing: 'border-box',
      border: '0.5mm solid #CBD5E1', borderRadius: '3mm',
      overflow: 'hidden',
    })

    const label = document.createElement('div')
    Object.assign(label.style, { fontSize: '6.5pt', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0D9488', marginBottom: '1.5mm' })
    label.textContent = 'ID Card'
    root.appendChild(label)

    const divider = document.createElement('div')
    Object.assign(divider.style, { height: '0.4mm', background: '#E2E8F0', marginBottom: '2mm' })
    root.appendChild(divider)

    const row = document.createElement('div')
    Object.assign(row.style, { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2mm', marginBottom: '1mm' })

    const infoCol = document.createElement('div')
    Object.assign(infoCol.style, { flex: '1', minWidth: '0' })

    const nameEl = document.createElement('div')
    Object.assign(nameEl.style, { fontSize: '13pt', fontWeight: '700', color: '#0F172A', lineHeight: '1.15', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
    nameEl.textContent = patient.full_name
    infoCol.appendChild(nameEl)

    if (meta) {
      const metaEl = document.createElement('div')
      Object.assign(metaEl.style, { fontSize: '7pt', color: '#64748B', marginTop: '0.8mm' })
      metaEl.textContent = meta
      infoCol.appendChild(metaEl)
    }
    row.appendChild(infoCol)

    const badgesCol = document.createElement('div')
    Object.assign(badgesCol.style, { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1mm', flexShrink: '0' })

    const uhidBadge = document.createElement('div')
    Object.assign(uhidBadge.style, { fontSize: '7.5pt', fontWeight: '700', fontFamily: 'monospace', color: '#0D9488', background: 'rgba(13,148,136,0.08)', padding: '0.8mm 2mm', borderRadius: '1.5mm', border: '0.3mm solid rgba(13,148,136,0.3)', whiteSpace: 'nowrap' })
    uhidBadge.textContent = patient.uhid
    badgesCol.appendChild(uhidBadge)

    if (patient.blood_group) {
      const bloodBadge = document.createElement('div')
      Object.assign(bloodBadge.style, { fontSize: '7.5pt', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '0.5mm 2mm', borderRadius: '1.5mm', border: '0.3mm solid #FECACA', whiteSpace: 'nowrap' })
      bloodBadge.textContent = patient.blood_group
      badgesCol.appendChild(bloodBadge)
    }
    row.appendChild(badgesCol)
    root.appendChild(row)

    const barcodeWrap = document.createElement('div')
    Object.assign(barcodeWrap.style, { marginTop: 'auto', display: 'flex', justifyContent: 'center' })

    // createElementNS is required — jsbarcode needs a proper SVG namespace element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.style.maxWidth = '62mm'
    barcodeWrap.appendChild(svg)
    root.appendChild(barcodeWrap)

    document.body.appendChild(root)

    try {
      JsBarcode(svg, patient.uhid, {
        format: 'CODE128', width: 1.6, height: 36,
        displayValue: true, fontSize: 9, margin: 0,
        background: '#ffffff', lineColor: '#000000',
      })
    } catch {}

    // ── @media print: hide everything except the card ─────────────────────────
    const style = document.createElement('style')
    style.textContent = `
      @media print {
        @page { size: 85.6mm 54mm landscape; margin: 0; }
        body * { visibility: hidden !important; }
        #__id-card-root, #__id-card-root * { visibility: visible !important; }
        #__id-card-root {
          position: fixed !important;
          left: 0 !important; top: 0 !important;
          width: 85.6mm !important; height: 54mm !important;
        }
      }
    `
    document.head.appendChild(style)
    window.print()
    document.head.removeChild(style)
    document.body.removeChild(root)
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
  )
}
