'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ScanBarcode, X } from 'lucide-react'
import { resolveBarcodeScan } from '@/app/actions/barcode'

export default function ScanInput() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [status, setStatus] = useState<'idle' | 'resolving' | 'not_found'>('idle')

  // Keyboard-wedge scanners fire chars rapidly then send Enter.
  // This component captures that naturally — just needs to be focused.

  const handleSubmit = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setStatus('resolving')
    const result = await resolveBarcodeScan(trimmed)
    if (result.type === 'patient') {
      setValue('')
      setStatus('idle')
      router.push(`/patients/${result.id}`)
    } else if (result.type === 'lab_order') {
      setValue('')
      setStatus('idle')
      router.push(`/lab?highlight=${result.id}`)
    } else {
      setStatus('not_found')
      setTimeout(() => {
        setStatus('idle')
        setValue('')
      }, 2500)
    }
  }, [router])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(value)
    }
    if (e.key === 'Escape') {
      setValue('')
      setStatus('idle')
      inputRef.current?.blur()
    }
  }

  // Global shortcut: / or Ctrl+K focuses the scan input
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

  const isNotFound = status === 'not_found'
  const isResolving = status === 'resolving'

  return (
    <div className="relative" style={{ width: '220px' }}>
      <div
        className="flex items-center gap-2 px-3 rounded-xl transition-all"
        style={{
          height: '36px',
          border: isNotFound
            ? '1px solid #FCA5A5'
            : focused
            ? '1px solid rgba(13,148,136,0.5)'
            : '1px solid #E2E8F0',
          background: isNotFound
            ? '#FEF2F2'
            : focused
            ? 'rgba(13,148,136,0.04)'
            : '#F8FAFC',
        }}
      >
        <ScanBarcode
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: isNotFound ? '#DC2626' : '#94A3B8' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setStatus('idle') }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (!isNotFound) setStatus('idle') }}
          placeholder={isResolving ? 'Looking up…' : isNotFound ? 'Not found' : 'Scan or ⌘K'}
          disabled={isResolving}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{
            color: isNotFound ? '#DC2626' : '#0F172A',
            fontSize: '13px',
            minWidth: 0,
          }}
          aria-label="Barcode scan input — scan a patient wristband or lab sample sticker"
        />
        {value && !isResolving && (
          <button
            onClick={() => { setValue(''); setStatus('idle') }}
            style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
