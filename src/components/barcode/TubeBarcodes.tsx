'use client'

import { useState } from 'react'
import { Barcode, Check, Copy } from 'lucide-react'
import type { LabOrder } from '@/lib/types'

/**
 * The tube barcodes of one lab order, exactly as the label's bars encode them.
 *
 * Asked for at Karur, 9 Nov 2026: a technician typed the order number shown on
 * the card (2610230004) into an analyzer, but the tube's barcode is
 * 261023000401, so the result could not find its patient. This is the number
 * to scan or type into the analyzer's Sample ID. Tapping copies it.
 */
export default function TubeBarcodes({ samples }: { samples?: LabOrder['samples'] }) {
  const [copied, setCopied] = useState<string | null>(null)
  if (!samples?.length) return null

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    } catch {
      // Clipboard blocked (http, old browser): the number is on screen to read.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label="Tube barcodes">
      {samples.map((s) => (
        <button
          key={s.barcode}
          type="button"
          onClick={() => copy(s.barcode)}
          title="Sample ID for the analyzer — tap to copy"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', cursor: 'pointer', outlineColor: '#7C3AED' }}>
          <Barcode className="w-3.5 h-3.5" style={{ color: '#64748B' }} aria-hidden />
          <span className="font-mono font-semibold tabular-nums tracking-wide">{s.barcode}</span>
          {s.tube?.label && (
            <span className="uppercase text-[10px] font-semibold" style={{ color: '#64748B', letterSpacing: '0.04em' }}>
              {s.tube.label}
            </span>
          )}
          {copied === s.barcode
            ? <Check className="w-3 h-3" style={{ color: '#16A34A' }} aria-label="Copied" />
            : <Copy className="w-3 h-3" style={{ color: '#94A3B8' }} aria-hidden />}
        </button>
      ))}
    </div>
  )
}
