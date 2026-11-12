'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import Money from '@/components/ui/Money'
import {
  dischargePatient, getDischargeReadiness, cancelTestsBeforeDischarge, type DischargeReadiness,
} from '@/app/actions/ipd'
import { DISCHARGE_TYPE_OPTIONS, dischargeSkipsBalanceGate, type DischargeType } from '@/lib/dischargeType'

export interface DischargeDone {
  type: DischargeType
  summary: string
  deathAt: string | null
  deathCause: string | null
  dischargedAt: string
  dueRecorded: number
}

/** The browser's local time as a datetime-local value ("2026-11-11T14:30"). */
function localNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const SUMMARY_LABEL: Record<DischargeType, { label: string; placeholder: string }> = {
  normal:    { label: 'Discharge Summary', placeholder: 'Condition at discharge, treatment given, follow-up instructions…' },
  referred:  { label: 'Discharge Summary', placeholder: 'Why referred, where to, condition at transfer, treatment given…' },
  dama:      { label: 'Discharge Summary', placeholder: 'Condition when taken home, the advice given, the risks explained to the family…' },
  absconded: { label: 'Summary',           placeholder: 'When the patient was last seen, condition then, who was informed…' },
  death:     { label: 'Death Summary',     placeholder: 'Course in hospital, events leading to death, resuscitation attempted…' },
}

const box = (bg: string, border: string): React.CSSProperties => ({
  background: bg, border: `1px solid ${border}`, borderRadius: '0.75rem', padding: '0.75rem 0.875rem',
})

