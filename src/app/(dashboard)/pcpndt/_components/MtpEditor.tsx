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
import { saveMtpDraft, completeMtp, type PcpndtOption } from '@/app/actions/pcpndt'

/**
 * An MTP record.
 *
 * Same principle as Form F: the completeness rules live in the database and
 * the refusal explains itself, so this screen does not duplicate them. The one
 * rule worth surfacing early is the twenty-week line, because it changes what
 * the hospital has to have done — not just what it has to write down.
 */
export default function MtpEditor({ record, grounds }: {
  record: Record<string, unknown>
  grounds: PcpndtOption[]
}) {
  const router = useRouter()
  const locked = record.status !== 'draft'
  const [form, setForm] = useState<Record<string, unknown>>(record)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const str = (k: string) => (form[k] as string | null) ?? ''
  const num = (k: string) => (form[k] as number | null) ?? ''
  const selected = (form.grounds as string[] | null) ?? []

  const weeks = form.gestation_weeks as number | null
  // Beyond twenty weeks the Act requires the opinion of two registered medical
  // practitioners rather than one. Saying so while the form is still open is
  // more use than refusing at the end.
  const needsSecond = weeks != null && weeks > 20

  function toggleGround(code: string) {
    set('grounds', selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code])
  }

  function patchOf() {
    const { id, status, created_at, serial_no, tenant_id, ...patch } = form as Record<string, unknown>
    void id; void status; void created_at; void serial_no; void tenant_id
    return patch
  }

  function save() {
    startTransition(async () => {
      const res = await saveMtpDraft(record.id as string, patchOf())
      setMsg(res.success ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error })
    })
  }

  function complete() {
    setConfirm(false)
    startTransition(async () => {
      const saved = await saveMtpDraft(record.id as string, patchOf())
      if (!saved.success) { setMsg({ ok: false, text: saved.error }); return }
      const res = await completeMtp(record.id as string)
      if (res.success) { setMsg({ ok: true, text: 'Complete.' }); router.refresh() }
      else setMsg({ ok: false, text: res.error })
    })
  }

  return (
    <div className="space-y-4">
      {locked && (
        <GlassCard className="p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <Lock className="w-4 h-4" style={{ color: '#64748B' }} /> Complete
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

      <Section title="The woman" hint="Copied from her record when this was opened, and frozen here.">
        <Grid>
          <FormField label="Name"><Input value={str('patient_name')} disabled={locked}
            onChange={(e) => set('patient_name', e.target.value)} /></FormField>
          <FormField label="Age"><Input type="number" value={num('patient_age_years')} disabled={locked}
            onChange={(e) => set('patient_age_years', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Husband's name"><Input value={str('relation_name')} disabled={locked}
            onChange={(e) => set('relation_name', e.target.value)} /></FormField>
          <FormField label="Contact number"><Input value={str('contact_no')} disabled={locked}
            onChange={(e) => set('contact_no', e.target.value)} /></FormField>
        </Grid>
        <FormField label="Address">
          <Textarea value={str('address_text')} disabled={locked}
            onChange={(e) => set('address_text', e.target.value)} style={{ minHeight: '3rem' }} />
        </FormField>
      </Section>

      <Section title="Obstetric history"
        hint="G, P, L, A and the living children split by sex. The return classifies her on these, because the question the Act is asking is whether terminations cluster among women who already have daughters.">
        <Grid>
          <FormField label="Gravida (G)"><Input type="number" value={num('gravida')} disabled={locked}
            onChange={(e) => set('gravida', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Para (P)"><Input type="number" value={num('para')} disabled={locked}
            onChange={(e) => set('para', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Living (L)"><Input type="number" value={num('living')} disabled={locked}
            onChange={(e) => set('living', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Abortions (A)"><Input type="number" value={num('abortions')} disabled={locked}
            onChange={(e) => set('abortions', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Living sons"><Input type="number" value={num('living_male')} disabled={locked}
            onChange={(e) => set('living_male', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="Living daughters"><Input type="number" value={num('living_female')} disabled={locked}
            onChange={(e) => set('living_female', e.target.value ? Number(e.target.value) : null)} /></FormField>
        </Grid>
      </Section>

      <Section title="The pregnancy and the procedure">
        <Grid>
          <FormField label="LMP"><Input type="date" value={str('lmp')} disabled={locked}
            onChange={(e) => set('lmp', e.target.value || null)} /></FormField>
          <FormField label="Weeks of pregnancy" hint="From the scan, not from the dates">
            <Input type="number" value={num('gestation_weeks')} disabled={locked}
              onChange={(e) => set('gestation_weeks', e.target.value ? Number(e.target.value) : null)} /></FormField>
          <FormField label="IP number"><Input value={str('ip_no')} disabled={locked}
            onChange={(e) => set('ip_no', e.target.value)} /></FormField>
          <FormField label="Method">
            <Select value={str('method')} disabled={locked} onChange={(e) => set('method', e.target.value || null)}>
              <option value="">—</option>
              <option value="medical">Medical</option>
              <option value="surgical">Surgical</option>
            </Select>
          </FormField>
          <FormField label="Admitted on"><Input type="date" value={str('admitted_on')} disabled={locked}
            onChange={(e) => set('admitted_on', e.target.value || null)} /></FormField>
          <FormField label="Discharged on"><Input type="date" value={str('discharged_on')} disabled={locked}
            onChange={(e) => set('discharged_on', e.target.value || null)} /></FormField>
          <FormField label="Consent taken on (Form C)" hint="Must be on or before the procedure">
            <Input type="date" value={str('consent_obtained_on')} disabled={locked}
              onChange={(e) => set('consent_obtained_on', e.target.value || null)} /></FormField>
          <FormField label="Date of procedure"><Input type="date" value={str('procedure_date')} disabled={locked}
            onChange={(e) => set('procedure_date', e.target.value || null)} /></FormField>
        </Grid>
      </Section>

      <Section title="Who performed it, and on what ground"
        hint="Section 3(2) permits termination on stated grounds only. The wording is the Act's.">
        <Grid>
          <FormField label="Performed by"><Input value={str('performed_by_name')} disabled={locked}
            onChange={(e) => set('performed_by_name', e.target.value)} /></FormField>
          <FormField label="Registration number"><Input value={str('performed_by_reg_no')} disabled={locked}
            onChange={(e) => set('performed_by_reg_no', e.target.value)} /></FormField>
        </Grid>

        {needsSecond && (
          <div className="p-3 rounded-lg" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#92400E' }}>
              Beyond twenty weeks the Act requires the opinion of two registered medical practitioners.
            </p>
            <Grid>
              <FormField label="Second opinion by"><Input value={str('second_opinion_by_name')} disabled={locked}
                onChange={(e) => set('second_opinion_by_name', e.target.value)} /></FormField>
              <FormField label="Registration number"><Input value={str('second_opinion_by_reg_no')} disabled={locked}
                onChange={(e) => set('second_opinion_by_reg_no', e.target.value)} /></FormField>
            </Grid>
          </div>
        )}

        <p className="text-xs font-semibold mt-2 mb-1.5" style={{ color: '#475569' }}>Ground under Section 3(2)</p>
        <div className="grid gap-1">
          {grounds.map((g) => (
            <label key={g.code} className="flex items-start gap-2 text-xs p-1.5 rounded-lg"
              style={{ color: '#475569', background: selected.includes(g.code) ? 'rgba(13,148,136,0.06)' : 'transparent' }}>
              <input type="checkbox" className="mt-0.5" disabled={locked}
                checked={selected.includes(g.code)} onChange={() => toggleGround(g.code)} />
              {g.label}
            </label>
          ))}
        </div>

        <FormField label="Reason, in the hospital's words" hint="What goes in the Reason column of the return">
          <Textarea value={str('reason_text')} disabled={locked}
            onChange={(e) => set('reason_text', e.target.value)} style={{ minHeight: '3rem' }} />
        </FormField>
        <FormField label="Complications, if any" hint="Write NA if none">
          <Input value={str('complications')} disabled={locked}
            onChange={(e) => set('complications', e.target.value)} />
        </FormField>
      </Section>

      {!locked && (
        <div className="flex flex-wrap gap-3 justify-end">
          <button onClick={save} disabled={isPending}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Save draft
          </button>
          <button onClick={() => setConfirm(true)} disabled={isPending}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff' }}>
            Complete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Complete this MTP record?"
        description="It will be included in the monthly statement to the Chief Medical Officer."
        confirmLabel="Complete"
        confirmVariant="primary"
        loading={isPending}
        onConfirm={complete}
        onClose={() => setConfirm(false)}
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
