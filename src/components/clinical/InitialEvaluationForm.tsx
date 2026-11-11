'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, Plus, Save, Check, Trash2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import { saveAssessmentSection, type AssessmentOwner, type AssessmentView } from '@/app/actions/initialAssessment'
import {
  sectionsFor, burnRegions, burnTotal, gcsTotal, EFAST_VIEWS, DISPOSITIONS,
  type AssessmentData, type SectionKey, type TreatmentEntry,
} from '@/lib/initialAssessment'
import { SURVEY_SIGNS, SURVEY_SYSTEMS, EXAM_SIGN_LABELS } from '@/lib/clinicalExam'

const TRIAGE: Record<number, string> = { 1: 'Resuscitation', 2: 'Emergent', 3: 'Urgent', 4: 'Less urgent', 5: 'Non-urgent' }

function toLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fromLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const numOrNull = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))
const filled = (o: unknown): boolean =>
  Array.isArray(o) ? o.length > 0
    : o && typeof o === 'object' ? Object.values(o).some(filled)
    : o !== undefined && o !== null && o !== '' && o !== false

const check = { width: '15px', height: '15px', accentColor: '#0D9488', cursor: 'pointer', flexShrink: 0 } as const
const grid = 'grid gap-3 grid-cols-1 sm:grid-cols-2'
const grid4 = 'grid gap-3 grid-cols-2 sm:grid-cols-4'

/**
 * The Initial Evaluation (KMCH's ER Initial Evaluation Record). The same form
 * in the ER consultation and on the IP page: in the ER it shows every section;
 * for a patient admitted from OPD the ER-only ones (primary survey, eFAST,
 * burns, treatment log, shifting note) are left out. Filled in the ER, it
 * follows the patient into the IP file.
 */
