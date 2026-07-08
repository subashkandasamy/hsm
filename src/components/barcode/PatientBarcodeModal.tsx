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

  // Pre-render barcode on the off-screen SVG so we can grab outerHTML for iframe print
  useEffect(() => {
    if (!printSvgRef.current || !patient.uhid) return
    try {
      JsBarcode(printSvgRef.current, patient.uhid, {
        format: 'CODE128',
        width: 1.6,
        height: 36,
        displayValue: true,
        fontSize: 9,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {}
  }, [patient.uhid])

  function printIdCard() {
    const svgContent = printSvgRef.current?.outerHTML ?? ''
    const age = computeAge(patient.dob)
    const meta = [
      age !== '—' ? age : null,
      patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null,
    ].filter(Boolean).join(' · ')

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:85.6mm;height:54mm;border:none;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument!
    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: 85.6mm 54mm landscape; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 85.6mm; height: 54mm; overflow: hidden; }
  body { font-family: system-ui, -apple-system, Arial, sans-serif; background: #fff; }
  .card {
    width: 85.6mm;
    height: 54mm;
    padding: 3.5mm 4mm 3mm;
    display: flex;
    flex-direction: column;
    border: 0.5mm solid #CBD5E1;
    border-radius: 3mm;
    overflow: hidden;
    background: #ffffff;
  }
  .label {
    font-size: 6.5pt;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #0D9488;
    margin-bottom: 1.5mm;
  }
  .divider { height: 0.4mm; background: #E2E8F0; margin-bottom: 2mm; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 2mm; margin-bottom: 1mm; }
  .name {
    font-size: 13pt; font-weight: 700; color: #0F172A; line-height: 1.15;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .meta { font-size: 7pt; color: #64748B; margin-top: 0.8mm; }
  .badges { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; flex-shrink: 0; }
  .uhid-badge {
    font-size: 7.5pt; font-weight: 700; font-family: monospace;
    color: #0D9488; background: rgba(13,148,136,0.08);
    padding: 0.8mm 2mm; border-radius: 1.5mm;
    border: 0.3mm solid rgba(13,148,136,0.3); white-space: nowrap;
  }
  .blood-badge {
    font-size: 7.5pt; font-weight: 700; color: #DC2626;
    background: #FEF2F2; padding: 0.5mm 2mm; border-radius: 1.5mm;
    border: 0.3mm solid #FECACA; white-space: nowrap;
  }
  .barcode-wrap { margin-top: auto; display: flex; justify-content: center; }
  .barcode-wrap svg { max-width: 62mm; }
</style>
</head>
<body>
<div class="card">
  <div class="label">ID Card</div>
  <div class="divider"></div>
  <div class="row">
    <div style="flex:1;min-width:0">
      <div class="name">${patient.full_name}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div>
    <div class="badges">
      <div class="uhid-badge">${patient.uhid}</div>
      ${patient.blood_group ? `<div class="blood-badge">${patient.blood_group}</div>` : ''}
    </div>
  </div>
  <div class="barcode-wrap">${svgContent}</div>
</div>
</body>
</html>`)
    doc.close()

    iframe.contentWindow!.addEventListener('afterprint', () => {
      document.body.removeChild(iframe)
    })

    // Allow the iframe document to fully paint before printing
    setTimeout(() => {
      iframe.contentWindow!.print()
    }, 150)
  }

  const age = computeAge(patient.dob)

  return (
    <>
      {/* Off-screen SVG — jsbarcode renders here; outerHTML is copied into iframe on print */}
      <svg ref={printSvgRef} style={{ position: 'fixed', left: '-9999px', top: '-9999px' }} aria-hidden="true" />

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
