'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, CalendarClock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import {
  getMonthlyReturn, getMtpDrugStatus, listAncReferrals,
  type MonthlyReturn, type MtpDrugStatusRow,
} from '@/app/actions/pcpndt'

/**
 * The monthly pack, assembled.
 *
 * Two jobs, in this order. First: say plainly whether this month can be filed
 * at all, because a hospital discovering an unfinished Form F on the 6th has
 * already missed the deadline. Second: show the figures that will go on the
 * paper.
 *
 * Nothing here is editable. Every number comes from a register, which is the
 * only reason any of it means anything — a figure that can be adjusted on the
 * way to the form is a figure that will be.
 */

const SCAN_LABELS: Record<string, string> = {
  male_abdomen: 'Male — abdomen',
  male_cardiac: 'Male — cardiac',
  female_general_abdomen: 'Female — general abdomen',
  female_antenatal: 'Female — antenatal',
  female_preconception: 'Female — pre-conception / follicular',
  female_transvaginal: 'Female — trans-vaginal',
  female_other: 'Female — other ultrasound',
  unmapped: 'Not yet placed in a column',
}

export default function MonthlyReturns({
  initialMonth, initialSummary, initialDrugs, initialReferrals,
}: {
  initialMonth: string
  initialSummary: MonthlyReturn | null
  initialDrugs: MtpDrugStatusRow[]
  initialReferrals: number
}) {
  const [month, setMonth] = useState(initialMonth)
  const [summary, setSummary] = useState(initialSummary)
  const [drugs, setDrugs] = useState(initialDrugs)
  const [referrals, setReferrals] = useState(initialReferrals)
  const [isPending, startTransition] = useTransition()

  function changeMonth(next: string) {
    setMonth(next)
    startTransition(async () => {
      const [s, d, r] = await Promise.all([
        getMonthlyReturn(next), getMtpDrugStatus(next), listAncReferrals(next),
      ])
      setSummary(s); setDrugs(d); setReferrals(r.length)
    })
  }

  if (!summary) {
    return <GlassCard className="p-8 text-center">
      <p className="text-sm" style={{ color: '#94A3B8' }}>Could not read the register for this month.</p>
    </GlassCard>
  }

  const { report_i: r1, report_iii: r3, readiness: rd } = summary

  // Everything that would make the pack wrong if filed today.
  const blockers: string[] = []
  if (rd.form_f_drafts > 0) blockers.push(`${rd.form_f_drafts} Form F not finished`)
  if (rd.mtp_drafts > 0) blockers.push(`${rd.mtp_drafts} MTP record not finished`)
  if (rd.scans_unmapped_studies > 0) {
    blockers.push(`${rd.scans_unmapped_studies} scan${rd.scans_unmapped_studies === 1 ? '' : 's'} not placed in a column — they will be missing from the count`)
  }
  if (rd.tracked_drugs === 0) blockers.push('no drugs set up for the stock return')

  const today = new Date()
  const daysToFifth = 5 - today.getDate()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => changeMonth(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A' }} />
        {daysToFifth > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#B45309' }}>
            <CalendarClock className="w-3.5 h-3.5" />
            {daysToFifth} day{daysToFifth === 1 ? '' : 's'} until the 5th
          </span>
        )}
        <Link href="/pcpndt/setup" className="ml-auto text-xs font-semibold" style={{ color: '#0D9488' }}>
          Setup →
        </Link>
      </div>

      {/* Can this be filed? */}
      <GlassCard className="p-4"
        style={blockers.length
          ? { background: '#FFFBEB', border: '1px solid #FDE68A' }
          : { background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
        <div className="flex items-start gap-3">
          {blockers.length
            ? <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
            : <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#047857' }} />}
          <div>
            <p className="text-sm font-semibold" style={{ color: blockers.length ? '#92400E' : '#065F46' }}>
              {blockers.length ? 'Not ready to file' : 'Ready to file'}
            </p>
            {blockers.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {blockers.map((b) => (
                  <li key={b} className="text-xs" style={{ color: '#B45309' }}>· {b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs mt-1" style={{ color: '#047857' }}>
                Every register for {month} is complete. Nothing is waiting on anybody.
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {isPending && (
        <GlassCard className="p-4 text-center"><p className="text-xs" style={{ color: '#94A3B8' }}>Recounting…</p></GlassCard>
      )}

      {/* Report I */}
      <Report title="Report I — scans performed"
        note="Every ultrasound, not only the ones with a Form F behind them.">
        <Row label="Form F obtained" value={r1.forms_f_obtained} strong />
        {Object.entries(r1.scans).map(([k, v]) => (
          <Row key={k} label={SCAN_LABELS[k] ?? k} value={v}
            warn={k === 'unmapped'} />
        ))}
        <Row label="MTP advised" value={r1.mtp_advised} strong />
        {Object.keys(r1.invasive_procedures).length > 0 && (
          <>
            {Object.entries(r1.invasive_procedures).map(([k, v]) => (
              <Row key={k} label={`Invasive — ${k}`} value={v} />
            ))}
          </>
        )}
      </Report>

      {/* Report III — the one the authority reads hardest */}
      <Report title="Report III — births and living children"
        note="The classification of mothers by the daughters they already have is the figure this Act exists to watch.">
        <Row label="Live births — male" value={r3.live_male} />
        <Row label="Live births — female" value={r3.live_female} />
        <Row label="Live births — total" value={r3.live_total} strong />
        <Row label="Intra-uterine deaths" value={r3.intra_uterine_deaths} />
        <div className="h-px my-1" style={{ background: '#E2E8F0' }} />
        <Row label="Mothers — primi (no living children)" value={r3.mothers_primi} />
        <Row label="Mothers — with one female child" value={r3.mothers_one_daughter} />
        <Row label="Mothers — with two or more female children" value={r3.mothers_two_plus_daughters} />
        <Row label="Mothers — others" value={r3.mothers_other} />
        <Row label="Mothers — total" value={r3.mothers_total} strong />
        <div className="h-px my-1" style={{ background: '#E2E8F0' }} />
        <Row label="Abortions / MTP" value={r3.abortions_mtp} strong />
      </Report>

      {/* Report V */}
      <Report title="Report V — drug stock"
        note="Counted from the pharmacy. Purchases from invoices received, usage from counter sales and ward issues together.">
        {drugs.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            No drugs on the return. <Link href="/pcpndt/setup" style={{ color: '#0D9488' }}>Set them up →</Link>
          </p>
        ) : drugs.map((d) => (
          <Row key={d.tracked_id} label={d.report_label}
            value={`${d.opening_qty} + ${d.purchased_qty} − ${d.used_qty} = ${d.closing_qty}`} />
        ))}
      </Report>

      <Report title="Registers this month" note="The detail behind the counts above.">
        <LinkRow label="Report II — Form F register" href="/pcpndt" value={r1.forms_f_obtained} />
        <LinkRow label="Report IV — MTP register" href="/pcpndt/mtp" value={r3.abortions_mtp} />
        <LinkRow label="Referrals of antenatal patients" href="/pcpndt/returns" value={referrals} />
      </Report>

      <GlassCard className="p-5">
        <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Print on the district&rsquo;s forms</p>
        <p className="text-xs mt-1 mb-3" style={{ color: '#94A3B8' }}>
          Plain sheets, laid out as the Appropriate Authority&rsquo;s paper, with the signature and
          seal blocks where they belong. Print, sign, seal and e-mail as usual.
        </p>
        <div className="flex flex-wrap gap-2">
          <PrintLink report="iii" month={month} label="Report III — deliveries" />
          <PrintLink report="v"   month={month} label="Report V — MTP drugs" />
        </div>
        <p className="text-xs mt-3" style={{ color: '#94A3B8' }}>
          Reports I, II and IV print from their own registers and are not yet laid out —
          the figures above are what goes on those sheets meanwhile.
        </p>
      </GlassCard>
    </div>
  )
}


function PrintLink({ report, month, label }: { report: string; month: string; label: string }) {
  return (
    <a href={`/pcpndt/returns/print/${report}?month=${month}`} target="_blank" rel="noreferrer"
      className="px-3 py-2 rounded-lg text-xs font-semibold"
      style={{ background: '#0D9488', color: '#fff', textDecoration: 'none' }}>
      {label}
    </a>
  )
}

function Report({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{title}</p>
      {note && <p className="text-xs mt-1 mb-3" style={{ color: '#94A3B8' }}>{note}</p>}
      <div className="grid gap-0.5">{children}</div>
    </GlassCard>
  )
}

function Row({ label, value, strong, warn }: {
  label: string; value: number | string; strong?: boolean; warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg"
      style={{ background: warn ? '#FFFBEB' : 'transparent' }}>
      <span className="text-xs" style={{ color: warn ? '#B45309' : '#475569', fontWeight: strong ? 600 : 400 }}>
        {label}
      </span>
      <span className="text-sm font-mono" style={{ color: warn ? '#B45309' : '#0F172A', fontWeight: strong ? 700 : 500 }}>
        {value}
      </span>
    </div>
  )
}

function LinkRow({ label, href, value }: { label: string; href: string; value: number }) {
  return (
    <Link href={href} className="flex items-center justify-between py-1.5 px-2 rounded-lg"
      style={{ color: '#475569', textDecoration: 'none' }}>
      <span className="text-xs" style={{ color: '#0D9488', fontWeight: 600 }}>{label} →</span>
      <span className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>{value}</span>
    </Link>
  )
}