export default function InitialEvaluationForm({ view, owner, editable, defaultOpen = false }: {
  view: AssessmentView
  owner: AssessmentOwner
  editable: boolean
  defaultOpen?: boolean
}) {
  const { context: c } = view
  const [data, setData] = useState<AssessmentData>(view.assessment?.data ?? {})
  const [open, setOpen] = useState<SectionKey | null>(defaultOpen ? (c.setting === 'er' ? 'on_arrival' : 'sample') : null)
  const [saving, setSaving] = useState<SectionKey | null>(null)
  const [saved, setSaved] = useState<SectionKey | null>(null)
  const [error, setError] = useState<{ key: SectionKey; text: string } | null>(null)
  const [updatedAt, setUpdatedAt] = useState(view.assessment?.updated_at ?? null)
  const ro = !editable

  // Typed section setters
  function patch<K extends SectionKey>(key: K, v: Partial<NonNullable<AssessmentData[K]>>) {
    setData((d) => ({ ...d, [key]: { ...((d[key] as object | undefined) ?? {}), ...v } }))
  }
  function nested<K extends 'primary_survey'>(key: K, sub: string, v: Record<string, unknown>) {
    setData((d) => {
      const sec = (d[key] ?? {}) as Record<string, Record<string, unknown> | undefined>
      return { ...d, [key]: { ...sec, [sub]: { ...(sec[sub] ?? {}), ...v } } }
    })
  }

  async function save(key: SectionKey) {
    setSaving(key); setError(null)
    const r = await saveAssessmentSection(owner, key, data[key] ?? (key === 'treatment' ? [] : {}))
    setSaving(null)
    if (!r.success) { setError({ key, text: r.error }); return }
    setSaved(key); setUpdatedAt(new Date().toISOString())
    setTimeout(() => setSaved((s) => (s === key ? null : s)), 1800)
  }

  const oa = data.on_arrival ?? {}
  const summaries: Partial<Record<SectionKey, string>> = {
    on_arrival: [
      oa.avpu ? `AVPU ${oa.avpu}` : null,
      oa.hr != null ? `HR ${oa.hr}` : null,
      oa.sbp != null && oa.dbp != null ? `BP ${oa.sbp}/${oa.dbp}` : null,
      oa.spo2 != null ? `SpO₂ ${oa.spo2}%` : null,
      gcsTotal(oa) != null ? `GCS ${gcsTotal(oa)}` : null,
      oa.grbs != null ? `GRBS ${oa.grbs}` : null,
    ].filter(Boolean).join(' · '),
    burns: filled(data.burns?.areas) ? `${burnTotal(data.burns?.areas, c.ageYears)}% body surface` : '',
    plan: data.plan?.provisional_diagnosis ?? '',
    treatment: data.treatment?.length ? `${data.treatment.length} entr${data.treatment.length === 1 ? 'y' : 'ies'}` : '',
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          <ClipboardList className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#0D9488' }} />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              {c.setting === 'er' ? 'ER Initial Evaluation' : 'Initial Evaluation'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              {c.setting === 'er' && c.admissionId ? 'Written in the ER — the first page of this admission. ' : ''}
              {updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}` : 'Not started'}
            </p>
          </div>
        </div>
      </div>

      {c.er && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
            Triage {c.er.triage_level} — {TRIAGE[c.er.triage_level] ?? ''}
          </span>
          {c.er.arrival_mode && <span className="px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{c.er.arrival_mode.replace('_', ' ')}</span>}
          <span className="px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>
            Arrived {new Date(c.er.arrived_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
          </span>
          {c.er.is_mlc && <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>Medico-legal</span>}
        </div>
      )}

      <div className="space-y-2">
        {sectionsFor(c.setting).map(({ key, title }) => {
          const isOpen = open === key
          const summary = summaries[key] || (filled(data[key]) ? 'Recorded' : 'Not filled')
          return (
            <div key={key} className="rounded-xl" style={{ border: '1px solid #E2E8F0', background: isOpen ? '#fff' : 'rgba(248,250,252,0.8)' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : key)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <span className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />}
                  <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{title}</span>
                </span>
                <span className="text-xs truncate" style={{ color: summary === 'Not filled' ? '#94A3B8' : '#0D9488', maxWidth: '55%' }}>{summary}</span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3">
                  {key === 'arrival' && (
                    <>
                      <FormField label="Care before arrival (ambulance / referring hospital)">
                        <SpeechTextarea variant="field" value={data.arrival?.pre_hospital ?? ''} disabled={ro}
                          onChange={(v) => patch('arrival', { pre_hospital: v })} style={{ minHeight: '3.5rem' }} />
                      </FormField>
                      <div className="flex flex-wrap gap-4">
                        {([['iv_fluids', 'IV fluids running'], ['inotropes', 'On inotropes'], ['ventilated', 'Ventilated / bagged']] as const).map(([k, l]) => (
                          <label key={k} className="flex items-center gap-2 text-sm" style={{ color: '#334155' }}>
                            <input type="checkbox" style={check} disabled={ro} checked={!!data.arrival?.[k]} onChange={(e) => patch('arrival', { [k]: e.target.checked })} />
                            {l}
                          </label>
                        ))}
                      </div>
                      <FormField label="Brought by (bystander / relative / police)">
                        <Input value={data.arrival?.bystander ?? ''} disabled={ro} onChange={(e) => patch('arrival', { bystander: e.target.value })} />
                      </FormField>
                    </>
                  )}

                  {key === 'on_arrival' && (
                    <>
                      <div className={grid}>
                        <FormField label="Time">
                          <Input type="datetime-local" value={toLocal(oa.at)} disabled={ro} onChange={(e) => patch('on_arrival', { at: fromLocal(e.target.value) })} />
                        </FormField>
                        <FormField label="AVPU">
                          <Select value={oa.avpu ?? ''} disabled={ro} onChange={(e) => patch('on_arrival', { avpu: e.target.value as 'A' })}>
                            <option value="">—</option>
                            <option value="A">A — Alert</option><option value="V">V — Responds to voice</option>
                            <option value="P">P — Responds to pain</option><option value="U">U — Unresponsive</option>
                          </Select>
                        </FormField>
                      </div>
                      <div className={grid4}>
                        {([['hr', 'Pulse /min'], ['sbp', 'BP systolic'], ['dbp', 'BP diastolic'], ['rr', 'Resp. rate'], ['spo2', 'SpO₂ %'], ['temp', 'Temp °C'],
                          ['grbs', 'GRBS mg/dl'], ['etco2', 'EtCO₂'], ['weight', 'Weight kg'], ['gcs_e', 'GCS E (1–4)'], ['gcs_v', 'GCS V (1–5)'], ['gcs_m', 'GCS M (1–6)']] as const).map(([k, l]) => (
                          <FormField key={k} label={l}>
                            <Input inputMode="decimal" value={oa[k] != null ? String(oa[k]) : ''} disabled={ro}
                              onChange={(e) => patch('on_arrival', { [k]: numOrNull(e.target.value) })} />
                          </FormField>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 text-sm" style={{ color: '#334155' }}>
                        <input type="checkbox" style={check} disabled={ro} checked={!!oa.oriented} onChange={(e) => patch('on_arrival', { oriented: e.target.checked })} />
                        Oriented to time, place and person
                      </label>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>
                        {gcsTotal(oa) != null ? `GCS ${gcsTotal(oa)}/15. ` : ''}Once the patient is admitted these become the first reading on the vitals chart.
                      </p>
                    </>
                  )}

                  {key === 'primary_survey' && (
                    <>
                      <div className={grid}>
                        <FormField label="A — Airway">
                          <Select value={data.primary_survey?.airway?.status ?? ''} disabled={ro} onChange={(e) => nested('primary_survey', 'airway', { status: e.target.value })}>
                            <option value="">—</option><option value="patent">Patent</option><option value="at_risk">At risk</option><option value="obstructed">Obstructed</option>
                          </Select>
                        </FormField>
                        <FormField label="Airway intervention">
                          <Input value={data.primary_survey?.airway?.intervention ?? ''} disabled={ro} placeholder="Suction, airway, intubation…" onChange={(e) => nested('primary_survey', 'airway', { intervention: e.target.value })} />
                        </FormField>
                        <FormField label="B — Breathing">
                          <Input value={data.primary_survey?.breathing?.findings ?? ''} disabled={ro} placeholder="Air entry, chest movement" onChange={(e) => nested('primary_survey', 'breathing', { findings: e.target.value })} />
                        </FormField>
                        <FormField label="Breathing intervention">
                          <Input value={data.primary_survey?.breathing?.intervention ?? ''} disabled={ro} placeholder="O₂, ICD, ventilation" onChange={(e) => nested('primary_survey', 'breathing', { intervention: e.target.value })} />
                        </FormField>
                        <FormField label="C — Capillary refill">
                          <Input value={data.primary_survey?.circulation?.crt ?? ''} disabled={ro} placeholder="< 2 s" onChange={(e) => nested('primary_survey', 'circulation', { crt: e.target.value })} />
                        </FormField>
                        <FormField label="Bleeding">
                          <Input value={data.primary_survey?.circulation?.bleeding ?? ''} disabled={ro} onChange={(e) => nested('primary_survey', 'circulation', { bleeding: e.target.value })} />
                        </FormField>
                        <FormField label="IV access">
                          <Input value={data.primary_survey?.circulation?.iv_access ?? ''} disabled={ro} placeholder="18G right forearm" onChange={(e) => nested('primary_survey', 'circulation', { iv_access: e.target.value })} />
                        </FormField>
                        <FormField label="Circulation — other">
                          <Input value={data.primary_survey?.circulation?.findings ?? ''} disabled={ro} onChange={(e) => nested('primary_survey', 'circulation', { findings: e.target.value })} />
                        </FormField>
                        <FormField label="D — Pupils, right">
                          <Input value={data.primary_survey?.disability?.pupils_right ?? ''} disabled={ro} placeholder="3 mm, reacting" onChange={(e) => nested('primary_survey', 'disability', { pupils_right: e.target.value })} />
                        </FormField>
                        <FormField label="Pupils, left">
                          <Input value={data.primary_survey?.disability?.pupils_left ?? ''} disabled={ro} placeholder="3 mm, reacting" onChange={(e) => nested('primary_survey', 'disability', { pupils_left: e.target.value })} />
                        </FormField>
                      </div>
                      <FormField label="Disability — other (lateralising signs)">
                        <Input value={data.primary_survey?.disability?.findings ?? ''} disabled={ro} onChange={(e) => nested('primary_survey', 'disability', { findings: e.target.value })} />
                      </FormField>
                      <FormField label="E — Exposure (injuries, temperature)">
                        <SpeechTextarea variant="field" value={data.primary_survey?.exposure?.findings ?? ''} disabled={ro}
                          onChange={(v) => nested('primary_survey', 'exposure', { findings: v })} style={{ minHeight: '3.5rem' }} />
                      </FormField>
                    </>
                  )}

                  {key === 'sample' && (
                    <>
                      <FormField label="Presenting complaint">
                        <Input value={data.sample?.complaint ?? ''} disabled={ro} placeholder={c.er?.complaint ?? ''} onChange={(e) => patch('sample', { complaint: e.target.value })} />
                      </FormField>
                      <FormField label="History of present illness">
                        <SpeechTextarea variant="field" fieldKey="consult.complaint" value={data.sample?.history ?? ''} disabled={ro}
                          onChange={(v) => patch('sample', { history: v })} style={{ minHeight: '4.5rem' }} />
                      </FormField>
                      <div className={grid}>
                        <FormField label="Medications taken">
                          <Input value={data.sample?.medications ?? ''} disabled={ro} onChange={(e) => patch('sample', { medications: e.target.value })} />
                        </FormField>
                        <FormField label="Last meal">
                          <Input value={data.sample?.last_meal ?? ''} disabled={ro} placeholder="Time, what" onChange={(e) => patch('sample', { last_meal: e.target.value })} />
                        </FormField>
                        <FormField label="LMP (women)">
                          <Input value={data.sample?.lmp ?? ''} disabled={ro} onChange={(e) => patch('sample', { lmp: e.target.value })} />
                        </FormField>
                        <FormField label="Events leading up to this">
                          <Input value={data.sample?.events ?? ''} disabled={ro} onChange={(e) => patch('sample', { events: e.target.value })} />
                        </FormField>
                      </div>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>Allergies, past and drug history are kept on the patient record (History &amp; Problem List) — the same list prescribing checks.</p>
                    </>
                  )}

                  {key === 'efast' && (
                    <>
                      <FormField label="eFAST done">
                        <Select value={data.efast?.done ?? ''} disabled={ro} onChange={(e) => patch('efast', { done: e.target.value as 'yes' })}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">Not done</option>
                        </Select>
                      </FormField>
                      {data.efast?.done === 'yes' && (
                        <div className={grid}>
                          {EFAST_VIEWS.map((v) => (
                            <FormField key={v.key} label={v.label}>
                              <Select value={data.efast?.results?.[v.key] ?? ''} disabled={ro}
                                onChange={(e) => patch('efast', { results: { ...(data.efast?.results ?? {}), [v.key]: e.target.value as 'positive' } })}>
                                <option value="">—</option><option value="negative">Negative</option><option value="positive">Positive</option>
                              </Select>
                            </FormField>
                          ))}
                        </div>
                      )}
                      <FormField label="Notes (screening echo / USG)">
                        <Input value={data.efast?.notes ?? ''} disabled={ro} onChange={(e) => patch('efast', { notes: e.target.value })} />
                      </FormField>
                    </>
                  )}

                  {key === 'secondary_survey' && (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {SURVEY_SIGNS.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-sm" style={{ color: '#334155' }}>
                            <input type="checkbox" style={check} disabled={ro} checked={!!data.secondary_survey?.signs?.[s]}
                              onChange={(e) => patch('secondary_survey', { signs: { ...(data.secondary_survey?.signs ?? {}), [s]: e.target.checked } })} />
                            {EXAM_SIGN_LABELS[s]}
                          </label>
                        ))}
                      </div>
                      <FormField label="General condition">
                        <Input value={data.secondary_survey?.general ?? ''} disabled={ro} onChange={(e) => patch('secondary_survey', { general: e.target.value })} />
                      </FormField>
                      <div className={grid}>
                        {SURVEY_SYSTEMS.map((f) => (
                          <FormField key={f.key} label={f.label}>
                            <Input value={data.secondary_survey?.systems?.[f.key] ?? ''} disabled={ro} placeholder={f.placeholder}
                              onChange={(e) => patch('secondary_survey', { systems: { ...(data.secondary_survey?.systems ?? {}), [f.key]: e.target.value } })} />
                          </FormField>
                        ))}
                      </div>
                    </>
                  )}

                  {key === 'burns' && (
                    <>
                      <div className={grid}>
                        {burnRegions(c.ageYears).map((r) => (
                          <FormField key={r.key} label={`${r.label} (${r.pct}%)`}>
                            <Select value={String(data.burns?.areas?.[r.key] ?? 0)} disabled={ro}
                              onChange={(e) => patch('burns', { areas: { ...(data.burns?.areas ?? {}), [r.key]: Number(e.target.value) } })}>
                              <option value="0">Not burnt</option><option value="0.25">A quarter</option><option value="0.5">Half</option>
                              <option value="0.75">Three quarters</option><option value="1">All of it</option>
                            </Select>
                          </FormField>
                        ))}
                      </div>
                      <p className="text-sm font-semibold" style={{ color: '#B45309' }}>
                        Total: {burnTotal(data.burns?.areas, c.ageYears)}% body surface
                        <span className="text-xs font-normal" style={{ color: '#94A3B8' }}>
                          {' '}— {c.ageYears != null && c.ageYears < 10 ? 'modified rule of nines for a child' : 'rule of nines'}
                        </span>
                      </p>
                      <FormField label="Depth">
                        <Input value={data.burns?.depth ?? ''} disabled={ro} placeholder="Superficial / partial / full thickness" onChange={(e) => patch('burns', { depth: e.target.value })} />
                      </FormField>
                    </>
                  )}

                  {key === 'plan' && (
                    <>
                      <FormField label="Provisional diagnosis">
                        <Input value={data.plan?.provisional_diagnosis ?? ''} disabled={ro} onChange={(e) => patch('plan', { provisional_diagnosis: e.target.value })} />
                      </FormField>
                      <FormField label="Investigations sent">
                        <Input value={data.plan?.investigations ?? ''} disabled={ro} onChange={(e) => patch('plan', { investigations: e.target.value })} />
                      </FormField>
                      <FormField label="Plan">
                        <SpeechTextarea variant="field" fieldKey="consult.notes" value={data.plan?.plan ?? ''} disabled={ro}
                          onChange={(v) => patch('plan', { plan: v })} style={{ minHeight: '4.5rem' }} />
                      </FormField>
                      <div className={grid}>
                        <FormField label="Specialist / service contacted">
                          <Input value={data.plan?.service_contacted ?? ''} disabled={ro} onChange={(e) => patch('plan', { service_contacted: e.target.value })} />
                        </FormField>
                        <FormField label="Disposition">
                          <Select value={data.plan?.disposition ?? ''} disabled={ro} onChange={(e) => patch('plan', { disposition: e.target.value as 'admit_ward' })}>
                            <option value="">—</option>
                            {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </Select>
                        </FormField>
                      </div>
                    </>
                  )}

                  {key === 'treatment' && (
                    <TreatmentLog entries={data.treatment ?? []} disabled={ro} onChange={(t) => setData((d) => ({ ...d, treatment: t }))} />
                  )}

                  {key === 'shifting' && (
                    <div className={grid}>
                      <FormField label="Shifted at">
                        <Input type="datetime-local" value={toLocal(data.shifting?.at)} disabled={ro} onChange={(e) => patch('shifting', { at: fromLocal(e.target.value) })} />
                      </FormField>
                      <FormField label="Shifted to">
                        <Input value={data.shifting?.to ?? ''} disabled={ro} placeholder="ICU / ward / OT / other hospital" onChange={(e) => patch('shifting', { to: e.target.value })} />
                      </FormField>
                      <FormField label="Condition at shifting">
                        <Input value={data.shifting?.condition ?? ''} disabled={ro} onChange={(e) => patch('shifting', { condition: e.target.value })} />
                      </FormField>
                      <FormField label="Escorted by">
                        <Input value={data.shifting?.escort ?? ''} disabled={ro} onChange={(e) => patch('shifting', { escort: e.target.value })} />
                      </FormField>
                      <FormField label="Handed over to">
                        <Input value={data.shifting?.handed_over_to ?? ''} disabled={ro} onChange={(e) => patch('shifting', { handed_over_to: e.target.value })} />
                      </FormField>
                    </div>
                  )}

                  {error?.key === key && <p className="text-xs" style={{ color: '#DC2626' }}>{error.text}</p>}
                  {editable && (
                    <div className="flex justify-end">
                      <button onClick={() => save(key)} disabled={saving === key}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: saved === key ? '#DCFCE7' : '#0D9488', color: saved === key ? '#15803D' : '#fff', border: 'none', cursor: saving === key ? 'wait' : 'pointer' }}>
                        {saved === key ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                        {saved === key ? 'Saved' : saving === key ? 'Saving…' : `Save ${title.split(' (')[0].toLowerCase()}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

function TreatmentLog({ entries, disabled, onChange }: { entries: TreatmentEntry[]; disabled: boolean; onChange: (t: TreatmentEntry[]) => void }) {
  const nowHm = () => new Date().toTimeString().slice(0, 5)
  const set = (i: number, v: Partial<TreatmentEntry>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...v } : e)))
  return (
    <div className="space-y-2">
      {entries.length === 0 && <p className="text-xs" style={{ color: '#94A3B8' }}>Nothing recorded yet. Add each drug, fluid or procedure as it is given.</p>}
      {entries.length > 0 && <div className="overflow-x-auto"><div className="space-y-2" style={{ minWidth: '36rem' }}>
      {entries.map((e, i) => (
        <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: '5.5rem minmax(8rem,2fr) minmax(5rem,1fr) minmax(4rem,0.8fr) minmax(6rem,1fr) auto' }}>
          <Input type="time" value={e.at} disabled={disabled} onChange={(ev) => set(i, { at: ev.target.value })} />
          <Input value={e.item} disabled={disabled} placeholder="Drug / fluid / procedure" onChange={(ev) => set(i, { item: ev.target.value })} />
          <Input value={e.dose ?? ''} disabled={disabled} placeholder="Dose" onChange={(ev) => set(i, { dose: ev.target.value })} />
          <Input value={e.route ?? ''} disabled={disabled} placeholder="Route" onChange={(ev) => set(i, { route: ev.target.value })} />
          <Input value={e.by ?? ''} disabled={disabled} placeholder="Given by" onChange={(ev) => set(i, { by: ev.target.value })} />
          {!disabled && (
            <button type="button" onClick={() => onChange(entries.filter((_, j) => j !== i))} aria-label="Remove"
              className="p-1.5 rounded-lg" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      </div></div>}
      {!disabled && (
        <button type="button" onClick={() => onChange([...entries, { at: nowHm(), item: '' }])}
          className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-3.5 h-3.5" /> Add treatment
        </button>
      )}
    </div>
  )
}
