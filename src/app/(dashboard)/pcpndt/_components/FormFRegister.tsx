'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, FileText, CheckCircle2, Clock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import DateText from '@/components/ui/DateText'
import { listFormF, countIncompleteForMonth, type FormFListRow } from '@/app/actions/pcpndt'

/**
 * A month of the register, because a month is how it is filed.
 *
 * The number at the top is the one that matters: how many forms are not yet
 * fit to send. A draft still sitting here on the 6th is a record the
 * Appropriate Authority never received, and that is the thing a hospital gets
 * prosecuted over — not a badly worded result.
 */
export default function FormFRegister({
  initialRows, initialMonth, initialIncomplete, canReport,
}: {
  initialRows: FormFListRow[]
  initialMonth: string
  initialIncomplete: number
  canReport: boolean
}) {
  const [month, setMonth] = useState(initialMonth)
  const [rows, setRows] = useState(initialRows)
  const [incomplete, setIncomplete] = useState(initialIncomplete)
  const [isPending, startTransition] = useTransition()

  function changeMonth(next: string) {
    setMonth(next)
    startTransition(async () => {
      const [r, n] = await Promise.all([listFormF({ month: next }), countIncompleteForMonth(next)])
      setRows(r)
      setIncomplete(n)
    })
  }

  // The 5th is the statutory deadline. Counting down to it is more useful than
  // reporting afterwards that it passed.
  const today = new Date()
  const isThisMonth = month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const daysToFifth = isThisMonth ? null : 5 - today.getDate()

  const complete = rows.filter((r) => r.status === 'complete').length
  const amended = rows.filter((r) => r.status === 'amended').length

  return (
    <div>
      {/* What is not yet fit to file. */}
      {incomplete > 0 && (
        <GlassCard className="p-4 mb-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
                {incomplete} form{incomplete === 1 ? '' : 's'} not finished
              </p>
              <p className="text-xs mt-1" style={{ color: '#B45309' }}>
                An unfinished Form F cannot be filed, and a blank column is the offence itself —
                not a clerical error. Finish {incomplete === 1 ? 'it' : 'them'} before the 5th.
                {daysToFifth !== null && daysToFifth > 0 && ` ${daysToFifth} day${daysToFifth === 1 ? '' : 's'} left.`}
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="month" value={month}
          onChange={(e) => changeMonth(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A' }}
        />
        <Stat icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="ready to file" value={complete} tone="#047857" />
        <Stat icon={<Clock className="w-3.5 h-3.5" />} label="unfinished" value={incomplete} tone={incomplete ? '#B45309' : '#94A3B8'} />
        {amended > 0 && (
          <Stat icon={<FileText className="w-3.5 h-3.5" />} label="amended" value={amended} tone="#64748B" />
        )}
        {canReport && (
          <span className="ml-auto text-xs" style={{ color: '#94A3B8' }}>
            Monthly returns are generated from this register.
          </span>
        )}
      </div>

      {isPending ? (
        <GlassCard className="p-8 text-center"><p className="text-sm" style={{ color: '#94A3B8' }}>Loading…</p></GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<FileText className="w-6 h-6" style={{ color: '#94A3B8' }} />}
            title="No Form F this month"
            description="A Form F is started from the patient's record when an ultrasound is performed on a pregnant woman."
          />
        </GlassCard>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <GlassCard key={r.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-mono font-semibold" style={{ color: '#0F766E', minWidth: '7.5rem' }}>
                  {r.serial_no}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>
                    {r.patient_name ?? '—'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {r.procedure_date ? <>Scanned <DateText date={r.procedure_date} /></> : 'No procedure date yet'}
                    {r.performed_by_name ? ` · ${r.performed_by_name}` : ''}
                    {r.amends_id ? ' · amends an earlier form' : ''}
                  </p>
                </div>
                {/* An MTP indication on a Form F is the single most scrutinised
                    fact in the register, so it is shown rather than buried —
                    but the Act expects "NA" written where there is none, and a
                    truthy check on that string flags every compliant form as
                    though a termination had been indicated. */}
                {hasMtpIndication(r.mtp_indication) && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{ background: '#FEF3C7', color: '#B45309' }}>
                    MTP indicated
                  </span>
                )}
                <StatusPill status={r.status} />
                <Link href={`/pcpndt/${r.id}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                  {r.status === 'draft' ? 'Finish' : 'View'}
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * Whether field 16 actually records an indication for MTP.
 *
 * The Act wants every column answered, so a form with nothing to report says
 * "NA" rather than being left blank — which means the presence of text is not
 * the question. Getting this wrong points an inspector at the wrong forms and
 * tells the hospital it has terminations it does not have.
 */
function hasMtpIndication(value: string | null): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase().replace(/[.\s/]/g, '')
  return !['na', 'nil', 'no', 'none', 'notapplicable', '-', '—'].includes(v)
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone: string
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: tone }}>
      {icon}{value} {label}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft:    { bg: '#FEF3C7', fg: '#B45309', label: 'Unfinished' },
    complete: { bg: '#ECFDF5', fg: '#047857', label: 'Complete' },
    amended:  { bg: '#F1F5F9', fg: '#64748B', label: 'Superseded' },
  }
  const s = map[status] ?? map.draft
  return (
    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  )
}