export default function DischargeModal({ open, admissionId, onClose, onDischarged }: {
  open: boolean
  admissionId: string
  onClose: () => void
  onDischarged: (d: DischargeDone) => void
}) {
  const [type, setType] = useState<DischargeType | null>(null)
  // Kept as a draft on this computer: a discharge refused for the bill used to
  // throw the whole summary away (BUG-054).
  const draftKey = `uyirly:discharge-draft:${admissionId}`
  const [summary, setSummaryState] = useState(() => {
    try { return window.localStorage.getItem(draftKey) ?? '' } catch { return '' }
  })
  const setSummary = (v: string) => {
    setSummaryState(v)
    try { if (v.trim()) window.localStorage.setItem(draftKey, v); else window.localStorage.removeItem(draftKey) } catch { /* private window */ }
  }
  const [deathAt, setDeathAt] = useState('')
  const [deathCause, setDeathCause] = useState('')
  const [ready, setReady] = useState<DischargeReadiness | null>(null)
  const [loadingReady, setLoadingReady] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [cancelNote, setCancelNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadReadiness() {
    setLoadingReady(true)
    setReady(await getDischargeReadiness(admissionId))
    setLoadingReady(false)
  }

  // Mounted only while open (see AdmissionDetail), so this runs once per opening.
  useEffect(() => {
    let alive = true
    getDischargeReadiness(admissionId).then((r) => {
      if (alive) { setReady(r); setLoadingReady(false) }
    })
    return () => { alive = false }
  }, [admissionId])

  function pickType(t: DischargeType) {
    setType(t)
    setError(null)
    if (t === 'death' && !deathAt) setDeathAt(localNow())
  }

  async function cancelTests() {
    setCancelling(true); setError(null); setCancelNote(null)
    const r = await cancelTestsBeforeDischarge(admissionId)
    setCancelling(false)
    if (!r.success) { setError(r.error); return }
    setCancelNote(
      `${r.cancelled} test${r.cancelled === 1 ? '' : 's'} cancelled and taken off the bill.`
      + (r.refundNeeded ? ' Some had already been paid in cash — issue a refund (credit note) from the bill.' : ''),
    )
    await loadReadiness()
  }

  const skipsGate = type ? dischargeSkipsBalanceGate(type) : false
  const testsBlock = !!ready && ready.testsNotDone.length > 0 && !!type && !skipsGate
  const theatreBlock = !!ready && ready.surgeriesInProgress > 0
  const deathIncomplete = type === 'death' && (!deathAt || !deathCause.trim())
  const canSubmit = !!type && !!summary.trim() && !deathIncomplete && !theatreBlock && !testsBlock && !saving

  async function submit() {
    if (!type) { setError('Choose how the patient is leaving'); return }
    setSaving(true); setError(null)
    const deathIso = type === 'death' && deathAt ? new Date(deathAt).toISOString() : null
    const r = await dischargePatient(admissionId, {
      discharge_summary: summary,
      discharge_type: type,
      death_at: deathIso,
      death_cause: type === 'death' ? deathCause : null,
    })
    setSaving(false)
    if (!r.success) { setError(r.error); void loadReadiness(); return }
    try { window.localStorage.removeItem(draftKey) } catch { /* nothing to clear */ }
    onDischarged({
      type, summary: summary.trim(), deathAt: deathIso, deathCause: type === 'death' ? deathCause.trim() : null,
      dischargedAt: new Date().toISOString(), dueRecorded: r.dueRecorded,
    })
  }

  // What discharge will close, in words — only what is actually open.
  const closes: string[] = []
  if (ready) {
    const n = (count: number, one: string, many: string) => { if (count > 0) closes.push(`${count} ${count === 1 ? one : many}`) }
    n(ready.medicines, 'medicine order stopped', 'medicine orders stopped')
    n(ready.upcomingDoses, 'upcoming dose taken off the chart', 'upcoming doses taken off the chart')
    n(ready.pharmacyRequests, 'pharmacy request cancelled', 'pharmacy requests cancelled')
    n(ready.bloodRequests, 'blood request cancelled (reserved units go back to stock)', 'blood requests cancelled (reserved units go back to stock)')
    n(ready.surgeriesBooked, 'booked surgery cancelled', 'booked surgeries cancelled')
    n(ready.consultsRequested, 'pending consult cancelled', 'pending consults cancelled')
    n(ready.advanceRequests, 'uncollected advance request closed', 'uncollected advance requests closed')
  }
  const summaryText = type ? SUMMARY_LABEL[type] : SUMMARY_LABEL.normal

  return (
    <Modal open={open} onClose={onClose} title="Discharge Patient" maxWidth="38rem">
      <div className="space-y-4">
        <FormField label="How is the patient leaving?" required>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))' }}>
            {DISCHARGE_TYPE_OPTIONS.map((o) => (
              <label key={o.value} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
                padding: '10px 12px', borderRadius: '12px',
                border: `1px solid ${type === o.value ? (o.value === 'death' ? '#475569' : '#0D9488') : '#E2E8F0'}`,
                background: type === o.value ? (o.value === 'death' ? 'rgba(71,85,105,0.07)' : 'rgba(13,148,136,0.05)') : 'rgba(255,255,255,0.6)',
              }}>
                <input type="radio" name="discharge-type" checked={type === o.value} onChange={() => pickType(o.value)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#0D9488', cursor: 'pointer' }} />
                <span>
                  <span className="text-sm font-medium block" style={{ color: '#0F172A' }}>{o.label}</span>
                  <span className="text-xs block mt-0.5" style={{ color: '#64748B' }}>{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </FormField>

        {type === 'death' && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
            <FormField label="Date and time of death" required>
              <Input type="datetime-local" value={deathAt} max={localNow()} onChange={(e) => setDeathAt(e.target.value)} />
            </FormField>
            <FormField label="Cause of death" required>
              <Input value={deathCause} maxLength={500} placeholder="As the doctor certifies it"
                onChange={(e) => setDeathCause(e.target.value)} />
            </FormField>
          </div>
        )}

        <FormField label={summaryText.label} required>
          <SpeechTextarea
            variant="field"
            fieldKey="ipd.discharge_summary"
            value={summary}
            onChange={setSummary}
            placeholder={summaryText.placeholder}
            style={{ minHeight: '7rem' }}
          />
        </FormField>

        {/* What is still open on the stay */}
        {loadingReady && !ready && <p className="text-xs" style={{ color: '#94A3B8' }}>Checking what is still open…</p>}
        {ready && (
          <div className="space-y-2">
            {theatreBlock && (
              <div style={box('#FEF2F2', '#FECACA')}>
                <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>A surgery is in progress</p>
                <p className="text-xs mt-0.5" style={{ color: '#7F1D1D' }}>Mark it completed in OT before discharging.</p>
              </div>
            )}

            {ready.testsNotDone.length > 0 && (
              <div style={box('#FFFBEB', '#FDE68A')}>
                <p className="text-sm font-medium" style={{ color: '#92400E' }}>
                  {ready.testsNotDone.length} test{ready.testsNotDone.length === 1 ? '' : 's'} ordered but not done
                </p>
                <ul className="text-xs mt-1 space-y-0.5" style={{ color: '#78350F' }}>
                  {ready.testsNotDone.map((t) => (
                    <li key={t.orderId} className="flex justify-between gap-3">
                      <span>{t.kind === 'lab' ? 'Lab' : 'Scan'}: {t.name}</span>
                      {t.amount > 0 && <Money amount={t.amount} />}
                    </li>
                  ))}
                </ul>
                {skipsGate ? (
                  <p className="text-xs mt-1.5" style={{ color: '#78350F' }}>These will be cancelled and taken off the bill when you discharge.</p>
                ) : (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <button onClick={cancelTests} disabled={cancelling}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: '#B45309', color: '#fff', border: 'none', cursor: cancelling ? 'wait' : 'pointer' }}>
                      {cancelling ? 'Cancelling…' : 'Cancel these tests'}
                    </button>
                    <span className="text-xs" style={{ color: '#78350F' }}>They come off the bill before the final balance is collected.</span>
                  </div>
                )}
              </div>
            )}
            {cancelNote && <p className="text-xs" style={{ color: '#15803D' }}>{cancelNote}</p>}

            {ready.unchartedDoses > 0 && (
              <div style={box('#FFFBEB', '#FDE68A')}>
                <p className="text-xs" style={{ color: '#78350F' }}>
                  <span className="font-semibold">{ready.unchartedDoses} dose{ready.unchartedDoses === 1 ? '' : 's'} due before now {ready.unchartedDoses === 1 ? 'is' : 'are'} not charted.</span>{' '}
                  Chart them in Treatment — they stay on the chart for the nurse after discharge.
                </p>
              </div>
            )}

            {closes.length > 0 && (
              <div style={box('rgba(248,250,252,0.9)', '#E2E8F0')}>
                <p className="text-xs font-semibold" style={{ color: '#475569' }}>Discharge will also close</p>
                <ul className="text-xs mt-1 space-y-0.5 list-disc pl-4" style={{ color: '#64748B' }}>
                  {closes.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}

            {type && ready.patientBalanceDue > 0 && (
              skipsGate ? (
                <div style={box('rgba(248,250,252,0.9)', '#CBD5E1')}>
                  <p className="text-xs" style={{ color: '#334155' }}>
                    <span className="font-semibold"><Money amount={ready.patientBalanceDue} /> will stay due on the bills.</span>{' '}
                    {type === 'death' ? 'The body' : 'The patient'} is not held for payment; the amount is recorded with this discharge.
                  </p>
                </div>
              ) : (
                ready.unusedAdvance >= ready.patientBalanceDue ? (
                  <div style={box('rgba(240,253,250,0.9)', '#99F6E4')}>
                    <p className="text-xs" style={{ color: '#115E59' }}>
                      <span className="font-semibold"><Money amount={ready.patientBalanceDue} /> on the bills is covered by the <Money amount={ready.unusedAdvance} /> advance held</span>
                      {' '}— it is applied when you discharge. Today’s room and nursing charges are added then too.
                    </p>
                  </div>
                ) : (
                <div style={box('#FEF2F2', '#FECACA')}>
                  <p className="text-xs" style={{ color: '#7F1D1D' }}>
                    {ready.unusedAdvance > 0 ? (
                      <><Money amount={ready.patientBalanceDue} /> due − <Money amount={ready.unusedAdvance} /> advance held = <span className="font-semibold"><Money amount={ready.patientBalanceDue - ready.unusedAdvance} /> to collect</span></>
                    ) : (
                      <span className="font-semibold"><Money amount={ready.patientBalanceDue} /> balance due</span>
                    )}
                    {ready.insuranceApproved > 0 && <> (after <Money amount={ready.insuranceApproved} /> approved insurance)</>}
                    {' '}— collect it before discharge. Today’s room and nursing charges are added when you discharge.
                  </p>
                </div>
                )
              )
            )}

            {ready.isMlc && type && (type === 'death' || type === 'dama' || type === 'absconded') && (
              <div style={box('#FEF2F2', '#FECACA')}>
                <p className="text-xs" style={{ color: '#7F1D1D' }}>
                  <span className="font-semibold">Medico-legal case.</span> Record the outcome in the{' '}
                  <Link href="/emergency/mlc" style={{ color: '#B91C1C', textDecoration: 'underline' }}>MLC register</Link>{' '}
                  and inform the police.
                </p>
              </div>
            )}

            {type === 'death' && ready.upcomingAppointments > 0 && (
              <div style={box('rgba(248,250,252,0.9)', '#CBD5E1')}>
                <p className="text-xs" style={{ color: '#334155' }}>
                  {ready.upcomingAppointments} upcoming appointment{ready.upcomingAppointments === 1 ? '' : 's'} — cancel them in{' '}
                  <Link href="/appointments" style={{ color: '#0D9488', textDecoration: 'underline' }}>Appointments</Link> (any refund is handled there).
                  Pending follow-ups are cancelled automatically.
                </p>
              </div>
            )}

            {type === 'dama' && (
              <p className="text-xs" style={{ color: '#64748B' }}>
                After discharge, print the summary — it includes the declaration page for the family to sign.
              </p>
            )}
            {type === 'referred' && (
              <p className="text-xs" style={{ color: '#64748B' }}>
                Give the referral letter from <span className="font-medium">Refer Out</span> along with the summary.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: canSubmit ? '#DC2626' : '#94A3B8', color: '#fff', border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}>
            {saving ? 'Discharging…' : type === 'death' ? 'Record death and discharge' : 'Discharge Patient'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
