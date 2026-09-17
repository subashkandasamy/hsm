'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, Scale } from 'lucide-react'
import { checkChildDose, recordDosingWeight } from '@/app/actions/dosing'
import type { DoseCheckInput, DoseCheckResult } from '@/lib/dosing/evaluate'
import { DOSE_SOURCE } from '@/lib/dosing/paediatric'

interface Props {
  input: DoseCheckInput
  /** Called with true when the dose is above the maximum, so the form can require the override. */
  onOverMax?: (over: boolean) => void
  override: boolean
  onOverride: (v: boolean) => void
  canRecordWeight: boolean
}

const TONE = {
  severe:   { bg: '#FEE2E2', fg: '#B91C1C', border: '#FECACA' },
  moderate: { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' },
  watch:    { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
  info:     { bg: '#F8FAFC', fg: '#475569', border: '#E2E8F0' },
}

/** Weight-based dose check for children, shown under a prescription / medication order form. */
export default function DoseCheckPanel({ input, onOverMax, override, onOverride, canRecordWeight }: Props) {
  const [res, setRes] = useState<DoseCheckResult | null>(null)
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)
  const [weightError, setWeightError] = useState('')
  const [reload, setReload] = useState(0)
  const key = JSON.stringify(input)

  useEffect(() => {
    let active = true
    const t = setTimeout(async () => {
      if (input.drugName.trim().length < 3) { if (active) { setRes(null); onOverMax?.(false) } return }
      const r = await checkChildDose(JSON.parse(key) as DoseCheckInput).catch(() => null)
      if (!active) return
      setRes(r)
      onOverMax?.(r?.status === 'over_max')
    }, 450)
    return () => { active = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures the input
  }, [key, reload])

  if (!res || !res.isChild || (!res.rule && res.messages.length === 0)) return null

  async function saveWeight() {
    setWeightError('')
    setSaving(true)
    const r = await recordDosingWeight(input.patientId, Number(weight), input.visitId ?? null)
    setSaving(false)
    if (!r.success) { setWeightError(r.error); return }
    setWeight(''); setReload((n) => n + 1)
  }

  const s = res.suggestion
  const needsWeight = res.rule && res.weightKg == null
  return (
    <div className="mt-2 rounded-xl px-3 py-2.5 space-y-1.5 text-xs" style={{ background: 'rgba(240,253,250,0.6)', border: '1px solid #CCFBF1' }} aria-live="polite">
      <div className="flex items-center gap-2 flex-wrap">
        <Scale className="w-3.5 h-3.5 shrink-0" style={{ color: '#0D9488' }} />
        <span className="font-semibold" style={{ color: '#0F172A' }}>Child dose check{res.rule ? ` · ${res.rule.label}` : ''}</span>
        {res.weightKg != null && (
          <span style={{ color: '#475569' }}>
            for {res.weightKg} kg{res.weighedOn ? ` (weighed ${new Date(`${res.weighedOn}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})` : ''}
          </span>
        )}
        {res.status === 'ok' && <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#15803D' }}><CheckCircle className="w-3.5 h-3.5" /> Within usual range{res.mgPerKgDose != null ? ` · ${res.mgPerKgDose} mg/kg` : ''}</span>}
      </div>

      {needsWeight && canRecordWeight && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5" style={{ color: '#334155' }}>
            Weight today
            <input type="number" inputMode="decimal" step="0.1" min={0} value={weight} onChange={(e) => setWeight(e.target.value)}
              className="w-20 px-2 py-1 rounded-lg" style={{ border: '1px solid #E2E8F0', background: '#fff' }} aria-label="Weight in kg" /> kg
          </label>
          <button type="button" onClick={saveWeight} disabled={saving || !weight}
            className="px-2.5 py-1 rounded-lg font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', opacity: saving || !weight ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save weight'}
          </button>
          {weightError && <span style={{ color: '#B91C1C' }}>{weightError}</span>}
        </div>
      )}

      {s && (
        <p style={{ color: '#334155' }}>
          <span className="font-semibold">Usual dose:</span>{' '}
          {s.perDoseMg[0] === s.perDoseMg[1] ? s.perDoseMg[0] : `${s.perDoseMg[0]}–${s.perDoseMg[1]}`} mg
          {s.perDoseMl ? ` (${s.perDoseMl[0] === s.perDoseMl[1] ? s.perDoseMl[0] : `${s.perDoseMl[0]}–${s.perDoseMl[1]}`} ml)` : ''} per dose,{' '}
          {s.dosesPerDay[0] === s.dosesPerDay[1] ? s.dosesPerDay[0] : `${s.dosesPerDay[0]}–${s.dosesPerDay[1]}`} time{s.dosesPerDay[1] > 1 ? 's' : ''} a day
          <span style={{ color: '#64748B' }}> · {s.basis}</span>
        </p>
      )}

      {res.parseError && <p style={{ color: '#92400E' }}>{res.parseError}</p>}
      {res.messages.map((m, i) => (
        <p key={i} className="flex items-start gap-1.5 px-2 py-1 rounded-lg" style={{ background: TONE[m.level].bg, color: TONE[m.level].fg, border: `1px solid ${TONE[m.level].border}` }}>
          {m.level !== 'info' && <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />}
          <span>{m.text}</span>
        </p>
      ))}

      {res.status === 'over_max' && (
        <label className="flex items-center gap-2 font-semibold" style={{ color: '#B91C1C' }}>
          <input type="checkbox" checked={override} onChange={(e) => onOverride(e.target.checked)} />
          Override — I have checked this dose and intend it
        </label>
      )}
      {res.rule && <p className="text-[10px]" style={{ color: '#94A3B8' }}>Guide only · {DOSE_SOURCE}</p>}
    </div>
  )
}
