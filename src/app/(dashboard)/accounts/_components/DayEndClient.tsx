'use client'

import { useState } from 'react'
import { Printer, Loader2, Wallet, FileText, Clock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { getDayEndSheet } from '@/app/actions/accounts'
import type { DayEndSheet } from '@/lib/types'

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

const SOURCE_LABEL: Record<string, string> = {
  consultation: 'Consultation',
  lab:          'Laboratory',
  radiology:    'Radiology',
  pharmacy:     'Pharmacy (OP)',
  ipd_pharmacy: 'Pharmacy (IP)',
  bed:          'Room & bed',
  nursing:      'Nursing',
  icu:          'Intensive care',
  ot:           'Operation theatre',
  blood:        'Blood bank',
  dental:       'Dental',
  manual:       'Other charges',
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  bank_transfer: 'Bank transfer', insurance: 'Insurance', cheque: 'Cheque',
}

function money(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

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

export default function DayEndClient({ today, initialSheet, hospitalName }: {
  today: string
  initialSheet: DayEndSheet
  hospitalName: string
}) {
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
        subtitle="Day-end sheet — what came in, what was raised, what is owed"
        actions={
          <div className="flex items-center gap-2 no-print">
            <Input type="date" value={date} max={today}
                   onChange={(e) => load(e.target.value)} />
            <button onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#0D9488', border: 'none', minHeight: '44px', cursor: 'pointer' }}>
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        }
      />

      {error && (
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

      <div id="dayend">
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
          </div>
        )}
      </div>
    </div>
  )
}
