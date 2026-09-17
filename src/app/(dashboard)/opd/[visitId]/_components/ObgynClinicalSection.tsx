'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle, ClipboardList, HeartPulse, Pencil, Save, Stethoscope } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { saveClinicalData } from '@/app/actions/opd'
import {
  clearAncCareItem, createAnc, getObgynContext, markAncCareItem, saveVisitAncCheck, setAncStatus, updateAnc,
  type ObgynContext,
} from '@/app/actions/obstetrics'
import { chooseEdd, formatGa, gaOn, trimester } from '@/lib/obstetrics/dating'
import { careSchedule, type CareItemStatus } from '@/lib/obstetrics/ancSchedule'
import { ancAlerts, DANGER_SIGNS, gynAlerts, pregnancyRiskFlags, type ClinicalAlert } from '@/lib/obstetrics/alerts'
import { istToday } from '@/lib/istDate'
import type { AncRecord, ObgynVisitData } from '@/lib/types'

interface Props {
  visitId: string
  patientId: string
  initialContext: ObgynContext
  initialData: ObgynVisitData | null
  disabled?: boolean
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none',
  borderRadius: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', minHeight: '40px',
}
const ACCENT = '#BE185D'

const LEVEL: Record<ClinicalAlert['level'], { bg: string; fg: string; border: string }> = {
  severe:   { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  moderate: { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' },
  watch:    { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const RISK_FACTORS = [
  'Previous PPH', 'Previous stillbirth / neonatal death', 'Previous preterm birth', 'Recurrent miscarriage',
  'Chronic hypertension', 'Pre-existing diabetes', 'Thyroid disorder', 'Heart disease', 'Epilepsy',
  'Twins / multiple pregnancy', 'Placenta praevia', 'IVF pregnancy', 'HIV / HBsAg / syphilis positive', 'Short stature (< 140 cm)',
]
const CONTRACEPTION = [
  'None', 'Condoms', 'Oral contraceptive pill', 'Centchroman (Chhaya)', 'Injectable DMPA (Antara)',
  'IUCD (Copper-T)', 'Hormonal IUD', 'Implant', 'Tubal ligation', 'Partner vasectomy', 'Natural methods',
]
const CARE_GROUP_LABEL = { test: 'Test', scan: 'Scan', vaccine: 'Vaccine', supplement: 'Supplement', plan: 'Counselling' } as const

const num = (v: string) => (v.trim() === '' ? null : Number(v))
const str = (v: number | null | undefined) => (v == null ? '' : String(v))
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

function blankNotes(prev: ObgynVisitData | null, mode: ObgynVisitData['mode']): ObgynVisitData {
  // Carry forward history that does not change visit to visit.
  return {
    template: 'obgyn', mode, danger_signs: [], complaints: '', notes: '',
    menstrual: {
      lmp: null, cycle_days: prev?.menstrual.cycle_days ?? null, bleeding_days: prev?.menstrual.bleeding_days ?? null,
      regularity: prev?.menstrual.regularity ?? null, flow: prev?.menstrual.flow ?? null, dysmenorrhoea: prev?.menstrual.dysmenorrhoea ?? null,
      intermenstrual_bleeding: false, postcoital_bleeding: false,
      menarche_age: prev?.menstrual.menarche_age ?? null, menopausal: prev?.menstrual.menopausal ?? false,
      menopause_age: prev?.menstrual.menopause_age ?? null, postmenopausal_bleeding: false,
    },
    obstetric: prev?.obstetric ?? { gravida: null, para: null, abortions: null, living: null, caesareans: null },
    contraception: prev?.contraception ?? '',
    hysterectomy: prev?.hysterectomy ?? false,
    exam: { breast: '', abdomen: '', per_speculum: '', per_vaginal: '' },
    screening: prev?.screening ?? { test: null, date: null, result: '' },
  }
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>{label}</span>
      {children}
    </label>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>{children}</p>
}

function Alerts({ items }: { items: ClinicalAlert[] }) {
  if (!items.length) return null
  const order = { severe: 0, moderate: 1, watch: 2 }
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {[...items].sort((a, b) => order[a.level] - order[b.level]).map((a, i) => (
        <li key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl text-sm"
          style={{ background: LEVEL[a.level].bg, color: LEVEL[a.level].fg, border: `1px solid ${LEVEL[a.level].border}` }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{a.text}</span>
        </li>
      ))}
    </ul>
  )
}

export default function ObgynClinicalSection({ visitId, patientId, initialContext, initialData, disabled }: Props) {
  const [ctx, setCtx] = useState(initialContext)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const refresh = async () => setCtx(await getObgynContext(patientId, visitId))

  const preg = ctx.pregnancy
  const pregActive = preg?.status === 'active'
  const [notes, setNotes] = useState<ObgynVisitData>(() => initialData ?? blankNotes(initialContext.previousNotes, pregActive || initialContext.visitAnc ? 'antenatal' : 'gynaecology'))
  const [notesSaved, setNotesSaved] = useState(false)
  const setMode = (mode: ObgynVisitData['mode']) => setNotes((n) => ({ ...n, mode }))

  function saveNotes() {
    setError(''); setNotesSaved(false)
    startTransition(async () => {
      const res = await saveClinicalData(visitId, notes as unknown as Record<string, unknown>)
      if (!res.success) { setError(res.error); return }
      setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2500)
    })
  }

  if (ctx.sex === 'male') {
    return (
      <GlassCard className="p-4 sm:p-5">
        <p className="text-sm" style={{ color: '#475569' }}>
          This patient is registered as male. The Obstetrics &amp; Gynaecology assessment is shown for female patients — correct the sex on the patient profile if it is wrong.
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
          <HeartPulse className="w-4 h-4" style={{ color: ACCENT }} />
          Obstetrics &amp; Gynaecology
        </h3>
        <div role="tablist" aria-label="Consultation type" className="inline-flex p-0.5 rounded-lg" style={{ background: '#F1F5F9' }}>
          {(['antenatal', 'gynaecology'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={notes.mode === m} onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold"
              style={{ background: notes.mode === m ? '#fff' : 'transparent', color: notes.mode === m ? ACCENT : '#64748B', border: 'none', cursor: 'pointer', boxShadow: notes.mode === m ? '0 1px 2px rgba(15,23,42,0.08)' : 'none' }}>
              {m === 'antenatal' ? 'Antenatal' : 'Gynaecology'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
      )}

      {notes.mode === 'antenatal' ? (
        <AntenatalPanel ctx={ctx} notes={notes} setNotes={setNotes} disabled={disabled} patientId={patientId} visitId={visitId}
          isPending={isPending} startTransition={startTransition} setError={setError} refresh={refresh} />
      ) : (
        <GynaecologyPanel ctx={ctx} notes={notes} setNotes={setNotes} disabled={disabled} />
      )}

      {!disabled && (
        <div className="flex justify-end mt-4">
          <button onClick={saveNotes} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: notesSaved ? '#DCFCE7' : ACCENT, color: notesSaved ? '#15803D' : '#fff', border: 'none', cursor: isPending ? 'wait' : 'pointer' }}>
            {notesSaved ? <><CheckCircle className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save {notes.mode === 'antenatal' ? 'notes' : 'gynaecology notes'}</>}
          </button>
        </div>
      )}
    </GlassCard>
  )
}

// ── Antenatal ──────────────────────────────────────────────────────────────────

interface PanelProps {
  ctx: ObgynContext
  notes: ObgynVisitData
  setNotes: React.Dispatch<React.SetStateAction<ObgynVisitData>>
  disabled?: boolean
}

function AntenatalPanel({ ctx, notes, setNotes, disabled, patientId, visitId, isPending, startTransition, setError, refresh }: PanelProps & {
  patientId: string; visitId: string; isPending: boolean
  startTransition: React.TransitionStartFunction; setError: (e: string) => void; refresh: () => Promise<void>
}) {
  const preg = ctx.pregnancy
  const [editing, setEditing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const gaDays = preg ? gaOn(preg.edd, ctx.visitDate) : null

  const va = ctx.visitAnc
  const [check, setCheck] = useState({
    weight_kg: str(va?.weight_kg), bp: va?.bp ?? '', pallor: va?.pallor ?? false, oedema: va?.oedema ?? '',
    fundal_height_cm: str(va?.fundal_height_cm), fetal_heart_rate: str(va?.fetal_heart_rate), fetal_movements: va?.fetal_movements ?? '',
    presentation: va?.presentation ?? '', urine_albumin: va?.urine_albumin ?? '', urine_sugar: va?.urine_sugar ?? '', hb: str(va?.hb),
  })
  const [checkSaved, setCheckSaved] = useState(false)
  function saveCheck() {
    setError(''); setCheckSaved(false)
    startTransition(async () => {
      const res = await saveVisitAncCheck(visitId, {
        ...check, weight_kg: num(check.weight_kg), fundal_height_cm: num(check.fundal_height_cm),
        fetal_heart_rate: num(check.fetal_heart_rate), hb: num(check.hb), pallor: check.pallor,
      })
      if (!res.success) { setError(res.error); return }
      await refresh()
      setCheckSaved(true); setTimeout(() => setCheckSaved(false), 2500)
    })
  }

  const alerts = useMemo(() => preg ? ancAlerts({
    gaDays, bp: check.bp, urine_albumin: check.urine_albumin, urine_sugar: check.urine_sugar, hb: num(check.hb),
    fetal_heart_rate: num(check.fetal_heart_rate), fundal_height_cm: num(check.fundal_height_cm),
    fetal_movements: check.fetal_movements, oedema: check.oedema, presentation: check.presentation,
    danger_signs: notes.danger_signs, previous_caesareans: preg.previous_caesareans ?? null,
  }) : [], [preg, gaDays, check, notes.danger_signs])

  if (!preg || editing) {
    return (
      <PregnancyForm ctx={ctx} existing={editing ? preg : null} disabled={disabled} gynLmp={notes.menstrual.lmp}
        onCancel={editing ? () => setEditing(false) : undefined}
        onSave={(input) => {
          setError('')
          startTransition(async () => {
            const res = editing && preg ? await updateAnc(preg.id, input) : await createAnc(patientId, input)
            if (!res.success) { setError(res.error); return }
            await refresh(); setEditing(false)
          })
        }} isPending={isPending} />
    )
  }

  const active = preg.status === 'active'
  const autoRisks = pregnancyRiskFlags({ age: ctx.age, gravida: preg.gravida, previous_caesareans: preg.previous_caesareans ?? null, bloodGroup: ctx.bloodGroup })
  const risks = [...autoRisks, ...(preg.risk_factors ?? [])]
  const lateGa = gaDays != null && gaDays >= 20 * 7
  const previous = ctx.ancVisits.filter((v) => v.visit_id !== visitId).slice(0, 6)

  function closeRecord() {
    setConfirmClose(false)
    if (!preg) return
    startTransition(async () => {
      const res = await setAncStatus(preg.id, 'closed')
      if (!res.success) { setError(res.error); return }
      await refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Pregnancy summary */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ['Gestation', gaDays != null && gaDays >= 0 ? `${formatGa(gaDays)} · T${trimester(gaDays)}` : '—'],
            ['EDD', preg.edd ? `${fmtDate(preg.edd)}${preg.edd_basis ? ` (${preg.edd_basis === 'scan' ? 'by scan' : 'by LMP'})` : ''}` : 'Not dated'],
            ['G P A L', `G${preg.gravida ?? '–'} P${preg.para ?? '–'} A${preg.abortions ?? '–'} L${preg.living ?? '–'}`],
            ['Blood group', ctx.bloodGroup ?? '—'],
          ] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl px-3 py-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
              <p className="text-xs" style={{ color: '#64748B' }}>{l}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: '#0F172A' }}>{v}</p>
            </div>
          ))}
        </div>
        {risks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>High risk:</span>
            {risks.map((r) => (
              <span key={r} className="text-xs px-2 py-0.5 rounded-md" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>{r}</span>
            ))}
          </div>
        )}
        {!active && (
          <p className="text-xs mt-2 px-3 py-2 rounded-xl" style={{ background: '#F1F5F9', color: '#475569' }}>
            This pregnancy record is {preg.status}. The check below was recorded against it.
          </p>
        )}
        {gaDays != null && gaDays > 42 * 7 && active && (
          <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>Gestation is past 42 weeks — if the baby has been delivered, close or update this record.</p>
        )}
        {!disabled && active && (
          <div className="flex gap-2 mt-2">
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <Pencil className="w-3 h-3" /> Edit dates &amp; history
            </button>
            <button onClick={() => setConfirmClose(true)} disabled={isPending} className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              Close record
            </button>
          </div>
        )}
      </section>

      {/* Danger signs */}
      <section>
        <SectionLabel>Danger signs today</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {DANGER_SIGNS.map((d) => {
            const on = notes.danger_signs.includes(d.key)
            return (
              <button key={d.key} disabled={disabled} aria-pressed={on}
                onClick={() => setNotes((n) => ({ ...n, danger_signs: on ? n.danger_signs.filter((k) => k !== d.key) : [...n.danger_signs, d.key] }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ border: '1px solid', borderColor: on ? '#FCA5A5' : '#E2E8F0', background: on ? '#FEE2E2' : '#fff', color: on ? '#B91C1C' : '#475569', cursor: disabled ? 'default' : 'pointer' }}>
                {d.label}
              </button>
            )
          })}
        </div>
        {notes.danger_signs.length === 0 && <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>None ticked — mark any the patient reports.</p>}
      </section>

      {/* Today's antenatal check */}
      <section>
        <SectionLabel>Antenatal check today</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Weight (kg)"><input type="number" inputMode="decimal" step="0.1" min={0} value={check.weight_kg} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, weight_kg: e.target.value }))} style={inputStyle} /></Field>
          <Field label="BP (mmHg)"><input inputMode="numeric" placeholder="120/80" value={check.bp} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, bp: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Hb (g/dL)"><input type="number" inputMode="decimal" step="0.1" min={0} value={check.hb} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, hb: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Oedema">
            <select value={check.oedema} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, oedema: e.target.value }))} style={inputStyle}>
              <option value="">—</option><option>None</option><option>Pedal</option><option>Facial</option><option>Generalised</option>
            </select>
          </Field>
          <Field label="Fundal height (cm)"><input type="number" inputMode="decimal" step="0.5" min={0} value={check.fundal_height_cm} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, fundal_height_cm: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Fetal heart (/min)"><input type="number" inputMode="numeric" min={0} value={check.fetal_heart_rate} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, fetal_heart_rate: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Fetal movements">
            <select value={check.fetal_movements} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, fetal_movements: e.target.value }))} style={inputStyle}>
              <option value="">—</option><option>Not yet felt</option><option>Normal</option><option>Reduced</option><option>Absent</option>
            </select>
          </Field>
          {lateGa && (
            <Field label="Presentation">
              <select value={check.presentation} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, presentation: e.target.value }))} style={inputStyle}>
                <option value="">—</option><option>Cephalic</option><option>Breech</option><option>Transverse</option><option>Oblique</option>
              </select>
            </Field>
          )}
          <Field label="Urine albumin">
            <select value={check.urine_albumin} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, urine_albumin: e.target.value }))} style={inputStyle}>
              <option value="">—</option>{['Nil', 'Trace', '1+', '2+', '3+', '4+'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Urine sugar">
            <select value={check.urine_sugar} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, urine_sugar: e.target.value }))} style={inputStyle}>
              <option value="">—</option>{['Nil', 'Trace', '1+', '2+', '3+', '4+'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm self-end pb-2" style={{ color: '#334155' }}>
            <input type="checkbox" checked={check.pallor} disabled={disabled || !active} onChange={(e) => setCheck((c) => ({ ...c, pallor: e.target.checked }))} />
            Pallor
          </label>
        </div>
        {!disabled && active && (
          <div className="flex justify-end mt-3">
            <button onClick={saveCheck} disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: checkSaved ? '#DCFCE7' : '#0D9488', color: checkSaved ? '#15803D' : '#fff', border: 'none', cursor: isPending ? 'wait' : 'pointer' }}>
              {checkSaved ? <><CheckCircle className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save check</>}
            </button>
          </div>
        )}
        <div className="mt-3"><Alerts items={alerts} /></div>
      </section>

      {previous.length > 0 && (
        <section>
          <SectionLabel>Earlier checks</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs tabular-nums" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
              <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>
                {['Date', 'GA', 'Wt', 'BP', 'Fundal', 'FHR', 'Hb', 'Urine alb/sugar'].map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}
              </tr></thead>
              <tbody>{previous.map((v) => (
                <tr key={v.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: '#64748B' }}>{fmtDate(v.visit_date)}</td>
                  <td className="px-2 py-1.5">{formatGa(gaOn(preg.edd, v.visit_date))}</td>
                  <td className="px-2 py-1.5">{v.weight_kg ?? '—'}</td><td className="px-2 py-1.5">{v.bp ?? '—'}</td>
                  <td className="px-2 py-1.5">{v.fundal_height_cm ?? '—'}</td><td className="px-2 py-1.5">{v.fetal_heart_rate ?? '—'}</td>
                  <td className="px-2 py-1.5">{v.hb ?? '—'}</td><td className="px-2 py-1.5">{v.urine_albumin ?? '—'} / {v.urine_sugar ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <CareSchedule ctx={ctx} gaDays={gaDays} disabled={disabled || !active} isPending={isPending}
        startTransition={startTransition} setError={setError} refresh={refresh} />

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={closeRecord}
        loading={isPending}
        title="Close pregnancy record?"
        description="Use this for a miscarriage, termination or when care moves elsewhere. Deliveries are recorded on the admission's Labour & Delivery tab."
        confirmLabel="Close record"
      />

      <Field label="Complaints & advice">
        <textarea rows={3} value={notes.complaints} disabled={disabled}
          onChange={(e) => setNotes((n) => ({ ...n, complaints: e.target.value }))}
          placeholder="Nausea, back pain, diet and rest advice, when to come back…"
          style={{ ...inputStyle, minHeight: '76px', resize: 'vertical' }} />
      </Field>
    </div>
  )
}

function PregnancyForm({ ctx, existing, disabled, gynLmp, onSave, onCancel, isPending }: {
  ctx: ObgynContext; existing: AncRecord | null; disabled?: boolean; gynLmp: string | null
  onSave: (input: Record<string, unknown>) => void; onCancel?: () => void; isPending: boolean
}) {
  const scanGa = existing?.scan_ga_days ?? null
  const [f, setF] = useState({
    lmp: existing?.lmp ?? gynLmp ?? '', scan_date: existing?.scan_date ?? '',
    scan_weeks: scanGa != null ? String(Math.floor(scanGa / 7)) : '', scan_days: scanGa != null ? String(scanGa % 7) : '',
    gravida: str(existing?.gravida), para: str(existing?.para), abortions: str(existing?.abortions), living: str(existing?.living),
    previous_caesareans: str(existing?.previous_caesareans), blood_group: existing?.blood_group ?? ctx.bloodGroup ?? '',
  })
  const [risks, setRisks] = useState<string[]>(existing?.risk_factors ?? [])
  const [otherRisk, setOtherRisk] = useState('')
  const today = istToday()
  const scanGaDays = f.scan_weeks !== '' ? Number(f.scan_weeks) * 7 + Number(f.scan_days || 0) : null
  const dating = chooseEdd({ lmp: f.lmp || null, scanDate: f.scan_date || null, scanGaDays })

  if (disabled) {
    return <p className="text-sm" style={{ color: '#64748B' }}>No pregnancy record for this visit.</p>
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  function submit() {
    const allRisks = [...risks, ...otherRisk.split(',').map((r) => r.trim()).filter(Boolean)]
    onSave({
      lmp: f.lmp || null, scan_date: f.scan_date || null, scan_ga_days: f.scan_date ? scanGaDays : null,
      gravida: num(f.gravida), para: num(f.para), abortions: num(f.abortions), living: num(f.living),
      previous_caesareans: num(f.previous_caesareans), blood_group: f.blood_group || null,
      risk_factors: allRisks, high_risk: allRisks.length > 0, high_risk_notes: allRisks.join(', ') || null,
    })
  }

  return (
    <section className="space-y-4">
      {!existing && (
        <p className="text-sm" style={{ color: '#475569' }}>No ongoing pregnancy is recorded. Start one to track gestation, antenatal checks and the care schedule.</p>
      )}
      <div>
        <SectionLabel>Dating</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="LMP (first day)"><input type="date" max={today} value={f.lmp} onChange={set('lmp')} style={inputStyle} /></Field>
          <Field label="First scan date"><input type="date" max={today} value={f.scan_date} onChange={set('scan_date')} style={inputStyle} /></Field>
          <Field label="Gestation on scan (weeks)"><input type="number" inputMode="numeric" min={5} max={42} value={f.scan_weeks} onChange={set('scan_weeks')} style={inputStyle} /></Field>
          <Field label="+ days"><input type="number" inputMode="numeric" min={0} max={6} value={f.scan_days} onChange={set('scan_days')} style={inputStyle} /></Field>
        </div>
        {dating.edd && (
          <p className="text-xs mt-2" style={{ color: '#334155' }}>
            EDD <strong>{fmtDate(dating.edd)}</strong> {dating.basis === 'scan' ? 'by scan' : 'by LMP'}
            {' · '}{formatGa(gaOn(dating.edd, today))} today
            {dating.discrepancyDays != null && (dating.basis === 'scan'
              ? ` — scan differs from LMP by ${dating.discrepancyDays} days, so the scan dates this pregnancy`
              : ` — scan within ${dating.discrepancyDays} days of LMP, LMP dating kept`)}
          </p>
        )}
        {dating.suboptimal && <p className="text-xs mt-1" style={{ color: '#B45309' }}>First scan after 22 weeks with no LMP — dating is less reliable.</p>}
      </div>
      <div>
        <SectionLabel>Obstetric history</SectionLabel>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {([['gravida', 'Gravida'], ['para', 'Para'], ['abortions', 'Abortions'], ['living', 'Living'], ['previous_caesareans', 'Prev. caesarean']] as const).map(([k, l]) => (
            <Field key={k} label={l}><input type="number" inputMode="numeric" min={0} value={f[k]} onChange={set(k)} style={inputStyle} /></Field>
          ))}
          <Field label="Blood group">
            <select value={f.blood_group} onChange={set('blood_group')} style={inputStyle}>
              <option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>Gravida includes this pregnancy.</p>
      </div>
      <div>
        <SectionLabel>Risk factors</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {RISK_FACTORS.map((r) => {
            const on = risks.includes(r)
            return (
              <button key={r} type="button" aria-pressed={on} onClick={() => setRisks((x) => on ? x.filter((y) => y !== r) : [...x, r])}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ border: '1px solid', borderColor: on ? '#FCA5A5' : '#E2E8F0', background: on ? '#FEE2E2' : '#fff', color: on ? '#B91C1C' : '#475569', cursor: 'pointer' }}>
                {r}
              </button>
            )
          })}
        </div>
        {(existing?.risk_factors ?? []).filter((r) => !RISK_FACTORS.includes(r)).length > 0 && (
          <p className="text-xs mt-1.5" style={{ color: '#475569' }}>
            Also recorded: {(existing?.risk_factors ?? []).filter((r) => !RISK_FACTORS.includes(r)).join(', ')}
          </p>
        )}
        <input className="mt-2" placeholder="Other risk factors, comma separated" value={otherRisk} onChange={(e) => setOtherRisk(e.target.value)} style={inputStyle} />
        <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>Age, grand multiparity, previous caesarean and Rh-negative are flagged automatically.</p>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
        )}
        <button onClick={submit} disabled={isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: ACCENT, color: '#fff', border: 'none', cursor: isPending ? 'wait' : 'pointer' }}>
          <Save className="w-3.5 h-3.5" /> {existing ? 'Save changes' : 'Start pregnancy record'}
        </button>
      </div>
    </section>
  )
}

