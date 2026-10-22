'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { saveFormFDraft, completeFormF, amendFormF, type PcpndtOption } from '@/app/actions/pcpndt'

/**
 * Filling in a Form F.
 *
 * The screen deliberately does not re-implement the completeness rules. The
 * database owns them and names what is missing in the Act's own numbering, so
 * pressing Complete and reading the refusal is both the check and the
 * explanation. Two copies of that rule would drift apart, and the copy that
 * drifted would be this one.
 */
export default function FormFEditor({ record, options }: {
  record: Record<string, unknown>
  options: PcpndtOption[]
}) {
  const router = useRouter()
  const locked = record.status !== 'draft'
  const [form, setForm] = useState<Record<string, unknown>>(record)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [amending, setAmending] = useState(false)
  const [amendReason, setAmendReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const str = (k: string) => (form[k] as string | null) ?? ''
  const num = (k: string) => (form[k] as number | null) ?? ''

  const usgIndications = options.filter((o) => o.kind === 'usg_indication')
  const selected = (form.usg_indications as string[] | null) ?? []

  function toggleIndication(code: string) {
    const next = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]
    set('usg_indications', next)
  }

  function save() {
    startTransition(async () => {
      const { id, status, created_at, serial_no, tenant_id, ...patch } = form as Record<string, unknown>
      void status; void created_at; void serial_no; void tenant_id
      const res = await saveFormFDraft(id as string, patch)
      setMsg(res.success ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error })
    })
  }

  function complete() {
    setConfirmComplete(false)
    startTransition(async () => {
      const { id, status, created_at, serial_no, tenant_id, ...patch } = form as Record<string, unknown>
      void status; void created_at; void serial_no; void tenant_id
      const saved = await saveFormFDraft(id as string, patch)
      if (!saved.success) { setMsg({ ok: false, text: saved.error }); return }
      const res = await completeFormF(id as string)
      if (res.success) { setMsg({ ok: true, text: 'Complete. This form is now locked.' }); router.refresh() }
      else setMsg({ ok: false, text: res.error })
    })
  }

  function amend() {
    startTransition(async () => {
      const res = await amendFormF(record.id as string, amendReason)
      if (res.success) router.push(`/pcpndt/${res.id}`)
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
                {record.status === 'amended' ? 'Superseded by a later amendment' : 'Complete and locked'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                A filed Form F is not edited. If something is wrong, amend it — the original stays on
                the record and the correction says why, which is what an inspection expects to see.
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
                      style={{ background: '#0D9488', color: '#fff', opacity: amendReason.trim() ? 1 : 0.5 }}>
                      Create amendment
                    </button>
                    <button onClick={() => { setAmending(false); setAmendReason('') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#F1F5F9', color: '#475569' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {record.amend_reason != null && (
        <GlassCard className="p-3" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <p className="text-xs" style={{ color: '#1D4ED8' }}>
            <span className="font-semibold">This is an amendment.</span> {record.amend_reason as string}
          </p>
        </GlassCard>
      )}

      {msg && (
        <GlassCard className="p-3"
          style={{ background: msg.ok ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${msg.ok ? '#A7F3D0' : '#FECACA'}` }}>
          <p className="text-xs flex items-start gap-2" style={{ color: msg.ok ? '#047857' : '#991B1B' }}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            {msg.text}
          </p>
        </GlassCard>
      )}

      <Section title="Section A — the patient" hint="Copied from her record when this form was opened, and frozen here. Editing her file later will not change this form.">
        <Grid>
          <FormField label="Patient name (3)"><Input value={str('patient_name')} disabled={locked}
            onChange={(e) => set('patient_name', e.target.value)} /></FormField>
          <FormField label="Age (3)"><Input type="number" value={num('patient_age_years')} disabled={locked}
            onChange={(e) => set('patient_age_years', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Relation (5)">
            <Select value={str('relation_type')} disabled={locked} onChange={(e) => set('relation_type', e.target.value)}>
              <option value="">—</option>
              <option value="husband">Husband&rsquo;s name</option>
              <option value="father">Father&rsquo;s name</option>
              <option value="mother">Mother&rsquo;s name</option>
              <option value="wife">Wife&rsquo;s name</option>
            </Select>
          </FormField>
          <FormField label="Name (5)"><Input value={str('relation_name')} disabled={locked}
            onChange={(e) => set('relation_name', e.target.value)} /></FormField>
          <FormField label="Living children (4)"><Input type="number" value={num('living_children_total')} disabled={locked}
            onChange={(e) => set('living_children_total', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Contact number (6)"><Input value={str('contact_no')} disabled={locked}
            onChange={(e) => set('contact_no', e.target.value)} /></FormField>
        </Grid>

        {/* The monthly summary quotes G, P, L, A for every scan. These come
            from her antenatal record when she has one here — but most women
            having a scan do not: referred from outside, a walk-in, or the scan
            is her first contact with the hospital. The form cannot depend on
            another record existing, so they are asked for here. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FormField label="Gravida (G)">
            <Input type="number" min={0} value={num('gravida')} disabled={locked}
              onChange={(e) => set('gravida', e.target.value === '' ? null : Number(e.target.value))} />
          </FormField>
          <FormField label="Para (P)">
            <Input type="number" min={0} value={num('para')} disabled={locked}
              onChange={(e) => set('para', e.target.value === '' ? null : Number(e.target.value))} />
          </FormField>
          <FormField label="Living (L)">
            <Input type="number" min={0} value={num('living_children_total')} disabled={locked}
              onChange={(e) => set('living_children_total', e.target.value === '' ? null : Number(e.target.value))} />
          </FormField>
          <FormField label="Abortions (A)">
            <Input type="number" min={0} value={num('abortions')} disabled={locked}
              onChange={(e) => set('abortions', e.target.value === '' ? null : Number(e.target.value))} />
          </FormField>
        </div>
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          Zero is a real answer to any of these. Leaving one blank is what the monthly summary
          prints as a dash, and a blank column on a statutory return is the offence itself.
        </p>
        <FormField label="Full postal address (6)">
          <Textarea value={str('address_text')} disabled={locked}
            onChange={(e) => set('address_text', e.target.value)} style={{ minHeight: '3rem' }} />
        </FormField>
        <Grid>
          <FormField label="District (6)"><Input value={str('district')} disabled={locked}
            onChange={(e) => set('district', e.target.value)} /></FormField>
          <FormField label="State (6)"><Input value={str('state')} disabled={locked}
            onChange={(e) => set('state', e.target.value)} /></FormField>
          <FormField label="PIN code (6)"><Input value={str('pincode')} disabled={locked}
            onChange={(e) => set('pincode', e.target.value)} /></FormField>
        </Grid>
      </Section>

      <Section title="Section A — referral and dates" hint="Field 7 needs one or the other: who referred her, or a self-referral note giving the indications.">
        <Grid>
          <FormField label="Referred by — name (7a)"><Input value={str('referred_by_name')} disabled={locked}
            onChange={(e) => set('referred_by_name', e.target.value)} /></FormField>
          <FormField label="Referred by — address (7a)"><Input value={str('referred_by_address')} disabled={locked}
            onChange={(e) => set('referred_by_address', e.target.value)} /></FormField>
          <FormField label="Last menstrual period (8)"><Input type="date" value={str('lmp')} disabled={locked}
            onChange={(e) => set('lmp', e.target.value || null)} /></FormField>
          <FormField label="or weeks of pregnancy (8)"><Input type="number" value={num('weeks_of_pregnancy')} disabled={locked}
            onChange={(e) => set('weeks_of_pregnancy', e.target.value ? Number(e.target.value) : null)} /></FormField>
        </Grid>
        <label className="flex items-center gap-2 text-sm" style={{ color: '#475569' }}>
          <input type="checkbox" checked={!!form.is_self_referral} disabled={locked}
            onChange={(e) => set('is_self_referral', e.target.checked)} />
          Self-referral (7b) — the scan was requested by the doctor performing it
        </label>
        {!!form.is_self_referral && (
          <FormField label="Self-referral note with indications (7b)">
            <Textarea value={str('self_referral_note')} disabled={locked}
              onChange={(e) => set('self_referral_note', e.target.value)} style={{ minHeight: '3rem' }} />
          </FormField>
        )}
      </Section>

      <Section title="Section B — the scan"
        hint="The 23 indications are fixed by the Act. At least one must be ticked, and a scan with no indication is not permitted.">
        <Grid>
          <FormField label="Doctor performing (9)"><Input value={str('performed_by_name')} disabled={locked}
            onChange={(e) => set('performed_by_name', e.target.value)} /></FormField>
          <FormField label="Registration number (9)"><Input value={str('performed_by_reg_no')} disabled={locked}
            onChange={(e) => set('performed_by_reg_no', e.target.value)} /></FormField>
          <FormField label="Declaration taken on (12)" hint="Must be on or before the scan">
            <Input type="date" value={str('declaration_obtained_on')} disabled={locked}
              onChange={(e) => set('declaration_obtained_on', e.target.value || null)} /></FormField>
          <FormField label="Date of procedure (13)"><Input type="date" value={str('procedure_date')} disabled={locked}
            onChange={(e) => set('procedure_date', e.target.value || null)} /></FormField>
        </Grid>

        <p className="text-xs font-semibold mt-2 mb-1.5" style={{ color: '#475569' }}>Indications (10)</p>
        <div className="grid gap-1 max-h-72 overflow-y-auto pr-1">
          {usgIndications.map((o) => (
            <label key={o.code} className="flex items-start gap-2 text-xs p-1.5 rounded-lg"
              style={{ color: '#475569', background: selected.includes(o.code) ? 'rgba(13,148,136,0.06)' : 'transparent' }}>
              <input type="checkbox" className="mt-0.5" disabled={locked}
                checked={selected.includes(o.code)} onChange={() => toggleIndication(o.code)} />
              <span><span className="font-mono" style={{ color: '#94A3B8' }}>{o.code}.</span> {o.label}</span>
            </label>
          ))}
        </div>

        <FormField label="Result of the scan (14)">
          <Textarea value={str('result_text')} disabled={locked}
            onChange={(e) => set('result_text', e.target.value)} style={{ minHeight: '3.5rem' }} />
        </FormField>
        <Grid>
          <FormField label="Result conveyed to (15)"><Input value={str('result_conveyed_to')} disabled={locked}
            onChange={(e) => set('result_conveyed_to', e.target.value)} /></FormField>
          <FormField label="on (15)"><Input type="date" value={str('result_conveyed_on')} disabled={locked}
            onChange={(e) => set('result_conveyed_on', e.target.value || null)} /></FormField>
        </Grid>
        <FormField label="Any indication for MTP from what was found (16)"
          hint="Write NA if none. This is the most closely read line in the register.">
          <Input value={str('mtp_indication')} disabled={locked}
            onChange={(e) => set('mtp_indication', e.target.value)} />
        </FormField>
      </Section>

      <Section title="Section D — declarations"
        hint="These are the point of the whole form. Both are taken before the scan, and both must be signed on paper as well.">
        <label className="flex items-start gap-2 text-sm mb-2" style={{ color: '#475569' }}>
          <input type="checkbox" className="mt-1" checked={!!form.woman_declaration_signed} disabled={locked}
            onChange={(e) => set('woman_declaration_signed', e.target.checked)} />
          <span>
            The woman has declared, in her own language, that she <strong>does not want to know the sex
            of her foetus</strong>, and has signed.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm mb-2" style={{ color: '#475569' }}>
          <input type="checkbox" className="mt-1" checked={!!form.woman_thumb_impression} disabled={locked}
            onChange={(e) => set('woman_thumb_impression', e.target.checked)} />
          <span>She gave a thumb impression rather than a signature</span>
        </label>
        {!!form.woman_thumb_impression && (
          <Grid>
            <FormField label="Identified by (name)"><Input value={str('witness_name')} disabled={locked}
              onChange={(e) => set('witness_name', e.target.value)} /></FormField>
            <FormField label="Relation, if any"><Input value={str('witness_relation')} disabled={locked}
              onChange={(e) => set('witness_relation', e.target.value)} /></FormField>
          </Grid>
        )}
        <label className="flex items-start gap-2 text-sm mb-2 mt-3" style={{ color: '#475569' }}>
          <input type="checkbox" className="mt-1" checked={!!form.doctor_declaration_signed} disabled={locked}
            onChange={(e) => set('doctor_declaration_signed', e.target.checked)} />
          <span>
            I declare that while conducting this scan I have <strong>neither detected nor disclosed
            the sex of the foetus</strong> to anybody in any manner.
          </span>
        </label>
        <Grid>
          <FormField label="Declaring doctor"><Input value={str('doctor_declaration_name')} disabled={locked}
            onChange={(e) => set('doctor_declaration_name', e.target.value)} /></FormField>
          <FormField label="Registration number"><Input value={str('doctor_declaration_reg_no')} disabled={locked}
            onChange={(e) => set('doctor_declaration_reg_no', e.target.value)} /></FormField>
        </Grid>
      </Section>

      {!locked && (
        <div className="flex flex-wrap gap-3 justify-end">
          <button onClick={save} disabled={isPending}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Save draft
          </button>
          <button onClick={() => setConfirmComplete(true)} disabled={isPending}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff' }}>
            Complete and lock
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmComplete}
        title="Complete this Form F?"
        description="Once complete it cannot be edited — a correction has to be raised as an amendment, which stays on the record. Check the declarations have been signed on paper first."
        confirmLabel="Complete and lock"
        confirmVariant="primary"
        loading={isPending}
        onConfirm={complete}
        onClose={() => setConfirmComplete(false)}
      />
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{title}</p>
      {hint && <p className="text-xs mt-1 mb-4" style={{ color: '#94A3B8' }}>{hint}</p>}
      <div className="space-y-3">{children}</div>
    </GlassCard>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}
