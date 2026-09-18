'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, ClipboardCheck, Syringe } from 'lucide-react'
import {
  declineVaccine, getVaccination, giveVaccineToday, recordVaccineGivenEarlier, saveVaccinationHistory, undoVaccine,
  type HistoryEntry, type Vaccination,
} from '@/app/actions/vaccination'
import { dosesDueByNow, type DoseStatus } from '@/lib/immunization/schedule'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface Props {
  patientId: string
  visitId?: string | null
  initial: Vaccination
  canWrite: boolean
  /** Called after any change (e.g. to refresh a parent's copy). */
  onChanged?: (v: Vaccination) => void
}

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Immunisation-schedule wording: "At birth", "6 weeks", "9 months", "16 months", "5 years". */
export function scheduleAgeLabel(days: number): string {
  if (days <= 0) return 'At birth'
  if (days < 120 && days % 7 === 0) return `${days / 7} weeks`
  const years = days / 365.25
  if (days >= 730 && Math.abs(years - Math.round(years)) < 0.05) return `${Math.round(years)} years`
  // The schedule counts months as 30 days (9 months = 270, 16 months = 480).
  return `${days % 30 === 0 ? days / 30 : Math.round(days / 30.4375)} months`
}

const DECLINE_REASONS = ['Fever / unwell today', 'Parent declined', 'Vaccine out of stock', 'Contraindication', 'Other']

const btn = (primary = false): React.CSSProperties => primary
  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
  : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }
const field: React.CSSProperties = { border: '1px solid #E2E8F0', background: '#fff', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: '#0F172A' }

