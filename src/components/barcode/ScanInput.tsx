'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ScanBarcode, X } from 'lucide-react'
import { resolveBarcodeScan } from '@/app/actions/barcode'
import ScanPatientActions, { type ScanPatient as ResolvedPatient } from './ScanPatientActions'

export default function ScanInput() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [patient, setPatient] = useState<ResolvedPatient | null>(null)

  // Close panel on outside click
  useEffect(() => {
    if (!patient) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setPatient(null)
        setValue('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [patient])

  const handleSubmit = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setResolving(true)
    setNotFound(false)
    setPatient(null)

    const result = await resolveBarcodeScan(trimmed)

    if (result.type === 'patient') {
      setPatient({ id: result.id, name: result.name, uhid: result.uhid })
      setResolving(false)
    } else if (result.type === 'lab_order') {
      setValue('')
      setResolving(false)
      router.push(`/lab?highlight=${result.id}`)
    } else {
      setNotFound(true)
      setResolving(false)
      setTimeout(() => { setNotFound(false); setValue('') }, 2500)
    }
  }, [router])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(value) }
    if (e.key === 'Escape') { setValue(''); setPatient(null); setNotFound(false); inputRef.current?.blur() }
  }

  function dismiss() { setPatient(null); setValue('') }

  // ⌘K / Ctrl+K global focus shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="relative">
      {/* Scan input field */}
      <div
        className="flex items-center gap-2 px-3 rounded-xl transition-all"
        style={{
          width: '220px',
          height: '36px',
          border: notFound
            ? '1px solid #FCA5A5'
            : focused || patient
            ? '1px solid rgba(13,148,136,0.5)'
            : '1px solid #E2E8F0',
          background: notFound ? '#FEF2F2' : focused || patient ? 'rgba(13,148,136,0.04)' : '#F8FAFC',
        }}
      >
        <ScanBarcode className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: notFound ? '#DC2626' : patient ? '#0D9488' : '#94A3B8' }} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setNotFound(false); setPatient(null) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={resolving ? 'Looking up…' : notFound ? 'Not found' : 'Scan barcode · ⌘K'}
          disabled={resolving}
          className="flex-1 bg-transparent outline-none"
          style={{ fontSize: '13px', color: notFound ? '#DC2626' : '#0F172A', minWidth: 0 }}
          aria-label="Scan patient wristband or lab sample barcode"
        />
        {(value || patient) && (
          <button onClick={dismiss}
            style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Patient quick-action panel */}
      {patient && (
        <div
          ref={panelRef}
          className="absolute top-full mt-2 left-0 rounded-2xl shadow-xl z-50"
          style={{
            width: '280px',
            background: '#fff',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}
        >
          <ScanPatientActions patient={patient} onClose={dismiss} />
        </div>
      )}
    </div>
  )
}
