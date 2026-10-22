'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, ClipboardList, Share2, AlertTriangle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import DateText from '@/components/ui/DateText'
import {
  startFormF, startMtp, addAncReferral,
  listReferralDestinations, listReferralsForPatient, type AncReferralRow,
} from '@/app/actions/pcpndt'
import { istToday } from '@/lib/istDate'

/**
 * The three statutory records, started from where the decision is made.
 *
 * Nobody navigates to a register to create a record — they are already looking
 * at the woman. The registers are for finding and finishing; this is the way
 * in, and without it none of them could be started at all.
 */
export default function StatutoryActions({ patientId, canWrite }: {
  patientId: string
  canWrite: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [referring, setReferring] = useState(false)
  const [referrals, setReferrals] = useState<AncReferralRow[]>([])

  const load = useCallback(() => { listReferralsForPatient(patientId).then(setReferrals) }, [patientId])
  useEffect(() => { load() }, [load])

  async function openFormF() {
    setBusy(true); setErr(null)
    const res = await startFormF({ patient_id: patientId })
    setBusy(false)
    if (res.success) router.push(`/pcpndt/${res.id}`)
    else setErr(res.error)
  }

  async function openMtp() {
    setBusy(true); setErr(null)
    const res = await startMtp({ patient_id: patientId })
    setBusy(false)
    if (res.success) router.push(`/pcpndt/mtp/${res.id}`)
    else setErr(res.error)
  }

  if (!canWrite) return null

  return (
    <GlassCard className="p-4">
      <h3 className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Statutory records</h3>
      <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>
        Started here, finished on the register. Everything the hospital already knows about her is
        carried across.
      </p>

      {err && (
        <p className="text-xs mb-3 flex items-start gap-1.5" style={{ color: '#991B1B' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{err}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Action icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Start Form F"
          onClick={openFormF} disabled={busy} />
        <Action icon={<ClipboardList className="w-3.5 h-3.5" />} label="Record MTP"
          onClick={openMtp} disabled={busy} />
        <Action icon={<Share2 className="w-3.5 h-3.5" />} label="Refer to another centre"
          onClick={() => setReferring(true)} disabled={busy} />
      </div>

      {referrals.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {referrals.map((r) => (
            <div key={r.id} className="px-3 py-2 rounded-lg text-xs"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}>
              <span className="font-semibold" style={{ color: '#0F172A' }}>
                {r.referred_to_institution ?? '—'}
              </span>
              {r.referred_to_doctor ? ` · ${r.referred_to_doctor}` : ''}
              {' · '}<DateText date={r.referred_on} />
              {r.reason ? ` · ${r.reason}` : ''}
            </div>
          ))}
        </div>
      )}

      {referring && (
        <ReferModal patientId={patientId}
          onClose={() => setReferring(false)}
          onSaved={() => { setReferring(false); load() }} />
      )}
    </GlassCard>
  )
}

function Action({ icon, label, onClick, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
      style={{
        background: 'rgba(219,39,119,0.07)', color: '#DB2777',
        border: '1px solid rgba(219,39,119,0.25)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}>
      {icon}{label}
    </button>
  )
}

/**
 * Referring her out.
 *
 * Both name fields are free text. "Referred to" is always somewhere else —
 * a district hospital, a medical college. "Referred by" is usually one of our
 * own doctors, but a visiting consultant who comes on Tuesdays is often not on
 * the staff list, and the form wants their qualification, which staff records
 * do not hold anyway.
 */
function ReferModal({ patientId, onClose, onSaved }: {
  patientId: string; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    referred_on: istToday(),
    referred_to_institution: '', referred_to_doctor: '', referred_to_address: '',
    reason: '', referred_by_name: '', referred_by_qualification: '', op_no: '', ip_no: '',
  })
  const [recent, setRecent] = useState<Array<{ institution: string; doctor: string | null; address: string | null }>>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => { listReferralDestinations().then(setRecent) }, [])

  async function save() {
    setErr(null); setBusy(true)
    const res = await addAncReferral({ patient_id: patientId, ...form })
    setBusy(false)
    if (res.success) onSaved(); else setErr(res.error)
  }

  return (
    <Modal open onClose={onClose} title="Refer to another registered centre" maxWidth="38rem">
      <div className="space-y-3">
        {recent.length > 0 && (
          <div>
            <p className="text-xs mb-1.5" style={{ color: '#94A3B8' }}>Sent there before</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button key={r.institution}
                  onClick={() => setForm((f) => ({
                    ...f,
                    referred_to_institution: r.institution,
                    referred_to_doctor: r.doctor ?? f.referred_to_doctor,
                    referred_to_address: r.address ?? f.referred_to_address,
                  }))}
                  className="px-2.5 py-1 rounded-lg text-xs"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  {r.institution}
                </button>
              ))}
            </div>
          </div>
        )}

        <FormField label="Referred to — institution" hint="Where she is being sent">
          <Input value={form.referred_to_institution}
            onChange={(e) => set('referred_to_institution', e.target.value)}
            placeholder="e.g. Government Headquarters Hospital, Karur" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Referred to — doctor">
            <Input value={form.referred_to_doctor}
              onChange={(e) => set('referred_to_doctor', e.target.value)} placeholder="Dr. name" />
          </FormField>
          <FormField label="Date of referral">
            <Input type="date" value={form.referred_on}
              onChange={(e) => set('referred_on', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Address of that centre">
          <Input value={form.referred_to_address}
            onChange={(e) => set('referred_to_address', e.target.value)} />
        </FormField>

        <FormField label="Reason for referral" hint="The form asks why — 'sent to a bigger hospital' is not a record of anything">
          <Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)}
            style={{ minHeight: '3rem' }} />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Referred by — doctor">
            <Input value={form.referred_by_name}
              onChange={(e) => set('referred_by_name', e.target.value)} placeholder="Our doctor's name" />
          </FormField>
          <FormField label="Qualification" hint="The form asks for it">
            <Input value={form.referred_by_qualification}
              onChange={(e) => set('referred_by_qualification', e.target.value)} placeholder="e.g. MBBS, DGO" />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="OP number"><Input value={form.op_no}
            onChange={(e) => set('op_no', e.target.value)} /></FormField>
          <FormField label="IP number"><Input value={form.ip_no}
            onChange={(e) => set('ip_no', e.target.value)} /></FormField>
        </div>

        {err && <p className="text-xs" style={{ color: '#DC2626' }}>{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={save} disabled={busy}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#DB2777', color: '#fff', border: 'none' }}>
            {busy ? 'Saving…' : 'Record referral'}
          </button>
        </div>
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          This appears on the monthly referral return. See the{' '}
          <Link href="/pcpndt/returns" style={{ color: '#0D9488' }}>returns page</Link>.
        </p>
      </div>
    </Modal>
  )
}
