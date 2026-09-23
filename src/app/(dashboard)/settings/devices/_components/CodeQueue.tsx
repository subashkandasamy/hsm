'use client'

import { useState, useTransition, useMemo } from 'react'
import { HelpCircle, Check, EyeOff } from 'lucide-react'
import Combobox from '@/components/ui/Combobox'
import {
  mapAnalyzerCode, ignoreAnalyzerCode,
  type UnknownCode, type AnalyteOption,
} from '@/app/actions/devices'

/**
 * Codes the machine sent that we cannot yet translate.
 *
 * These are not errors. An analyzer has its own vocabulary — one calls
 * haemoglobin HGB, another HB, a third RBC-HGB — and this is it telling us
 * what its words are. Each one is answered once and never asked again.
 *
 * The value it last reported is shown beside the code, because a technician
 * can recognise "4.2" as a CRP far faster than they can recognise "CRP-HS".
 *
 * Until a code is answered, results under it are simply not recorded. That is
 * the safe direction to fail: a missing measurement is visible, whereas one
 * filed under the wrong name is not.
 */
export default function CodeQueue({
  codes, analytes, onChange,
}: {
  codes: UnknownCode[]
  analytes: AnalyteOption[]
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  // The picker works on labels; this maps back to the analyte behind one.
  const { labels, byLabel } = useMemo(() => {
    const byLabel = new Map<string, AnalyteOption>()
    const labels: string[] = []
    for (const a of analytes) {
      const label = `${a.name} (${a.code})${a.unit_ucum ? ` · ${a.unit_ucum}` : ''}`
      labels.push(label)
      byLabel.set(label, a)
    }
    return { labels, byLabel }
  }, [analytes])

  if (!codes.length) return null

  function confirm(c: UnknownCode) {
    const label = picked[c.mapping_id]
    const analyte = label ? byLabel.get(label) : undefined
    if (!analyte) { setError('Choose what this code measures'); return }
    setError('')
    startTransition(async () => {
      const res = await mapAnalyzerCode(c.mapping_id, analyte.id)
      if (!res.success) { setError(res.error); return }
      onChange()
    })
  }

  function ignore(c: UnknownCode) {
    startTransition(async () => {
      await ignoreAnalyzerCode(c.mapping_id)
      onChange()
    })
  }

  return (
    <section className="mb-6">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #FDE68A', background: '#FFFBEB' }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #FDE68A' }}>
          <HelpCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#B45309' }} />
          <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
            {codes.length} measurement{codes.length > 1 ? 's' : ''} your analyzer sends
            {codes.length > 1 ? ' that are' : ' that is'} not recognised
          </p>
        </div>

        <div className="px-4 py-2.5" style={{ background: '#fff', borderBottom: '1px solid #FEF3C7' }}>
          <p className="text-xs" style={{ color: '#64748B' }}>
            Tell us what each one measures. You only answer once — the same machine
            will be understood from then on, and so will the next hospital&rsquo;s.
          </p>
        </div>

        {codes.map((c) => (
          <div key={c.mapping_id} className="px-4 py-3" style={{ background: '#fff', borderTop: '1px solid #FEF3C7' }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
              <span className="text-sm font-mono font-bold" style={{ color: '#0F172A' }}>{c.analyzer_code}</span>
              {c.last_value && (
                <span className="text-xs" style={{ color: '#475569' }}>
                  last sent <strong>{c.last_value}</strong>{c.unit_ucum ? ` ${c.unit_ucum}` : ''}
                </span>
              )}
              {c.times_seen > 0 && (
                <span className="text-xs" style={{ color: '#94A3B8' }}>
                  seen {c.times_seen} time{c.times_seen > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-xs" style={{ color: '#94A3B8' }}>· {c.analyzer_label}</span>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex-1 min-w-[220px]">
                <Combobox
                  value={picked[c.mapping_id] ?? ''}
                  onChange={(v) => setPicked((p) => ({ ...p, [c.mapping_id]: v }))}
                  options={labels}
                  allowCustom={false}
                  placeholder="What does this measure?"
                />
              </div>
              <button onClick={() => confirm(c)} disabled={isPending}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Check className="w-3.5 h-3.5" /> Confirm
              </button>
              <button onClick={() => ignore(c)} disabled={isPending}
                title="This is not a patient measurement"
                className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5"
                style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                <EyeOff className="w-3.5 h-3.5" /> Not needed
              </button>
            </div>
          </div>
        ))}

        {error && (
          <p className="text-xs px-4 py-2" style={{ background: '#fff', color: '#DC2626' }}>{error}</p>
        )}
      </div>
    </section>
  )
}
