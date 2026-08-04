'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ScanLine } from 'lucide-react'
import { resolveBarcodeScan } from '@/app/actions/barcode'
import ScanPatientActions, { type ScanPatient } from './ScanPatientActions'

// Native-only camera scanner (Capacitor app). On the web it renders nothing —
// the desktop text box handles hardware scanners there. Feeds the decoded value
// into the same resolver + quick-action panel as the text scanner.
export default function CameraScanButton() {
  const router = useRouter()
  const [isNative, setIsNative] = useState(false)
  const [patient, setPatient] = useState<ScanPatient | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    import('@capacitor/core').then(({ Capacitor }) => { if (active) setIsNative(Capacitor.isNativePlatform()) }).catch(() => {})
    return () => { active = false }
  }, [])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500) }

  const scan = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const { Capacitor } = await import('@capacitor/core')
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')

      const perm = await BarcodeScanner.requestPermissions()
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        setBusy(false)
        flash('Camera permission is needed to scan.')
        return
      }

      // Android needs the on-device scanner module present before scanning.
      if (Capacitor.getPlatform() === 'android') {
        try {
          const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
          if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule()
        } catch { /* best-effort */ }
      }

      const { barcodes } = await BarcodeScanner.scan()
      setBusy(false)
      const value = barcodes?.[0]?.rawValue?.trim()
      if (!value) return

      const result = await resolveBarcodeScan(value)
      if (result.type === 'patient') {
        setPatient({ id: result.id, name: result.name, uhid: result.uhid })
      } else if (result.type === 'lab_order') {
        router.push(`/lab?highlight=${result.id}`)
      } else {
        flash('No patient or lab order matches this code.')
      }
    } catch {
      setBusy(false)
      flash('Could not open the scanner.')
    }
  }, [busy, router])

  if (!isNative) return null

  return (
    <>
      <button onClick={scan} disabled={busy} aria-label="Scan QR or barcode"
        className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
        style={{ color: '#0D9488', background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)' }}>
        <ScanLine className="w-5 h-5" />
      </button>

      {/* Resolved patient → shared quick-action panel in a centered sheet */}
      {patient && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPatient(null) }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
            <ScanPatientActions patient={patient} onClose={() => setPatient(null)} />
          </div>
        </div>
      )}

      {/* Transient message */}
      {msg && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[60] px-4 py-2 rounded-xl text-sm shadow-lg"
          style={{ background: '#0F172A', color: '#fff' }}>
          {msg}
        </div>
      )}
    </>
  )
}
