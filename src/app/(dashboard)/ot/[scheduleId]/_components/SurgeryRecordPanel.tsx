'use client'

import { useState } from 'react'
import { ClipboardCheck, ShieldCheck, Syringe, FileText, Save, Check } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import { saveSurgeryRecord, savePreOpChecklist, saveSafetyStep } from '@/app/actions/ot'
import {
  ANAESTHESIA_TYPES, ASA_GRADES, PRE_OP_ITEMS, SAFETY_STEPS, stepComplete,
  type PreOpChecklist, type SafetyChecklist, type SafetyStep,
} from '@/lib/surgery'
import type { OtSchedule } from '@/lib/types'

/** ISO → the browser's local "YYYY-MM-DDTHH:mm" for a datetime-local box. */
function toLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** datetime-local value (browser time) → ISO, or null when cleared. */
function fromLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function clock(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : ''
}

function CardHead({ icon: Icon, title, hint, right }: { icon: typeof Save; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2 min-w-0">
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#0D9488' }} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</h2>
          {hint && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function SaveButton({ saving, saved, onClick, label = 'Save' }: { saving: boolean; saved: boolean; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
      style={{ background: saved ? '#DCFCE7' : '#0D9488', color: saved ? '#15803D' : '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
      {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
      {saved ? 'Saved' : saving ? 'Saving…' : label}
    </button>
  )
}

/** Save state for one card: saving, a brief "Saved", and the error in words. */
function useSaver() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(fn: () => Promise<{ success: boolean; error?: string }>): Promise<boolean> {
    setSaving(true); setError(null)
    const r = await fn()
    setSaving(false)
    if (!r.success) { setError(r.error ?? 'Could not save'); return false }
    setSaved(true); setTimeout(() => setSaved(false), 1800)
    return true
  }
  return { saving, saved, error, run }
}

const check = { width: '16px', height: '16px', accentColor: '#0D9488', cursor: 'pointer', flexShrink: 0, marginTop: '2px' } as const

export default function SurgeryRecordPanel({ schedule, editable, onSaved }: {
  schedule: OtSchedule
  /** ot:record and not cancelled. The record stays editable after completion. */
  editable: boolean
  onSaved: (patch: Partial<OtSchedule>) => void
}) {
  // ── Before surgery ──
  const pre0: PreOpChecklist = schedule.pre_op_checklist ?? {}
  const [pre, setPre] = useState<PreOpChecklist>(pre0)
  const [fasting, setFasting] = useState(toLocal(pre0.fasting_since))
  const preSave = useSaver()
  async function savePre() {
    const payload = {
      consent_signed: !!pre.consent_signed, pac_done: !!pre.pac_done, investigations_reviewed: !!pre.investigations_reviewed,
      site_marked: pre.site_marked ?? undefined, blood: pre.blood ?? undefined, fasting_since: fromLocal(fasting),
    }
    if (await preSave.run(() => savePreOpChecklist(schedule.id, payload))) {
      onSaved({ pre_op_checklist: { ...pre, ...payload, done_at: new Date().toISOString() } })
    }
  }

  // ── WHO checklist ──
  const [safety, setSafety] = useState<SafetyChecklist>(schedule.safety_checklist ?? {})
  const [stepBusy, setStepBusy] = useState<SafetyStep | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  function tick(step: SafetyStep, key: string, v: boolean) {
    setSafety((s) => ({ ...s, [step]: { items: { ...(s[step]?.items ?? {}), [key]: v }, done_at: s[step]?.done_at ?? null, done_by: s[step]?.done_by ?? null } }))
  }
  async function signStep(step: SafetyStep, sign: boolean) {
    setStepBusy(step); setStepError(null)
    const r = await saveSafetyStep(schedule.id, { step, items: safety[step]?.items ?? {}, sign })
    setStepBusy(null)
    if (!r.success) { setStepError(r.error); return }
    const next = { ...safety, [step]: r.record }
    setSafety(next)
    onSaved({ safety_checklist: next })
  }

  // ── Anaesthesia & times ──
  const [anaesthesia, setAnaesthesia] = useState(schedule.anaesthesia_type ?? '')
  const asa0 = schedule.asa_grade ?? ''
  const [asa, setAsa] = useState(asa0.replace(/E$/, ''))
  const [asaE, setAsaE] = useState(asa0.endsWith('E'))
  const [times, setTimes] = useState({
    anaesthesia_start: toLocal(schedule.anaesthesia_start), anaesthesia_end: toLocal(schedule.anaesthesia_end),
    incision_at: toLocal(schedule.incision_at), closure_at: toLocal(schedule.closure_at),
  })
  const anSave = useSaver()
  async function saveAnaesthesia() {
    const payload = {
      anaesthesia_type: anaesthesia || null,
      asa_grade: asa ? `${asa}${asaE ? 'E' : ''}` : null,
      anaesthesia_start: fromLocal(times.anaesthesia_start), anaesthesia_end: fromLocal(times.anaesthesia_end),
      incision_at: fromLocal(times.incision_at), closure_at: fromLocal(times.closure_at),
    }
    if (await anSave.run(() => saveSurgeryRecord(schedule.id, payload))) onSaved(payload)
  }

  // ── Operation note ──
  const [note, setNote] = useState({
    pre_op_diagnosis: schedule.pre_op_diagnosis ?? '', post_op_diagnosis: schedule.post_op_diagnosis ?? '',
    findings: schedule.findings ?? '', procedure_details: schedule.procedure_details ?? '',
    blood_loss_ml: schedule.blood_loss_ml != null ? String(schedule.blood_loss_ml) : '',
    drains: schedule.drains ?? '', specimens: schedule.specimens ?? '',
    counts_correct: schedule.counts_correct == null ? '' : schedule.counts_correct ? 'yes' : 'no',
    complications: schedule.complications ?? '', post_op_orders: schedule.post_op_orders ?? '',
  })
  const set = (k: keyof typeof note) => (v: string) => setNote((n) => ({ ...n, [k]: v }))
  const noteSave = useSaver()
  async function saveNote() {
    const loss = note.blood_loss_ml.trim()
    if (loss && !/^\d+$/.test(loss)) { await noteSave.run(async () => ({ success: false, error: 'Blood loss is a number of ml' })); return }
    const payload = {
      pre_op_diagnosis: note.pre_op_diagnosis, post_op_diagnosis: note.post_op_diagnosis,
      findings: note.findings, procedure_details: note.procedure_details,
      blood_loss_ml: loss ? Number(loss) : null, drains: note.drains, specimens: note.specimens,
      counts_correct: note.counts_correct === '' ? null : note.counts_correct === 'yes',
      complications: note.complications, post_op_orders: note.post_op_orders,
    }
    if (await noteSave.run(() => saveSurgeryRecord(schedule.id, payload))) {
      onSaved({ ...payload, blood_loss_ml: payload.blood_loss_ml })
    }
  }

  const ro = !editable
  const grid2 = 'grid gap-3 grid-cols-1 sm:grid-cols-2'

  return (
    <div className="space-y-4">
      {/* Before surgery */}
      <GlassCard className="p-4">
        <CardHead icon={ClipboardCheck} title="Before surgery"
          hint={schedule.pre_op_checklist?.done_at ? `Last saved ${clock(schedule.pre_op_checklist.done_at)}` : 'Checked on the ward before the patient is shifted'}
          right={editable ? <SaveButton saving={preSave.saving} saved={preSave.saved} onClick={savePre} /> : null} />
        <div className="space-y-2">
          {PRE_OP_ITEMS.map((i) => (
            <label key={i.key} className="flex items-start gap-2 text-sm" style={{ color: '#334155' }}>
              <input type="checkbox" style={check} disabled={ro} checked={!!pre[i.key]}
                onChange={(e) => setPre((p) => ({ ...p, [i.key]: e.target.checked }))} />
              {i.label}
            </label>
          ))}
        </div>
        <div className={`${grid2} mt-3`}>
          <FormField label="Nil by mouth since">
            <Input type="datetime-local" value={fasting} disabled={ro} onChange={(e) => setFasting(e.target.value)} />
          </FormField>
          <FormField label="Operation site marked">
            <Select value={pre.site_marked ?? ''} disabled={ro}
              onChange={(e) => setPre((p) => ({ ...p, site_marked: (e.target.value || undefined) as PreOpChecklist['site_marked'] }))}>
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="not_applicable">Not applicable</option>
            </Select>
          </FormField>
          <FormField label="Blood">
            <Select value={pre.blood ?? ''} disabled={ro}
              onChange={(e) => setPre((p) => ({ ...p, blood: (e.target.value || undefined) as PreOpChecklist['blood'] }))}>
              <option value="">—</option>
              <option value="not_needed">Not needed</option>
              <option value="arranged">Arranged / cross-matched</option>
              <option value="pending">Requested, not ready</option>
            </Select>
          </FormField>
        </div>
        {preSave.error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{preSave.error}</p>}
      </GlassCard>

      {/* WHO Surgical Safety Checklist */}
      <GlassCard className="p-4">
        <CardHead icon={ShieldCheck} title="WHO Surgical Safety Checklist" hint="Tick each item aloud, then sign the step" />
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
          {SAFETY_STEPS.map((s) => {
            const rec = safety[s.step]
            const signed = !!rec?.done_at
            const complete = stepComplete(rec, s.step)
            const allTicked = s.items.every((i) => rec?.items?.[i.key])
            return (
              <div key={s.step} className="rounded-xl p-3"
                style={{ background: complete ? 'rgba(21,128,61,0.05)' : '#F8FAFC', border: `1px solid ${complete ? '#BBF7D0' : '#E2E8F0'}` }}>
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{s.title}</p>
                <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>{s.when}</p>
                <div className="space-y-1.5">
                  {s.items.map((i) => (
                    <label key={i.key} className="flex items-start gap-2 text-xs" style={{ color: '#334155' }}>
                      <input type="checkbox" style={check} disabled={ro || signed} checked={!!rec?.items?.[i.key]}
                        onChange={(e) => tick(s.step, i.key, e.target.checked)} />
                      {i.label}
                    </label>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {signed ? (
                    <span className="text-xs font-medium" style={{ color: '#15803D' }}>Signed {clock(rec?.done_at)}</span>
                  ) : (
                    <span className="text-xs" style={{ color: '#94A3B8' }}>Not signed</span>
                  )}
                  {editable && (signed ? (
                    <button onClick={() => signStep(s.step, false)} disabled={stepBusy === s.step}
                      className="text-xs font-medium" style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Undo
                    </button>
                  ) : (
                    <button onClick={() => signStep(s.step, true)} disabled={!allTicked || stepBusy === s.step}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: allTicked ? '#0D9488' : '#CBD5E1', color: '#fff', border: 'none', cursor: allTicked ? 'pointer' : 'not-allowed' }}>
                      {stepBusy === s.step ? 'Signing…' : `Sign ${s.title.toLowerCase()}`}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {stepError && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{stepError}</p>}
      </GlassCard>

      {/* Anaesthesia & times */}
      <GlassCard className="p-4">
        <CardHead icon={Syringe} title="Anaesthesia & times" right={editable ? <SaveButton saving={anSave.saving} saved={anSave.saved} onClick={saveAnaesthesia} /> : null} />
        <div className={grid2}>
          <FormField label="Anaesthesia">
            <Select value={anaesthesia} disabled={ro} onChange={(e) => setAnaesthesia(e.target.value)}>
              <option value="">—</option>
              {ANAESTHESIA_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </FormField>
          <FormField label="ASA grade">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Select value={asa} disabled={ro} onChange={(e) => setAsa(e.target.value)}>
                  <option value="">—</option>
                  {ASA_GRADES.map((g) => <option key={g} value={g}>ASA {g}</option>)}
                </Select>
              </div>
              <label className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: '#334155' }}>
                <input type="checkbox" style={{ ...check, marginTop: 0 }} disabled={ro || !asa} checked={asaE} onChange={(e) => setAsaE(e.target.checked)} />
                Emergency (E)
              </label>
            </div>
          </FormField>
          {([
            ['anaesthesia_start', 'Anaesthesia start'], ['anaesthesia_end', 'Anaesthesia end'],
            ['incision_at', 'Incision'], ['closure_at', 'Closure'],
          ] as const).map(([k, label]) => (
            <FormField key={k} label={label}>
              <Input type="datetime-local" value={times[k]} disabled={ro} onChange={(e) => setTimes((t) => ({ ...t, [k]: e.target.value }))} />
            </FormField>
          ))}
        </div>
        {anSave.error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{anSave.error}</p>}
      </GlassCard>

      {/* Operation note */}
      <GlassCard className="p-4">
        <CardHead icon={FileText} title="Operation note"
          hint={schedule.record_updated_at ? `Record last changed ${clock(schedule.record_updated_at)}` : 'Can be completed after the patient leaves theatre'}
          right={editable ? <SaveButton saving={noteSave.saving} saved={noteSave.saved} onClick={saveNote} /> : null} />
        <div className="space-y-3">
          <div className={grid2}>
            <FormField label="Pre-operative diagnosis">
              <Input value={note.pre_op_diagnosis} disabled={ro} onChange={(e) => set('pre_op_diagnosis')(e.target.value)} />
            </FormField>
            <FormField label="Post-operative diagnosis">
              <Input value={note.post_op_diagnosis} disabled={ro} onChange={(e) => set('post_op_diagnosis')(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Findings">
            <SpeechTextarea variant="field" fieldKey="ot.findings" value={note.findings} onChange={set('findings')} disabled={ro}
              placeholder="What was found" style={{ minHeight: '4rem' }} />
          </FormField>
          <FormField label="Procedure details">
            <SpeechTextarea variant="field" fieldKey="ot.procedure_details" value={note.procedure_details} onChange={set('procedure_details')} disabled={ro}
              placeholder="Incision, steps, closure" style={{ minHeight: '6rem' }} />
          </FormField>
          <div className={grid2}>
            <FormField label="Blood loss (ml)">
              <Input inputMode="numeric" value={note.blood_loss_ml} disabled={ro} onChange={(e) => set('blood_loss_ml')(e.target.value)} />
            </FormField>
            <FormField label="Swab / instrument count correct">
              <Select value={note.counts_correct} disabled={ro} onChange={(e) => set('counts_correct')(e.target.value)}>
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </FormField>
            <FormField label="Drains">
              <Input value={note.drains} disabled={ro} placeholder="Type, site — or none" onChange={(e) => set('drains')(e.target.value)} />
            </FormField>
            <FormField label="Specimens sent">
              <Input value={note.specimens} disabled={ro} placeholder="HPE / culture — or none" onChange={(e) => set('specimens')(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Complications">
            <Input value={note.complications} disabled={ro} placeholder="None" onChange={(e) => set('complications')(e.target.value)} />
          </FormField>
          <FormField label="Post-op orders">
            <SpeechTextarea variant="field" fieldKey="ot.post_op_orders" value={note.post_op_orders} onChange={set('post_op_orders')} disabled={ro}
              placeholder="Shift to, monitoring, drugs, diet" style={{ minHeight: '4rem' }} />
          </FormField>
        </div>
        {noteSave.error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{noteSave.error}</p>}
      </GlassCard>
    </div>
  )
}