function CareSchedule({ ctx, gaDays, disabled, isPending, startTransition, setError, refresh }: {
  ctx: ObgynContext; gaDays: number | null; disabled?: boolean; isPending: boolean
  startTransition: React.TransitionStartFunction; setError: (e: string) => void; refresh: () => Promise<void>
}) {
  const preg = ctx.pregnancy!
  const items = careSchedule({ gaDays, today: ctx.visitDate, edd: preg.edd, bloodGroup: ctx.bloodGroup, done: ctx.care })
  const pending = items.filter((i) => i.status === 'overdue' || i.status === 'due')
  const upcoming = items.filter((i) => i.status === 'upcoming').slice(0, 3)
  const done = items.filter((i) => i.status === 'done')
  const missed = items.filter((i) => i.status === 'missed')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [form, setForm] = useState({ done_on: '', result: '' })
  const [showDone, setShowDone] = useState(false)
  const today = istToday()

  function mark(item: CareItemStatus, input: { done_on?: string; result?: string }) {
    setError('')
    startTransition(async () => {
      const res = await markAncCareItem(preg.id, item.key, input)
      if (!res.success) { setError(res.error); return }
      setOpenKey(null); setForm({ done_on: '', result: '' })
      await refresh()
    })
  }
  function undo(item: CareItemStatus) {
    startTransition(async () => {
      const res = await clearAncCareItem(preg.id, item.key)
      if (!res.success) { setError(res.error); return }
      await refresh()
    })
  }

  return (
    <section>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>
        <ClipboardList className="w-3.5 h-3.5" /> Care schedule
      </p>
      {pending.length === 0 ? (
        <p className="text-sm" style={{ color: '#15803D' }}>Nothing due right now.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((i) => (
            <li key={i.key} className="px-3 py-2.5 rounded-xl"
              style={{ background: i.status === 'overdue' ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${i.status === 'overdue' ? '#FECACA' : '#FDE68A'}` }}>
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                    {i.label}
                    <span className="ml-2 text-[11px] font-medium" style={{ color: i.status === 'overdue' ? '#B91C1C' : '#B45309' }}>
                      {i.status === 'overdue' ? 'Overdue' : 'Due'} · {CARE_GROUP_LABEL[i.group]}
                    </span>
                  </p>
                  <p className="text-xs" style={{ color: '#64748B' }}>{i.detail}</p>
                </div>
                {!disabled && (
                  <span className="flex gap-1.5">
                    <button onClick={() => { setOpenKey(openKey === i.key ? null : i.key); setForm({ done_on: '', result: '' }) }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                      Add result / date
                    </button>
                    <button onClick={() => mark(i, {})} disabled={isPending}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      Done today
                    </button>
                  </span>
                )}
              </div>
              {openKey === i.key && (
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2 mt-2">
                  <input type="date" max={today} aria-label="Date done" value={form.done_on} onChange={(e) => setForm((s) => ({ ...s, done_on: e.target.value }))} style={inputStyle} />
                  <input placeholder="Result (e.g. Hb 10.8, OGTT 2h 128, normal scan)" aria-label="Result" value={form.result} onChange={(e) => setForm((s) => ({ ...s, result: e.target.value }))} style={inputStyle} />
                  <span className="flex gap-1.5">
                    <button onClick={() => mark(i, { done_on: form.done_on || undefined, result: form.result })} disabled={isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                    <button onClick={() => mark(i, { result: 'Not required' })} disabled={isPending} title="E.g. Td booster only, or already covered"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Not required</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {upcoming.length > 0 && (
        <p className="text-xs mt-2" style={{ color: '#64748B' }}>
          Next: {upcoming.map((i) => `${i.label}${i.dueDate ? ` (from ${new Date(`${i.dueDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})` : ''}`).join(' · ')}
        </p>
      )}
      {missed.length > 0 && (
        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Window passed: {missed.map((i) => i.label).join(', ')}</p>
      )}
      {done.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-medium" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && (
            <ul className="mt-1.5 space-y-1">
              {done.map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-xs" style={{ color: '#334155' }}>
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#15803D' }} />
                  <span className="flex-1">{i.label} — {fmtDate(i.done!.done_on)}{i.done!.result ? ` · ${i.done!.result}` : ''}</span>
                  {!disabled && (
                    <button onClick={() => undo(i)} disabled={isPending} className="text-xs" style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Undo</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// ── Gynaecology ────────────────────────────────────────────────────────────────

function GynaecologyPanel({ ctx, notes, setNotes, disabled }: PanelProps) {
  const m = notes.menstrual
  const setM = (patch: Partial<ObgynVisitData['menstrual']>) => setNotes((n) => ({ ...n, menstrual: { ...n.menstrual, ...patch } }))
  const setO = (patch: Partial<ObgynVisitData['obstetric']>) => setNotes((n) => ({ ...n, obstetric: { ...n.obstetric, ...patch } }))
  const setE = (patch: Partial<ObgynVisitData['exam']>) => setNotes((n) => ({ ...n, exam: { ...n.exam, ...patch } }))
  const setS = (patch: Partial<ObgynVisitData['screening']>) => setNotes((n) => ({ ...n, screening: { ...n.screening, ...patch } }))
  const today = istToday()
  const pregnant = ctx.pregnancy?.status === 'active'
  const alerts = gynAlerts({ age: ctx.age, today: ctx.visitDate, m, screening: notes.screening, pregnant, hysterectomy: notes.hysterectomy })
  const dis = { disabled, style: inputStyle }

  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>Menstrual history</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="LMP"><input type="date" max={today} value={m.lmp ?? ''} onChange={(e) => setM({ lmp: e.target.value || null })} {...dis} /></Field>
          <Field label="Cycle length (days)"><input type="number" inputMode="numeric" min={0} value={str(m.cycle_days)} onChange={(e) => setM({ cycle_days: num(e.target.value) })} {...dis} /></Field>
          <Field label="Bleeding (days)"><input type="number" inputMode="numeric" min={0} value={str(m.bleeding_days)} onChange={(e) => setM({ bleeding_days: num(e.target.value) })} {...dis} /></Field>
          <Field label="Menarche (age)"><input type="number" inputMode="numeric" min={0} value={str(m.menarche_age)} onChange={(e) => setM({ menarche_age: num(e.target.value) })} {...dis} /></Field>
          <Field label="Cycles">
            <select value={m.regularity ?? ''} onChange={(e) => setM({ regularity: (e.target.value || null) as typeof m.regularity })} {...dis}>
              <option value="">—</option><option value="regular">Regular</option><option value="irregular">Irregular</option>
            </select>
          </Field>
          <Field label="Flow">
            <select value={m.flow ?? ''} onChange={(e) => setM({ flow: (e.target.value || null) as typeof m.flow })} {...dis}>
              <option value="">—</option><option value="scanty">Scanty</option><option value="normal">Normal</option><option value="heavy">Heavy</option>
            </select>
          </Field>
          <Field label="Period pain">
            <select value={m.dysmenorrhoea ?? ''} onChange={(e) => setM({ dysmenorrhoea: (e.target.value || null) as typeof m.dysmenorrhoea })} {...dis}>
              <option value="">—</option><option value="none">None</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm" style={{ color: '#334155' }}>
          <label className="flex items-center gap-2"><input type="checkbox" checked={m.intermenstrual_bleeding} disabled={disabled} onChange={(e) => setM({ intermenstrual_bleeding: e.target.checked })} /> Bleeding between periods</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={m.postcoital_bleeding} disabled={disabled} onChange={(e) => setM({ postcoital_bleeding: e.target.checked })} /> Bleeding after intercourse</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={m.menopausal} disabled={disabled} onChange={(e) => setM({ menopausal: e.target.checked, ...(e.target.checked ? {} : { postmenopausal_bleeding: false, menopause_age: null }) })} /> Postmenopausal</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={notes.hysterectomy} disabled={disabled} onChange={(e) => setNotes((n) => ({ ...n, hysterectomy: e.target.checked }))} /> Hysterectomy done</label>
        </div>
        {m.menopausal && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 items-end">
            <Field label="Menopause (age)"><input type="number" inputMode="numeric" min={0} value={str(m.menopause_age)} onChange={(e) => setM({ menopause_age: num(e.target.value) })} {...dis} /></Field>
            <label className="flex items-center gap-2 text-sm pb-2 col-span-1 sm:col-span-3" style={{ color: '#334155' }}>
              <input type="checkbox" checked={m.postmenopausal_bleeding} disabled={disabled} onChange={(e) => setM({ postmenopausal_bleeding: e.target.checked })} /> Bleeding after menopause
            </label>
          </div>
        )}
      </section>

      <section>
        <SectionLabel>Obstetric history &amp; contraception</SectionLabel>
        {pregnant ? (
          <p className="text-sm" style={{ color: '#334155' }}>
            Currently pregnant — G{ctx.pregnancy!.gravida ?? '–'} P{ctx.pregnancy!.para ?? '–'} A{ctx.pregnancy!.abortions ?? '–'} L{ctx.pregnancy!.living ?? '–'} (see Antenatal).
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {([['gravida', 'Gravida'], ['para', 'Para'], ['abortions', 'Abortions'], ['living', 'Living'], ['caesareans', 'Caesareans']] as const).map(([k, l]) => (
              <Field key={k} label={l}><input type="number" inputMode="numeric" min={0} value={str(notes.obstetric[k])} onChange={(e) => setO({ [k]: num(e.target.value) })} {...dis} /></Field>
            ))}
          </div>
        )}
        <Field label="Contraception" className="mt-3 sm:max-w-xs">
          <select value={notes.contraception} onChange={(e) => setNotes((n) => ({ ...n, contraception: e.target.value }))} {...dis}>
            <option value="">—</option>{CONTRACEPTION.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </section>

      <section>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>
          <Stethoscope className="w-3.5 h-3.5" /> Examination
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([['breast', 'Breasts', 'Lumps, discharge, nodes'], ['abdomen', 'Abdomen', 'Mass, tenderness, scars'], ['per_speculum', 'Per speculum', 'Cervix, discharge, VIA'], ['per_vaginal', 'Per vaginal', 'Uterus size/position, adnexa, tenderness']] as const).map(([k, l, ph]) => (
            <Field key={k} label={l}>
              <textarea rows={2} value={notes.exam[k]} placeholder={ph} disabled={disabled}
                onChange={(e) => setE({ [k]: e.target.value })} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
            </Field>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Cervical screening (last)</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_180px_1fr] gap-3">
          <Field label="Test">
            <select value={notes.screening.test ?? ''} onChange={(e) => setS({ test: (e.target.value || null) as ObgynVisitData['screening']['test'] })} {...dis}>
              <option value="">None / not known</option><option value="via">VIA</option><option value="hpv">HPV test</option><option value="pap">Pap smear</option>
            </select>
          </Field>
          <Field label="Date"><input type="date" max={today} value={notes.screening.date ?? ''} onChange={(e) => setS({ date: e.target.value || null })} {...dis} /></Field>
          <Field label="Result"><input value={notes.screening.result} placeholder="Negative / NILM / abnormal…" onChange={(e) => setS({ result: e.target.value })} {...dis} /></Field>
        </div>
      </section>

      <Alerts items={alerts} />

      <Field label="Complaints, assessment & plan">
        <textarea rows={3} value={notes.notes} disabled={disabled}
          onChange={(e) => setNotes((n) => ({ ...n, notes: e.target.value }))}
          placeholder="White discharge, pelvic pain, infertility work-up, plan…"
          style={{ ...inputStyle, minHeight: '76px', resize: 'vertical' }} />
      </Field>
    </div>
  )
}
