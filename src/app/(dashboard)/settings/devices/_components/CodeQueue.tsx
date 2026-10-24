'use client'

import { useState, useTransition, useMemo } from 'react'
import { HelpCircle, Check, EyeOff, Wand2 } from 'lucide-react'
import Combobox from '@/components/ui/Combobox'
import { formatUnit } from '@/lib/lab/units'
import {
  mapAnalyzerCode, mapAnalyzerCodes, ignoreAnalyzerCode,
  type UnknownCode, type AnalyteOption,
} from '@/app/actions/devices'
import { suggestAll, type Suggestion } from '@/lib/lab/suggestAnalyte'

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
 *
 * ── Suggestions, and the line they do not cross ───────────────────────────
 *
 * Most of these answers are obvious — WBC is WBC, HB is haemoglobin — and a
 * new haematology analyzer can arrive with two dozen of them at once. Making
 * somebody search a dropdown two dozen times, in a laboratory, on a computer
 * that is not theirs, is how a five minute job becomes an afternoon.
 *
 * So each row opens with a guess already in the box, labelled with how sure
 * it is. Nothing is written until a person presses Confirm. The one-click
 * button covers ONLY the codes the machine and the catalogue spell
 * identically; a looser guess is shown, and still has to be agreed to one at
 * a time, because "CA" is calcium on one instrument and a tumour marker on
 * another and only the person beside the machine knows which sent it.
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

  const suggestions = useMemo(() => suggestAll(codes, analytes), [codes, analytes])
  // Only the identical ones. Everything else is a prompt, not an answer.
  const certain = useMemo(
    () => codes.filter((c) => suggestions.get(c.mapping_id)?.confidence === 'exact'),
    [codes, suggestions],
  )

  // The picker works on labels; this maps back to the analyte behind one.
  const { labels, byLabel } = useMemo(() => {
    const byLabel = new Map<string, AnalyteOption>()
    const labels: string[] = []
    for (const a of analytes) {
      const label = `${a.name} (${a.code})${a.unit_ucum ? ` · ${formatUnit(a.unit_ucum)}` : ''}`
      labels.push(label)
      byLabel.set(label, a)
    }
    return { labels, byLabel }
  }, [analytes])

  const labelFor = (a: Suggestion['analyte']) =>
    `${a.name} (${a.code})${a.unit_ucum ? ` · ${formatUnit(a.unit_ucum)}` : ''}`

  if (!codes.length) return null

  function confirmAllCertain() {
    setError('')
    startTransition(async () => {
      const res = await mapAnalyzerCodes(certain.map((c) => ({
        mappingId: c.mapping_id,
        analyteId: suggestions.get(c.mapping_id)!.analyte.id,
      })))
      if (!res.success) { setError(res.error); return }
      onChange()
    })
  }

  function confirm(c: UnknownCode) {
    const label = picked[c.mapping_id]
    // An untouched row still carries the suggestion shown in the box, so
    // pressing Confirm agrees to what is on screen rather than to nothing.
    const analyte = label
      ? byLabel.get(label)
      : suggestions.get(c.mapping_id)?.analyte
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

          {certain.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button onClick={confirmAllCertain} disabled={isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Wand2 className="w-3.5 h-3.5" />
                {isPending ? 'Confirming…' : `Confirm the ${certain.length} that match exactly`}
              </button>
              <span className="text-xs" style={{ color: '#64748B' }}>
                {certain.map((c) => c.analyzer_code).join(', ')}
              </span>
            </div>
          )}
        </div>

        {codes.map((c) => (
          <div key={c.mapping_id} className="px-4 py-3" style={{ background: '#fff', borderTop: '1px solid #FEF3C7' }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
              <span className="text-sm font-mono font-bold" style={{ color: '#0F172A' }}>{c.analyzer_code}</span>
              {c.last_value && (
                <span className="text-xs" style={{ color: '#475569' }}>
                  last sent <strong>{c.last_value}</strong>{c.unit_ucum ? ` ${formatUnit(c.unit_ucum)}` : ''}
                </span>
              )}
              {c.times_seen > 0 && (
                <span className="text-xs" style={{ color: '#94A3B8' }}>
                  seen {c.times_seen} time{c.times_seen > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-xs" style={{ color: '#94A3B8' }}>· {c.analyzer_label}</span>
              {/* How sure the guess is, so it can be judged rather than trusted. */}
              {suggestions.has(c.mapping_id) && !picked[c.mapping_id] && (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={suggestions.get(c.mapping_id)!.confidence === 'exact'
                    ? { background: 'rgba(13,148,136,0.1)', color: '#0D9488' }
                    : { background: '#FEF3C7', color: '#92400E' }}>
                  {suggestions.get(c.mapping_id)!.confidence === 'exact'
                    ? 'same code'
                    : `guess — ${suggestions.get(c.mapping_id)!.because}`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex-1 min-w-[220px]">
                <Combobox
                  value={picked[c.mapping_id]
                    ?? (suggestions.has(c.mapping_id)
                      ? labelFor(suggestions.get(c.mapping_id)!.analyte)
                      : '')}
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