export default function VaccinationPanel({ patientId, visitId = null, initial, canWrite, onChanged }: Props) {
  const [v, setV] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState<{ key: string; mode: 'earlier' | 'decline' } | null>(null)
  const [form, setForm] = useState({ date: '', reason: DECLINE_REASONS[0], other: '' })
  const [showHistory, setShowHistory] = useState(initial.needsHistoryCheck)
  const [showGiven, setShowGiven] = useState(false)
  const [showMissed, setShowMissed] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'limit' | 'undo'; dose: DoseStatus } | null>(null)
  /** Brand chosen per dose when the pharmacy stocks more than one. */
  const [brand, setBrand] = useState<Record<string, string>>({})

  const refresh = async () => { const next = await getVaccination(patientId); setV(next); onChanged?.(next) }
  const run = (fn: () => Promise<{ success: boolean; error?: string; warning?: string; billNo?: string; amount?: number; product?: string }>, after?: () => void) => {
    setError(''); setNotice('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Could not save'); return }
      if (res.warning) setNotice(res.warning)
      else if (res.billNo) setNotice(`${res.product ? `${res.product}: ` : ''}charged ₹${res.amount} on bill ${res.billNo} — collect at the pharmacy counter.`)
      await refresh(); after?.()
    })
  }

  const groups = useMemo(() => ({
    now: v.doses.filter((d) => d.canGiveToday),
    waiting: v.doses.filter((d) => d.state === 'waiting'),
    upcoming: v.doses.filter((d) => d.state === 'upcoming').slice(0, 5),
    missed: v.doses.filter((d) => d.state === 'missed'),
    given: v.doses.filter((d) => d.state === 'given').sort((a, b) => (b.given!.given_date).localeCompare(a.given!.given_date)),
  }), [v])
  const givenTodayDoses = groups.given.filter((d) => d.given!.date_known && d.given!.given_date === v.today)

  if (!v.dob) {
    return <p className="text-sm" style={{ color: '#92400E' }}>Add the child&apos;s date of birth to the patient profile to see the vaccination schedule.</p>
  }

  function give(d: DoseStatus, confirmed = false) {
    if (!confirmed && v.dailyWarnLimit != null && v.givenToday >= v.dailyWarnLimit) { setConfirm({ kind: 'limit', dose: d }); return }
    run(() => giveVaccineToday(patientId, d.vaccine, d.dose_label, visitId, brand[d.key] ?? null))
  }

  if (showHistory && canWrite) {
    return <HistoryCheck v={v} isPending={isPending} error={error}
      onCancel={v.needsHistoryCheck ? null : () => setShowHistory(false)}
      onSave={(entries) => run(() => saveVaccinationHistory(patientId, entries), () => setShowHistory(false))} />
  }

  const renderRow = (d: DoseStatus, actions: 'now' | 'waiting' | 'missed') => {
    const isOpen = open?.key === d.key
    const disabledRow = !canWrite
    return (
      <li key={d.key} className="px-3 py-2.5 rounded-xl" style={{
        background: actions === 'missed' ? '#F8FAFC' : d.state === 'overdue' ? '#FEF2F2' : actions === 'waiting' ? '#F8FAFC' : '#FFFBEB',
        border: `1px solid ${actions === 'missed' || actions === 'waiting' ? '#E2E8F0' : d.state === 'overdue' ? '#FECACA' : '#FDE68A'}`,
      }}>
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-semibold" style={{ color: actions === 'missed' ? '#64748B' : '#0F172A' }}>
              {d.label}
              <span className="ml-2 text-[11px] font-medium" style={{ color: '#64748B' }}>{scheduleAgeLabel(d.dueAgeDays)}</span>
            </p>
            <p className="text-xs" style={{ color: d.state === 'overdue' ? '#B91C1C' : actions === 'now' ? '#B45309' : '#64748B' }}>
              {actions === 'now' && (d.state === 'overdue' ? `Overdue since ${fmt(d.dueDate)}` : `Due ${fmt(d.dueDate)}`)}
              {actions === 'waiting' && `${d.reason}${d.earliestDate ? ` — from ${fmt(d.earliestDate)}` : ''}`}
              {actions === 'missed' && `Missed — ${d.note ?? 'past the age limit'}`}
              {actions !== 'missed' && d.lastDate && ` · give by ${fmt(d.lastDate)}`}
            </p>
            {actions === 'now' && d.note && /missed|catch-up/i.test(d.note) && <p className="text-xs" style={{ color: '#92400E' }}>{d.note}</p>}
            {actions === 'now' && (() => {
              const sup = v.supply?.[d.vaccine]
              if (!sup) return null
              if (sup.free_supply) return <p className="text-xs" style={{ color: '#15803D' }}>Government supply — no charge</p>
              if (!sup.products.length) return <p className="text-xs" style={{ color: '#94A3B8' }}>No pharmacy brand linked — record only, nothing charged</p>
              if (sup.inStock <= 0) return <p className="text-xs" style={{ color: '#B45309' }}>No stock of {sup.products.map((p) => p.name).join(', ')} — record only, nothing charged</p>
              const inStock = sup.products.filter((p) => p.inStock > 0)
              if (inStock.length === 1) {
                return <p className="text-xs" style={{ color: '#475569' }}>{inStock[0].name} · {inStock[0].inStock} in stock · ₹{inStock[0].price}</p>
              }
              // More than one brand in stock (e.g. painful and painless) — the clinic chooses.
              const chosen = brand[d.key] ?? sup.next?.productId ?? inStock[0].productId
              return (
                <span className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className="text-xs" style={{ color: '#475569' }}>Brand:</span>
                  {inStock.map((p) => (
                    <button key={p.productId} type="button" disabled={disabledRow}
                      onClick={() => setBrand((b) => ({ ...b, [d.key]: p.productId }))}
                      aria-pressed={chosen === p.productId}
                      className="px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{
                        border: '1px solid', cursor: disabledRow ? 'default' : 'pointer',
                        borderColor: chosen === p.productId ? '#0D9488' : '#E2E8F0',
                        background: chosen === p.productId ? '#F0FDFA' : '#fff',
                        color: chosen === p.productId ? '#0F766E' : '#64748B',
                      }}>
                      {p.name} · ₹{p.price}
                    </button>
                  ))}
                </span>
              )
            })()}
            {d.deferral && <p className="text-xs" style={{ color: '#64748B' }}>Not given on {fmt(d.deferral.deferred_on)}: {d.deferral.reason}</p>}
          </div>
          {canWrite && (
            <span className="flex gap-1.5 flex-wrap">
              {actions === 'now' && (
                <button type="button" onClick={() => give(d)} disabled={isPending} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={btn(true)}>Give today</button>
              )}
              <button type="button" onClick={() => { setOpen(isOpen && open?.mode === 'earlier' ? null : { key: d.key, mode: 'earlier' }); setForm((f) => ({ ...f, date: '' })) }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium" style={btn()}>Given earlier</button>
              {actions === 'now' && (
                <button type="button" onClick={() => { setOpen(isOpen && open?.mode === 'decline' ? null : { key: d.key, mode: 'decline' }); setForm((f) => ({ ...f, reason: DECLINE_REASONS[0], other: '' })) }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium" style={btn()}>Not giving</button>
              )}
            </span>
          )}
        </div>
        {isOpen && open?.mode === 'earlier' && (
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs" style={{ color: '#334155' }}>
            <label className="flex items-center gap-1.5">Date on card <input type="date" max={v.today} min={v.dob ?? undefined} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={field} /></label>
            <button type="button" disabled={isPending || !form.date} onClick={() => run(() => recordVaccineGivenEarlier(patientId, d.vaccine, d.dose_label, form.date), () => setOpen(null))}
              className="px-2.5 py-1 rounded-lg font-semibold" style={{ ...btn(true), opacity: form.date ? 1 : 0.6 }}>Save</button>
            <button type="button" disabled={isPending} onClick={() => run(() => recordVaccineGivenEarlier(patientId, d.vaccine, d.dose_label, null), () => setOpen(null))}
              className="px-2.5 py-1 rounded-lg" style={btn()}>Date not known</button>
          </div>
        )}
        {isOpen && open?.mode === 'decline' && (
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs">
            <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} style={field} aria-label="Reason">
              {DECLINE_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            {form.reason === 'Other' && <input value={form.other} onChange={(e) => setForm((f) => ({ ...f, other: e.target.value }))} placeholder="Reason" style={field} />}
            <button type="button" disabled={isPending} onClick={() => run(() => declineVaccine(patientId, d.vaccine, d.dose_label, form.reason === 'Other' ? form.other : form.reason, visitId), () => setOpen(null))}
              className="px-2.5 py-1 rounded-lg font-semibold" style={btn(true)}>Save</button>
          </div>
        )}
      </li>
    )
  }

  const overLimit = v.dailyWarnLimit != null && v.givenToday >= v.dailyWarnLimit
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
          <Syringe className="w-3.5 h-3.5" /> Vaccinations
        </p>
        {v.givenToday > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: overLimit ? '#FEF3C7' : '#DCFCE7', color: overLimit ? '#92400E' : '#15803D' }}>
            {v.givenToday} given today{v.dailyWarnLimit != null ? ` · clinic limit ${v.dailyWarnLimit}` : ''}
          </span>
        )}
        {canWrite && (
          <button type="button" onClick={() => setShowHistory(true)} className="ml-auto flex items-center gap-1 text-xs font-medium" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ClipboardCheck className="w-3.5 h-3.5" /> Check vaccination card
          </button>
        )}
      </div>
      {error && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{error}</p>}
      {notice && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>{notice}</p>}

      {givenTodayDoses.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {givenTodayDoses.map((d) => (
            <li key={d.key} className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1 py-0.5 rounded-md" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' }}>
              <CheckCircle className="w-3 h-3" /> {d.label} given today
              {d.given!.fulfilment === 'pending' && <span style={{ color: '#B45309' }}>· ₹{d.given!.charge_amount} {d.given!.bill && d.given!.bill.paid >= d.given!.bill.total ? 'paid, at pharmacy' : 'to collect'}</span>}
              {d.given!.fulfilment === 'dispensed' && <span style={{ color: '#15803D' }}>· ₹{d.given!.charge_amount} paid{d.given!.batch_no ? ` · batch ${d.given!.batch_no}` : ''}</span>}
              {canWrite && <button type="button" onClick={() => run(() => undoVaccine(d.given!.id))} disabled={isPending} className="px-1 font-semibold" style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Undo</button>}
            </li>
          ))}
        </ul>
      )}

      {groups.now.length === 0 ? (
        <p className="text-sm" style={{ color: '#15803D' }}>No vaccines due today.</p>
      ) : (
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Can be given today ({groups.now.length})</p>
          <ul className="space-y-2">{groups.now.map((d) => renderRow(d, 'now'))}</ul>
        </div>
      )}

      {groups.waiting.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Waiting for an earlier dose ({groups.waiting.length})</p>
          <ul className="space-y-2">{groups.waiting.map((d) => renderRow(d, 'waiting'))}</ul>
        </div>
      )}

      {groups.upcoming.length > 0 && (
        <p className="text-xs" style={{ color: '#64748B' }}>
          <span className="font-medium" style={{ color: '#334155' }}>Coming up: </span>
          {groups.upcoming.map((d) => `${d.label} (${fmt(d.earliestDate && d.earliestDate > d.dueDate ? d.earliestDate : d.dueDate)})`).join(' · ')}
        </p>
      )}

      {groups.missed.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowMissed((s) => !s)} className="flex items-center gap-1 text-xs font-medium" style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showMissed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <AlertTriangle className="w-3.5 h-3.5" /> Missed — too old now ({groups.missed.length})
          </button>
          {showMissed && <ul className="space-y-2 mt-1.5">{groups.missed.map((d) => renderRow(d, 'missed'))}</ul>}
        </div>
      )}

      {groups.given.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowGiven((s) => !s)} className="flex items-center gap-1 text-xs font-medium" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showGiven ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Given ({groups.given.length})
          </button>
          {showGiven && (
            <ul className="mt-1.5 space-y-1">
              {groups.given.map((d) => (
                <li key={d.key} className="flex items-center gap-2 text-xs" style={{ color: '#334155' }}>
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#15803D' }} />
                  <span className="flex-1">
                    {d.label} — {d.given!.date_known ? fmt(d.given!.given_date) : 'given earlier, date not known'}
                    {d.given!.batch_no ? <span style={{ color: '#64748B' }}> · batch {d.given!.batch_no}{d.given!.expiry_date ? `, expiry ${fmt(d.given!.expiry_date)}` : ''}</span> : null}
                  </span>
                  {canWrite && <button type="button" onClick={() => setConfirm({ kind: 'undo', dose: d })} disabled={isPending} style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Undo</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[10px]" style={{ color: '#94A3B8' }}>National Immunization Schedule (UIP) — age limits and minimum gaps between doses applied.</p>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        loading={isPending}
        title={confirm?.kind === 'limit' ? 'Clinic daily limit reached' : 'Remove this vaccine?'}
        description={confirm?.kind === 'limit'
          ? `${v.givenToday} vaccine${v.givenToday === 1 ? ' has' : 's have'} already been given today (clinic limit ${v.dailyWarnLimit}). Give ${confirm.dose.label} as well?`
          : confirm ? `${confirm.dose.label} will be removed from the child's record. Use this only if it was recorded by mistake.` : ''}
        confirmLabel={confirm?.kind === 'limit' ? 'Give today' : 'Remove'}
        confirmVariant={confirm?.kind === 'limit' ? 'primary' : 'danger'}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (!c) return
          if (c.kind === 'limit') give(c.dose, true)
          else run(() => undoVaccine(c.dose.given!.id))
        }}
      />
    </div>
  )
}

/** First visit: go through the child's vaccination card once, one answer per vaccine. */
function HistoryCheck({ v, onSave, onCancel, isPending, error }: {
  v: Vaccination; onSave: (entries: HistoryEntry[]) => void; onCancel: (() => void) | null; isPending: boolean; error: string
}) {
  const due = dosesDueByNow(v.doses, v.ageDays ?? 0).filter((d) => d.state !== 'given')
  const [answers, setAnswers] = useState<Record<string, { answer: HistoryEntry['answer'] | ''; date: string }>>({})
  const set = (k: string, patch: Partial<{ answer: HistoryEntry['answer'] | ''; date: string }>) =>
    setAnswers((a) => ({ ...a, [k]: { answer: a[k]?.answer ?? '', date: a[k]?.date ?? '', ...patch } }))
  const ages = [...new Set(due.map((d) => scheduleAgeLabel(d.dueAgeDays)))]
  const answered = due.filter((d) => answers[d.key]?.answer).length

  function save() {
    onSave(due.filter((d) => answers[d.key]?.answer).map((d) => ({
      vaccine: d.vaccine, dose_label: d.dose_label, answer: answers[d.key].answer as HistoryEntry['answer'], date: answers[d.key].date || null,
    })))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#0F172A' }}><ClipboardCheck className="w-4 h-4" style={{ color: '#0D9488' }} /> Vaccination history</p>
          <p className="text-xs" style={{ color: '#64748B' }}>Go through the child&apos;s vaccination card once. Vaccines marked Yes are recorded as given; No and Not sure stay pending.</p>
        </div>
        <button type="button" onClick={() => setAnswers(Object.fromEntries(due.map((d) => [d.key, { answer: 'yes' as const, date: answers[d.key]?.date ?? '' }])))}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={btn()}>Mark all Yes</button>
      </div>
      {error && <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{error}</p>}
      {due.length === 0 && <p className="text-sm" style={{ color: '#15803D' }}>Nothing due by this age is left to check.</p>}
      {ages.map((age) => (
        <div key={age}>
          <p className="text-xs font-semibold mb-1" style={{ color: '#334155' }}>{age}</p>
          <ul className="space-y-1">
            {due.filter((d) => scheduleAgeLabel(d.dueAgeDays) === age).map((d) => {
              const a = answers[d.key]
              return (
                <li key={d.key} className="flex items-center gap-2 flex-wrap py-1" style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <span className="text-sm flex-1 min-w-[150px]" style={{ color: '#0F172A' }}>{d.label}</span>
                  <span role="radiogroup" aria-label={`${d.label} given?`} className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    {(['yes', 'no', 'unsure'] as const).map((opt) => (
                      <button key={opt} type="button" role="radio" aria-checked={a?.answer === opt} onClick={() => set(d.key, { answer: a?.answer === opt ? '' : opt })}
                        className="px-2.5 py-1 text-xs font-medium"
                        style={{ border: 'none', cursor: 'pointer', background: a?.answer === opt ? (opt === 'yes' ? '#DCFCE7' : opt === 'no' ? '#FEE2E2' : '#F1F5F9') : '#fff', color: a?.answer === opt ? (opt === 'yes' ? '#15803D' : opt === 'no' ? '#B91C1C' : '#334155') : '#64748B' }}>
                        {opt === 'yes' ? 'Yes' : opt === 'no' ? 'No' : 'Not sure'}
                      </button>
                    ))}
                  </span>
                  {a?.answer === 'yes' && (
                    <input type="date" aria-label={`${d.label} date`} max={v.today} min={v.dob ?? undefined} value={a.date} onChange={(e) => set(d.key, { date: e.target.value })} style={field} title="Date on the card (optional)" />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <span className="text-xs mr-auto" style={{ color: '#64748B' }}>{answered} of {due.length} answered · dates are optional</span>
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs" style={btn()}>Cancel</button>}
        <button type="button" onClick={save} disabled={isPending} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={btn(true)}>
          {isPending ? 'Saving…' : 'Save vaccination history'}
        </button>
      </div>
    </div>
  )
}
