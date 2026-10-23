'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldAlert, CheckCircle2, Plus, Printer } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  saveMlcDraft, completeMlc, amendMlc, setIntimationAcknowledgement,
  type MlcOption, type PoliceIntimation,
} from '@/app/actions/mlc'
import { INJURY_GRADES, DISPOSALS, INTIMATION_METHODS } from '@/lib/mlc'
import PoliceIntimationModal from './PoliceIntimationModal'

/**
 * Filling in the accident register entry.
 *
 * As with Form F, the screen does not re-implement the completeness rules. The
 * database owns them and names what is missing in plain words, so pressing
 * Sign and reading the refusal is both the check and the explanation. Two
 * copies of that rule would drift apart, and the copy that drifted would be
 * this one.
 *
 * Two things here are not ordinary form fields.
 *
 * Who brought the patient is given its own panel with the reason attached,
 * because "108" is what gets written and the Madras High Court has held that
 * it is not enough. Explaining that at the point of typing is worth more than
 * explaining it in a refusal.
 *
 * The police intimations are a log, not an input. They are appended and never
 * edited, because they are the hospital's own evidence that it discharged a
 * statutory duty.
 */
export default function MlcEditor({ record, options, intimations }: {
  record: Record<string, unknown>
  options: MlcOption[]
  intimations: PoliceIntimation[]
}) {
  const router = useRouter()
  const locked = record.status !== 'draft'
  const [form, setForm] = useState<Record<string, unknown>>(record)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmSign, setConfirmSign] = useState(false)
  const [amending, setAmending] = useState(false)
  const [amendReason, setAmendReason] = useState('')
  const [intimating, setIntimating] = useState(false)
  const [ackFor, setAckFor] = useState<string | null>(null)
  const [ackRef, setAckRef] = useState('')
  const [isPending, startTransition] = useTransition()

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const str = (k: string) => (form[k] as string | null) ?? ''
  const num = (k: string) => (form[k] as number | null) ?? ''
  const arr = (k: string) => (form[k] as string[] | null) ?? []

  const mlcTypes = options.filter((o) => o.kind === 'mlc_type')
  const injuryNatures = options.filter((o) => o.kind === 'injury_nature')
  const groups = [...new Set(mlcTypes.map((o) => o.group_label ?? 'Other'))]

  function toggle(key: string, code: string) {
    const cur = arr(key)
    set(key, cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code])
  }

  /** The columns the register owns, never sent back as a patch. */
  function patchOf(f: Record<string, unknown>): Record<string, unknown> {
    const out = { ...f }
    for (const k of ['id', 'ar_no', 'status', 'tenant_id', 'created_at', 'created_by',
                     'completed_at', 'completed_by', 'amends_id', 'amend_reason']) {
      delete out[k]
    }
    return out
  }

  function save() {
    startTransition(async () => {
      const res = await saveMlcDraft(record.id as string, patchOf(form))
      setMsg(res.success ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error })
    })
  }

  function sign() {
    setConfirmSign(false)
    startTransition(async () => {
      const saved = await saveMlcDraft(record.id as string, patchOf(form))
      if (!saved.success) { setMsg({ ok: false, text: saved.error }); return }
      const res = await completeMlc(record.id as string)
      if (res.success) {
        setMsg({ ok: true, text: 'Signed. This entry is now locked — print the three copies.' })
        router.refresh()
      } else setMsg({ ok: false, text: res.error })
    })
  }

  function amend() {
    startTransition(async () => {
      const res = await amendMlc(record.id as string, amendReason)
      if (res.success) router.push(`/emergency/mlc/${res.id}`)
      else setMsg({ ok: false, text: res.error })
    })
  }

  function saveAck(id: string) {
    startTransition(async () => {
      const res = await setIntimationAcknowledgement(id, ackRef)
      setAckFor(null); setAckRef('')
      if (res.success) router.refresh()
      else setMsg({ ok: false, text: res.error })
    })
  }

  return (
    <div className="space-y-4">
      {locked && (
        <GlassCard className="p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#64748B' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                {record.status === 'amended' ? 'Superseded by a later amendment' : 'Signed and locked'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                A copy of this is already with the police. It is not edited — if the opinion
                changes, amend it, and both versions stay on the record. A doctor revising
                simple to grievous after an X-ray is doing something proper, which the
                register should show rather than hide.
              </p>
              {record.status === 'complete' && !amending && (
                <button onClick={() => setAmending(true)}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#fff', color: '#0D9488', border: '1px solid rgba(13,148,136,0.3)' }}>
                  Raise an amendment
                </button>
              )}
              {amending && (
                <div className="mt-3 space-y-2">
                  <Input value={amendReason} onChange={(e) => setAmendReason(e.target.value)}
                    placeholder="Why is this being corrected?" />
                  <div className="flex gap-2">
                    <button onClick={amend} disabled={isPending || !amendReason.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: '#0D9488', color: '#fff', border: 'none', opacity: amendReason.trim() ? 1 : 0.5 }}>
                      Create amendment
                    </button>
                    <button onClick={() => { setAmending(false); setAmendReason('') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {record.amend_reason != null && (
        <div className="rounded-xl px-3 py-2 text-xs"
          style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          This entry amends an earlier one. Reason: {record.amend_reason as string}
        </div>
      )}

      {/* ── The police ─────────────────────────────────────────────────────── */}
      <GlassCard className="p-4" style={{ borderColor: intimations.length ? '#E2E8F0' : '#FECACA' }}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#0F172A' }}>
              <ShieldAlert className="w-4 h-4" style={{ color: intimations.length ? '#15803D' : '#DC2626' }} />
              Informing the police
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              Required immediately under section 397 of the BNSS, whatever the patient
              or their family wants. This entry cannot be signed until one is recorded.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {/*
              Printable before the entry is signed, because that is the real
              order of events: the letter goes across, then it is recorded, then
              the examination is finished and the entry signed.
            */}
            <a href={`/print/mlc/${record.id as string}/intimation`} target="_blank" rel="noopener"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', textDecoration: 'none' }}>
              <Printer className="w-3 h-3" /> Print the letter
            </a>
            <button onClick={() => setIntimating(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3 h-3" /> Record an intimation
            </button>
          </div>
        </div>

        {intimations.length === 0 ? (
          <p className="text-xs rounded-lg px-3 py-2"
            style={{ background: '#FEE2E2', color: '#B91C1C' }}>
            Not yet informed.
          </p>
        ) : (
          <div className="space-y-1.5">
            {intimations.map((i) => (
              <div key={i.id} className="rounded-lg px-3 py-2" style={{ background: '#F8FAFC' }}>
                <p className="text-xs font-semibold" style={{ color: '#0F172A' }}>
                  {i.station_name}
                  {i.officer_name && <span className="font-normal"> · {i.officer_rank ? `${i.officer_rank} ` : ''}{i.officer_name}</span>}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  {INTIMATION_METHODS.find((m) => m.value === i.method)?.label ?? i.method}
                  {' · '}
                  {new Date(i.intimated_at).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                  })}
                  {i.intimated_by_name ? ` · by ${i.intimated_by_name}` : ''}
                </p>
                {i.notes && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{i.notes}</p>}

                {i.acknowledgement_ref ? (
                  <p className="text-xs mt-1 font-mono" style={{ color: '#15803D' }}>
                    Acknowledged: {i.acknowledgement_ref}
                  </p>
                ) : ackFor === i.id ? (
                  <div className="flex gap-2 mt-1.5">
                    <Input value={ackRef} onChange={(e) => setAckRef(e.target.value)}
                      placeholder="GD entry or FIR number" />
                    <button onClick={() => saveAck(i.id)} disabled={isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                      style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      Save
                    </button>
                  </div>
                ) : (
                  // The only part of an intimation that can be written later,
                  // because the FIR number usually arrives the next morning.
                  <button onClick={() => { setAckFor(i.id); setAckRef('') }}
                    className="text-xs mt-1 font-semibold"
                    style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', padding: 0 }}>
                    + Add the acknowledgement
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* ── The patient ────────────────────────────────────────────────────── */}
      <GlassCard className="p-4">
        <h2 className="text-sm font-bold mb-3" style={{ color: '#0F172A' }}>The patient</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Name" required>
            <Input value={str('patient_name')} disabled={locked}
              onChange={(e) => set('patient_name', e.target.value)} />
          </FormField>
          <FormField label="Age" required>
            <Input type="number" min={0} max={120} value={num('patient_age')} disabled={locked}
              onChange={(e) => set('patient_age', e.target.value ? Number(e.target.value) : null)} />
          </FormField>
          <FormField label="Sex" required>
            <Select value={str('patient_sex')} disabled={locked}
              onChange={(e) => set('patient_sex', e.target.value || null)}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="unknown">Unknown</option>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div className="sm:col-span-2">
            <FormField label="Address" required>
              <Input value={str('patient_address')} disabled={locked}
                onChange={(e) => set('patient_address', e.target.value)} />
            </FormField>
          </div>
          <FormField label="MR No.">
            <Input value={str('mr_no')} disabled={locked}
              onChange={(e) => set('mr_no', e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <FormField label="Identification mark 1" required>
            <Input value={str('identification_mark_1')} disabled={locked}
              onChange={(e) => set('identification_mark_1', e.target.value)}
              placeholder="e.g. Scar over the left eyebrow" />
          </FormField>
          <FormField label="Identification mark 2" required>
            <Input value={str('identification_mark_2')} disabled={locked}
              onChange={(e) => set('identification_mark_2', e.target.value)}
              placeholder="e.g. Mole on the right forearm" />
          </FormField>
        </div>
        <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
          Both marks are asked for because one identifies nobody. They are what lets a
          relative identify an unidentified patient days later, and they are the fields
          most often left blank.
        </p>
      </GlassCard>

      {/* ── Who brought them ───────────────────────────────────────────────── */}
      <GlassCard className="p-4">
        <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>Who brought the patient</h2>
        <p className="text-xs mt-0.5 mb-3" style={{ color: '#64748B' }}>
          A name, not a vehicle. The Madras High Court has held that a hospital must
          record the particulars of the person who brought the victim — &ldquo;108&rdquo; on its own
          will be refused. If genuinely nobody came with them, say so here, with the
          ambulance crew or officer&rsquo;s name and badge number.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Name" required>
            <Input value={str('brought_by_name')} disabled={locked}
              onChange={(e) => set('brought_by_name', e.target.value)} />
          </FormField>
          <FormField label="Relationship to the patient" required>
            <Input value={str('brought_by_relation')} disabled={locked}
              onChange={(e) => set('brought_by_relation', e.target.value)}
              placeholder="e.g. Brother, neighbour, colleague" />
          </FormField>
          <FormField label="Address">
            <Input value={str('brought_by_address')} disabled={locked}
              onChange={(e) => set('brought_by_address', e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <Input value={str('brought_by_phone')} disabled={locked}
              onChange={(e) => set('brought_by_phone', e.target.value)} />
          </FormField>
        </div>
      </GlassCard>

      {/* ── The incident ───────────────────────────────────────────────────── */}
      <GlassCard className="p-4">
        <h2 className="text-sm font-bold mb-3" style={{ color: '#0F172A' }}>The incident</h2>

        <p className="text-xs font-semibold mb-1.5" style={{ color: '#475569' }}>
          What makes this medico-legal <span style={{ color: '#DC2626' }}>*</span>
        </p>
        <div className="space-y-2 mb-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>{g}</p>
              <div className="flex flex-wrap gap-1.5">
                {mlcTypes.filter((o) => (o.group_label ?? 'Other') === g).map((o) => {
                  const on = arr('mlc_types').includes(o.code)
                  return (
                    <button key={o.code} type="button" disabled={locked}
                      onClick={() => toggle('mlc_types', o.code)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-left"
                      style={{
                        background: on ? 'rgba(220,38,38,0.08)' : '#F8FAFC',
                        border: `1px solid ${on ? '#FECACA' : '#E2E8F0'}`,
                        color: on ? '#B91C1C' : '#475569',
                        cursor: locked ? 'default' : 'pointer',
                      }}>
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {arr('mlc_types').includes('other') && (
          <FormField label="Specify">
            <Input value={str('mlc_type_other')} disabled={locked}
              onChange={(e) => set('mlc_type_other', e.target.value)} />
          </FormField>
        )}

        <div className="mt-3">
          <FormField label="Alleged cause, in the informant's own words" required>
            <Textarea value={str('alleged_cause')} disabled={locked}
              onChange={(e) => set('alleged_cause', e.target.value)}
              placeholder="e.g. Says he was hit by a two-wheeler while crossing the road at about 8pm"
              style={{ minHeight: '3rem' }} />
          </FormField>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
            Recorded as alleged, not as fact. What the hospital certifies is what it found,
            not what it was told.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <FormField label="Place of occurrence" required>
            <Input value={str('place_of_occurrence')} disabled={locked}
              onChange={(e) => set('place_of_occurrence', e.target.value)} />
          </FormField>
          <FormField label="Vehicle number(s), if any">
            <Input value={str('vehicle_numbers')} disabled={locked}
              onChange={(e) => set('vehicle_numbers', e.target.value)} />
          </FormField>
          <FormField label="When it happened">
            <Input type="datetime-local" value={dtLocal(form.occurred_at)} disabled={locked}
              onChange={(e) => set('occurred_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </FormField>
          <FormField label="Arrived at the hospital" required>
            <Input type="datetime-local" value={dtLocal(form.arrived_at)} disabled={locked}
              onChange={(e) => set('arrived_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </FormField>
        </div>
      </GlassCard>

      {/* ── The examination ────────────────────────────────────────────────── */}
      <GlassCard className="p-4">
        <h2 className="text-sm font-bold mb-3" style={{ color: '#0F172A' }}>The examination</h2>

        <p className="text-xs font-semibold mb-1.5" style={{ color: '#475569' }}>
          Nature of the injuries <span style={{ color: '#DC2626' }}>*</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {injuryNatures.map((o) => {
            const on = arr('injury_natures').includes(o.code)
            return (
              <button key={o.code} type="button" disabled={locked}
                onClick={() => toggle('injury_natures', o.code)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{
                  background: on ? 'rgba(13,148,136,0.08)' : '#F8FAFC',
                  border: `1px solid ${on ? 'rgba(13,148,136,0.3)' : '#E2E8F0'}`,
                  color: on ? '#0D9488' : '#475569',
                  cursor: locked ? 'default' : 'pointer',
                }}>
                {o.label}
              </button>
            )
          })}
        </div>

        <FormField label="Describe each injury — site, size, shape, and how old it looks" required>
          <Textarea value={str('injury_details')} disabled={locked}
            onChange={(e) => set('injury_details', e.target.value)}
            placeholder="1. Lacerated wound 4cm x 1cm x muscle deep over the right parietal region, bleeding, fresh.&#10;2. …"
            style={{ minHeight: '6rem' }} />
        </FormField>

        <div className="mt-3">
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#475569' }}>
            Opinion on the injuries <span style={{ color: '#DC2626' }}>*</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INJURY_GRADES.map((g) => {
              const on = str('injury_grade') === g.value
              return (
                <button key={g.value} type="button" disabled={locked} title={g.hint}
                  onClick={() => set('injury_grade', g.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: on ? '#DC2626' : '#F8FAFC',
                    border: `1px solid ${on ? '#DC2626' : '#E2E8F0'}`,
                    color: on ? '#fff' : '#475569',
                    cursor: locked ? 'default' : 'pointer',
                  }}>
                  {g.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>
            {INJURY_GRADES.find((g) => g.value === str('injury_grade'))?.hint
              ?? 'This is the line the prosecution turns on. It may be deferred, but it may not be left blank.'}
          </p>
          {str('injury_grade') === 'deferred' && (
            <div className="mt-2">
              <FormField label="What is the opinion waiting for?" required>
                <Input value={str('injury_grade_note')} disabled={locked}
                  onChange={(e) => set('injury_grade_note', e.target.value)}
                  placeholder="e.g. Awaiting X-ray of the right forearm" />
              </FormField>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <FormField label="State of consciousness">
            <Input value={str('conscious_state')} disabled={locked}
              onChange={(e) => set('conscious_state', e.target.value)}
              placeholder="e.g. Conscious, oriented, GCS 15" />
          </FormField>
          <FormField label="Smell of alcohol">
            <Select value={form.smell_of_alcohol === null || form.smell_of_alcohol === undefined ? '' : String(form.smell_of_alcohol)}
              disabled={locked}
              onChange={(e) => set('smell_of_alcohol', e.target.value === '' ? null : e.target.value === 'true')}>
              <option value="">Not noted</option>
              <option value="true">Present</option>
              <option value="false">Absent</option>
            </Select>
          </FormField>
        </div>

        <div className="mt-3">
          <FormField label="First aid and treatment given" required>
            <Textarea value={str('first_aid_given')} disabled={locked}
              onChange={(e) => set('first_aid_given', e.target.value)}
              placeholder="e.g. Wound toilet and suturing, arm immobilised, IV fluids, Inj TT"
              style={{ minHeight: '3rem' }} />
          </FormField>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
            Free of charge, under section 397 of the BNSS. Recording what was done is the
            other half of that duty.
          </p>
        </div>
      </GlassCard>

      {/* ── Dying declaration ──────────────────────────────────────────────── */}
      <GlassCard className="p-4">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={!!form.dying_declaration_needed} disabled={locked}
            onChange={(e) => set('dying_declaration_needed', e.target.checked)}
            className="w-4 h-4 rounded mt-0.5 flex-shrink-0" style={{ accentColor: '#DC2626' }} />
          <span>
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              A dying declaration may be needed
            </span>
            <span className="text-xs block mt-0.5" style={{ color: '#64748B' }}>
              Tick this where the patient may not survive to give evidence. A magistrate
              records it; in their absence the doctor may. The field exists so the decision
              is made rather than overlooked.
            </span>
          </span>
        </label>
        {!!form.dying_declaration_needed && (
          <div className="mt-3">
            <FormField label="What was done about it" required>
              <Textarea value={str('dying_declaration_note')} disabled={locked}
                onChange={(e) => set('dying_declaration_note', e.target.value)}
                placeholder="Who was informed, when, and whether it was recorded"
                style={{ minHeight: '3rem' }} />
            </FormField>
          </div>
        )}
      </GlassCard>

      {/* ── Disposal and the doctor ────────────────────────────────────────── */}
      <GlassCard className="p-4">
        <h2 className="text-sm font-bold mb-3" style={{ color: '#0F172A' }}>Disposal, and who examined them</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Disposal" required>
            <Select value={str('disposal')} disabled={locked}
              onChange={(e) => set('disposal', e.target.value || null)}>
              <option value="">—</option>
              {DISPOSALS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Note">
            <Input value={str('disposal_note')} disabled={locked}
              onChange={(e) => set('disposal_note', e.target.value)}
              placeholder="Ward, or where they were referred to" />
          </FormField>
          <FormField label="Examining doctor" required>
            <Input value={str('examined_by_name')} disabled={locked}
              onChange={(e) => set('examined_by_name', e.target.value)} />
          </FormField>
          <FormField label="Their registration number" required>
            <Input value={str('examined_by_reg_no')} disabled={locked}
              onChange={(e) => set('examined_by_reg_no', e.target.value)} />
          </FormField>
        </div>
        <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
          Named personally, because the duty is theirs rather than the hospital&rsquo;s, and
          because it is this doctor who will be asked about the case in court.
        </p>
      </GlassCard>

      {msg && (
        <div className="text-sm rounded-xl px-3 py-2"
          style={msg.ok
            ? { background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }
            : { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {msg.text}
        </div>
      )}

      {!locked && (
        <div className="flex gap-3 flex-wrap">
          <button onClick={save} disabled={isPending}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
            {isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={() => setConfirmSign(true)} disabled={isPending}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <CheckCircle2 className="w-4 h-4" /> Sign the entry
          </button>
        </div>
      )}

      {locked && record.status === 'complete' && (
        <div className="flex gap-3 flex-wrap">
          <a href={`/print/mlc/${record.id as string}/ar`} target="_blank" rel="noopener"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', textDecoration: 'none' }}>
            <Printer className="w-4 h-4" /> Accident register — three copies
          </a>
        </div>
      )}

      <ConfirmDialog
        open={confirmSign}
        title="Sign this entry?"
        description="Once signed it cannot be edited, only amended — and the amendment will say why. Print the three copies afterwards: one for the police, one for the patient, one for the hospital."
        confirmLabel="Sign"
        onConfirm={sign}
        onClose={() => setConfirmSign(false)}
      />

      <PoliceIntimationModal
        open={intimating} mlcId={record.id as string} arNo={record.ar_no as string}
        onClose={() => setIntimating(false)}
        onSaved={() => { setIntimating(false); router.refresh() }}
      />
    </div>
  )
}

/** An ISO timestamp as a datetime-local input wants it, in IST. */
function dtLocal(v: unknown): string {
  if (!v) return ''
  const d = new Date(v as string)
  if (Number.isNaN(d.getTime())) return ''
  const ist = new Date(d.getTime() + (5.5 * 60 + d.getTimezoneOffset()) * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}T${pad(ist.getHours())}:${pad(ist.getMinutes())}`
}
