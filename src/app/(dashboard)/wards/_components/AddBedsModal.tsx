'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { addBeds } from '@/app/actions/wards'
import type { Ward } from '@/lib/types'

interface Props {
  open: boolean
  ward: Ward
  onClose: () => void
  onSuccess: () => void
}

function parseRange(input: string): string[] {
  // Supports: "1-10" → ["1","2",...,"10"], "A1,A2,A3", "B1-B5"
  const results: string[] = []
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean)

  for (const part of parts) {
    const rangeMatch = part.match(/^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/)
    if (rangeMatch) {
      const [, prefixA, startStr, , endStr] = rangeMatch
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      for (let i = start; i <= end; i++) results.push(`${prefixA}${i}`)
    } else {
      results.push(part)
    }
  }

  return [...new Set(results)].slice(0, 100)
}

export default function AddBedsModal({ open, ward, onClose, onSuccess }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = input ? parseRange(input) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const beds = parseRange(input)
    if (beds.length === 0) { setError('Enter at least one bed number'); return }
    setLoading(true)
    setError(null)
    const result = await addBeds(ward.id, beds)
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setInput('')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add Beds — ${ward.name}`} maxWidth="28rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Bed Numbers"
          hint="Enter a range (e.g. 1-20), individual numbers (e.g. A1,A2,A3), or mixed (e.g. A1-A10,B1-B5)">
          <Input
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null) }}
            placeholder="e.g. 1-20 or A1-A10,B1-B10"
          />
        </FormField>

        {preview.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#64748B' }}>
              Preview — {preview.length} bed{preview.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {preview.slice(0, 40).map((b) => (
                <span key={b} className="text-xs px-2 py-0.5 rounded-lg font-mono"
                  style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>{b}</span>
              ))}
              {preview.length > 40 && (
                <span className="text-xs" style={{ color: '#94A3B8' }}>+{preview.length - 40} more</span>
              )}
            </div>
          </div>
        )}

        {error && <div className="text-sm rounded-xl px-3 py-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading || preview.length === 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: (loading || preview.length === 0) ? '#94A3B8' : '#0D9488',
              color: '#fff', border: 'none',
              cursor: (loading || preview.length === 0) ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Adding…' : `Add ${preview.length} Bed${preview.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
