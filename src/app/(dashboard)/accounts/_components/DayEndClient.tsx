'use client'

import { useState } from 'react'
import { Printer, Loader2, Wallet, FileText, Clock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { getDayEndSheet } from '@/app/actions/accounts'
import type { DayEndSheet } from '@/lib/types'
import RegisterTab from './RegisterTab'
import LedgersTab from './LedgersTab'
import { SOURCE_LABEL, METHOD_LABEL, money } from './labels'

/**
 * The sheet an owner hands his accountant at the end of the day.
 *
 * Three blocks, deliberately not added together: what came in, what was
 * raised, and what is still owed. They are different measures — a payment
 * belongs to a bill, not to a bill line, so money cannot be split by
 * department the way revenue can — and the surest way to lose an accountant's
 * trust is to show one number that quietly mixes them.
 *
 * The billed block reconciles line by line down to its own total, so the
 * column can be added up by hand and will come out right.
 */

function Row({ label, value, muted, strong, negative, border }: {
  label: string; value: number; muted?: boolean; strong?: boolean; negative?: boolean; border?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5"
         style={{ borderTop: border ? '1px solid #E2E8F0' : undefined }}>
      <span style={{ fontSize: '13px', color: muted ? '#94A3B8' : '#475569', fontWeight: strong ? 600 : 400 }}>
        {label}
      </span>
      <span className="tabular-nums" style={{
        fontSize: strong ? '15px' : '13px',
        fontWeight: strong ? 700 : 500,
        color: negative ? '#B45309' : '#0F172A',
      }}>
        {negative ? '(' : ''}{money(value)}{negative ? ')' : ''}
      </span>
    </div>
  )
}

export default function DayEndClient({ today, monthStart, initialSheet, hospitalName, canManage }: {
  today: string
  monthStart: string
  initialSheet: DayEndSheet
  hospitalName: string
  canManage: boolean
}) {
  const [tab, setTab]     = useState<'day' | 'register' | 'ledgers'>('day')
  const [date, setDate]   = useState(today)
  const [sheet, setSheet] = useState(initialSheet)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(d: string) {
    setDate(d); setBusy(true); setError(null)
    try { setSheet(await getDayEndSheet(d)) }
    catch (e) { setError((e as Error).message || 'Could not load that day') }
    finally { setBusy(false) }
  }

  const adjusted = sheet.billed.discount !== 0 || sheet.billed.tax !== 0 || sheet.billed.roundOff !== 0

  const methods = Object.entries(sheet.collected.byMethod)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={
          tab === 'day' ? 'Day-end sheet — what came in, what was raised, what is owed'
          : tab === 'register' ? 'Register — every bill and every receipt, over any range'
          : 'Ledger names — what your accountant calls each of these in their books'
        }
        actions={
          <div className="flex items-center gap-2 no-print">
            {tab === 'day' && (
              <Input type="date" value={date} max={today}
                     onChange={(e) => load(e.target.value)} />
            )}
            {tab !== 'ledgers' && <button onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#0D9488', border: 'none', minHeight: '44px', cursor: 'pointer' }}>
              <Printer className="w-4 h-4" /> Print
            </button>}
          </div>
        }
      />

      <div className="flex gap-1 mb-4 no-print p-1 rounded-xl w-fit" style={{ background: '#F1F5F9' }}>
        {([['day', 'Day end'], ['register', 'Register'], ['ledgers', 'Ledger names']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: tab === k ? '#fff' : 'transparent',
              color: tab === k ? '#0F172A' : '#64748B',
              border: 'none', cursor: 'pointer',
              boxShadow: tab === k ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'register' && <RegisterTab today={today} monthStart={monthStart} />}
      {tab === 'ledgers' && <LedgersTab canManage={canManage} />}

      {tab === 'day' && error && (
        <div className="no-print mb-4 px-4 py-3 rounded-xl text-sm"
             style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      <style>{`@media print {
        body * { visibility: hidden; }
        #dayend, #dayend * { visibility: visible; }
        #dayend { position: absolute; top: 0; left: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      <div id="dayend" style={{ display: tab === 'day' ? undefined : 'none' }}>
        {/* Only shows on paper — the screen already has the page header. */}
        <div className="hidden print:block mb-4">
          <h1 style={{ fontSize: '18px', fontWeight: 700 }}>{hospitalName}</h1>
          <p style={{ fontSize: '13px', color: '#475569' }}>Day-end sheet · {date}</p>
        </div>

        {busy ? (
          <GlassCard className="p-10 flex items-center justify-center" style={{ color: '#94A3B8' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </GlassCard>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">

            {/* ── What came in ── */}
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4" style={{ color: '#0D9488' }} />
                <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', letterSpacing: '0.02em' }}>
                  COLLECTED
                </h2>
              </div>
              <p className="tabular-nums mb-3" style={{ fontSize: '26px', fontWeight: 700, color: '#0D9488' }}>
                {money(sheet.collected.total)}
              </p>
              {methods.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#94A3B8' }}>Nothing was collected on this day.</p>
              ) : (
                <>
                  {methods.map(([m, v]) => (
                    <Row key={m} label={METHOD_LABEL[m] ?? m} value={v} />
                  ))}
                  {sheet.collected.refunds > 0 && (
                    <Row label="Less refunds paid out" value={sheet.collected.refunds} negative border />
                  )}
                  {/* Only worth a line when it differs from the headline — a
                      "Net cash in" repeating the number directly above it is
                      furniture, not information. */}
                  {(sheet.collected.refunds > 0 || methods.length > 1) && (
                    <Row label="Net cash in" value={sheet.collected.total} strong border />
                  )}
                </>
              )}
              <p className="mt-2" style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.5 }}>
                Money that actually arrived, whichever bill it was for. Advances
                collected are included; applying an advance to a bill later is
                not counted again.
              </p>
            </GlassCard>

            {/* ── What was raised ── */}
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4" style={{ color: '#2563EB' }} />
                <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', letterSpacing: '0.02em' }}>
                  BILLED
                </h2>
              </div>
              <p className="tabular-nums mb-3" style={{ fontSize: '26px', fontWeight: 700, color: '#2563EB' }}>
                {money(sheet.billed.total)}
              </p>
              {sheet.billed.sources.length === 0
                ? <p style={{ fontSize: '13px', color: '#94A3B8' }}>No bills were raised on this day.</p>
                : sheet.billed.sources.map((s) => (
                    <Row key={s.source} label={SOURCE_LABEL[s.source] ?? s.source} value={s.amount} />
                  ))}
              {sheet.billed.sources.length > 0 && (
                <>
                  {/* The subtotal only earns its line when something comes off
                      or goes on afterwards. Otherwise it is the total twice. */}
                  {adjusted && <Row label="Subtotal" value={sheet.billed.subtotal} border />}
                  {sheet.billed.discount !== 0 && <Row label="Less discount" value={sheet.billed.discount} negative />}
                  {sheet.billed.tax !== 0 && <Row label="Add GST" value={sheet.billed.tax} />}
                  {sheet.billed.roundOff !== 0 && <Row label="Round off" value={sheet.billed.roundOff} />}
                  <Row label={`Billed on ${sheet.billed.bills} bill${sheet.billed.bills === 1 ? '' : 's'}`}
                       value={sheet.billed.total} strong border />
                </>
              )}
              <p className="mt-2" style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.5 }}>
                The value of bills raised on this day. This is not the same as
                what was collected and is not meant to match it.
              </p>
            </GlassCard>

            {/* ── What is still owed ── */}
            <GlassCard className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4" style={{ color: '#B45309' }} />
                <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', letterSpacing: '0.02em' }}>
                  YET TO COLLECT
                </h2>
              </div>
              <p className="tabular-nums mb-3" style={{ fontSize: '26px', fontWeight: 700, color: '#B45309' }}>
                {money(sheet.outstanding.total)}
              </p>
              <Row label="From bills raised on this day" value={sheet.outstanding.today} />
              <Row label="From earlier days" value={sheet.outstanding.earlier} />
              <Row label={`Across ${sheet.outstanding.bills} unpaid bill${sheet.outstanding.bills === 1 ? '' : 's'}`}
                   value={sheet.outstanding.total} strong border />
              <p className="mt-2" style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.5 }}>
                Everything billed and not yet paid, as it stands now — not only
                for this day. Money owed from earlier is a debt to chase; money
                owed from today may still be at the counter.
              </p>
            </GlassCard>

            {/* ── What came in, by department ── */}
            <GlassCard className="p-5 lg:col-span-3">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4" style={{ color: '#0D9488' }} />
                <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', letterSpacing: '0.02em' }}>
                  COLLECTED, BY DEPARTMENT
                </h2>
              </div>
              {sheet.collected.total === 0 && sheet.collected.bySource.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#94A3B8' }}>Nothing was collected on this day.</p>
              ) : (
                <div className="max-w-xl">
                  {sheet.collected.bySource.map((s) => (
                    <Row key={s.source} label={SOURCE_LABEL[s.source] ?? s.source} value={s.amount} />
                  ))}
                  {sheet.collected.advances > 0 && (
                    <Row label="Advance deposits — no department until applied" value={sheet.collected.advances} />
                  )}
                  {sheet.collected.unattributed > 0 && (
                    <Row label="On a bill with no lines — cannot be placed" value={sheet.collected.unattributed} />
                  )}
                  {sheet.collected.refunds > 0 && (
                    <Row label="Less refunds paid out" value={sheet.collected.refunds} negative />
                  )}
                  <Row label="Net cash in — the same as Collected" value={sheet.collected.total} strong border />
                </div>
              )}
              <p className="mt-2" style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.5 }}>
                What each department brought in today. A payment belongs to a bill, so a bill with
                several departments has its payment shared between them in proportion to the bill.
                It adds up to the Collected figure above.
              </p>
            </GlassCard>

            {/* ── UPI and bank money, by the account it went into ── */}
            {sheet.collected.byAccount.length > 0 && (
              <GlassCard className="p-5 lg:col-span-3">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-4 h-4" style={{ color: '#0D9488' }} />
                  <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', letterSpacing: '0.02em' }}>
                    UPI &amp; BANK, BY ACCOUNT
                  </h2>
                </div>
                <div className="max-w-xl">
                  {sheet.collected.byAccount.map((a) => (
                    <Row key={a.key}
                      label={`${a.name} — ${a.payments} payment${a.payments === 1 ? '' : 's'}${a.advances > 0 ? `, incl. ₹${a.advances.toLocaleString('en-IN', { minimumFractionDigits: 2 })} advance` : ''}`}
                      value={a.amount} />
                  ))}
                  <Row label="Total by UPI and bank transfer"
                    value={Math.round(sheet.collected.byAccount.reduce((t, a) => t + a.amount, 0) * 100) / 100} strong border />
                </div>
                <p className="mt-2" style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.5 }}>
                  Bill payments and advance deposits by UPI or bank transfer, by the account the patient paid
                  into — check each line against that account&rsquo;s bank statement. Cash and card go to no
                  particular account and are not listed.
                </p>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
