'use client'

import { useState } from 'react'
import { Loader2, Search, FileText, Receipt, Download, FileCode2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import EmptyState from '@/components/ui/EmptyState'
import { getSalesRegister, exportRegisterCsv, exportTallyXml } from '@/app/actions/accounts'
import { getMovementsInRange } from '@/app/actions/cashRegister'
import type { SalesRegister, CashMovement, CashSummary } from '@/lib/types'
import { SOURCE_LABEL, METHOD_LABEL, money } from './labels'

/**
 * The register, on screen before it is ever a file.
 *
 * Two tabs because an accountant keeps two books: what was sold, and what was
 * received. They are the same two things an accounting package wants as Sales
 * and Receipt vouchers, so the export in the next phase renders these rows
 * rather than going back to the database with a different question.
 *
 * Receipts are not computed here at all — they come from the Cash Book's own
 * function, so the two screens cannot drift apart about what "received" means.
 */

type Book = 'sales' | 'receipts'

export default function RegisterTab({ today, monthStart }: { today: string; monthStart: string }) {
  const [book, setBook]   = useState<Book>('sales')
  const [from, setFrom]   = useState(monthStart)
  const [to, setTo]       = useState(today)
  const [source, setSource]     = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [status, setStatus]     = useState<'all' | 'unpaid' | 'paid'>('all')
  const [sales, setSales] = useState<SalesRegister | null>(null)
  const [cash, setCash]   = useState<{ movements: CashMovement[]; summary: CashSummary } | null>(null)
  const [busy, setBusy]   = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [tallyBusy, setTallyBusy] = useState(false)
  const [tallyMode, setTallyMode] = useState<'per_bill' | 'consolidated'>('per_bill')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * What is downloaded is what is on screen — same action, same filters.
   *
   * The export the Admin dashboard used to carry was a separate query nobody
   * could see the output of, and it downloaded an empty file for months
   * without anyone noticing. One path means a broken file is a visibly broken
   * table.
   */
  async function download() {
    setDownloading(true); setError(null)
    try {
      const { filename, csv } = await exportRegisterCsv({
        book, from, to,
        source: source || null, doctorId: doctorId || null, status,
      })
      // The byte-order mark, as bytes rather than as a character in the
      // string. Without it Excel on Windows reads the file in the system
      // codepage and every ₹ and every Tamil name becomes mojibake — on the
      // one machine the accountant actually uses. It is written here because
      // a leading U+FEFF put on the string server-side never arrives: it is
      // stripped in transit, which was found by logging the first code point.
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF])
      const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message || 'Could not build that file')
    } finally { setDownloading(false) }
  }

  async function run(b: Book = book) {
    setBusy(true); setError(null)
    try {
      if (b === 'sales') setSales(await getSalesRegister({ from, to, source: source || null, doctorId: doctorId || null, status }))
      else setCash(await getMovementsInRange({ from, to }))
    } catch (e) {
      setError((e as Error).message || 'Could not build that register')
    } finally { setBusy(false) }
  }

  /**
   * The same rows again, as Tally vouchers.
   *
   * It covers both books at once whichever tab is open, because an accounting
   * import is not useful one half at a time: Sales without Receipts leaves
   * every bill outstanding in the accountant's books.
   */
  async function downloadTally() {
    setTallyBusy(true); setError(null); setNotice(null)
    try {
      const { filename, xml, sales, receipts } = await exportTallyXml({
        from, to, mode: tallyMode,
        source: source || null, doctorId: doctorId || null,
      })
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      setNotice(`${sales} sales voucher${sales === 1 ? '' : 's'} and ${receipts} receipt`
        + `${receipts === 1 ? '' : 's'}. In Tally: Alt+O → Transactions → pick this file. `
        + 'Anything it refuses appears in its Exceptions report.')
    } catch (e) {
      setError((e as Error).message || 'Could not build the Tally file')
    } finally { setTallyBusy(false) }
  }

  function switchTo(b: Book) {
    setBook(b)
    if ((b === 'sales' && !sales) || (b === 'receipts' && !cash)) void run(b)
  }

  return (
    <div>
      {/* ── One row of controls, above the table ── */}
      <GlassCard className="p-4 mb-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
            {(['sales', 'receipts'] as const).map((b) => (
              <button key={b} onClick={() => switchTo(b)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: book === b ? '#fff' : 'transparent',
                  color: book === b ? '#0F172A' : '#64748B',
                  border: 'none', cursor: 'pointer',
                  boxShadow: book === b ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                }}>
                {b === 'sales' ? 'Sales' : 'Receipts'}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span style={{ fontSize: '11px', color: '#64748B' }}>From</span>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: '11px', color: '#64748B' }}>To</span>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
          </label>

          {book === 'sales' && (
            <>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: '11px', color: '#64748B' }}>Department</span>
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">All departments</option>
                  {(sales?.sources ?? []).map((s) => (
                    <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: '11px', color: '#64748B' }}>Doctor</span>
                <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">All doctors</option>
                  {(sales?.doctors ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: '11px', color: '#64748B' }}>Status</span>
                <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'unpaid' | 'paid')}>
                  <option value="all">All bills</option>
                  <option value="unpaid">Still owed</option>
                  <option value="paid">Settled</option>
                </Select>
              </label>
            </>
          )}

          <button onClick={() => run()} disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#0D9488', border: 'none', minHeight: '42px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Show
          </button>

          <button onClick={download} disabled={downloading || (book === 'sales' ? !sales : !cash)}
            title={(book === 'sales' ? !sales : !cash) ? 'Show the register first' : 'Download what is on screen'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0',
              minHeight: '42px',
              cursor: downloading || (book === 'sales' ? !sales : !cash) ? 'not-allowed' : 'pointer',
              opacity: downloading || (book === 'sales' ? !sales : !cash) ? 0.5 : 1,
            }}>
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            CSV
          </button>

          <button onClick={downloadTally} disabled={tallyBusy}
            title="Sales and receipts as Tally vouchers"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0',
              minHeight: '42px', cursor: tallyBusy ? 'not-allowed' : 'pointer', opacity: tallyBusy ? 0.5 : 1,
            }}>
            {tallyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
            Tally XML
          </button>

          <label className="flex flex-col gap-1">
            <span style={{ fontSize: '11px', color: '#64748B' }}>Tally vouchers</span>
            <Select value={tallyMode} onChange={(e) => setTallyMode(e.target.value as 'per_bill' | 'consolidated')}>
              <option value="per_bill">One per bill — keeps outstanding</option>
              <option value="consolidated">One a day — fewer rows</option>
            </Select>
          </label>
        </div>
      </GlassCard>

      {error && (
        <div className="no-print mb-4 px-4 py-3 rounded-xl text-sm"
             style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {notice && (
        <div className="no-print mb-4 px-4 py-3 rounded-xl text-sm"
             style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}>
          {notice}
        </div>
      )}

      {book === 'sales' ? <SalesTable reg={sales} busy={busy} /> : <ReceiptsTable data={cash} busy={busy} />}
    </div>
  )
}

const TH: React.CSSProperties = {
  textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#64748B',
  padding: '8px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { fontSize: '13px', padding: '9px 12px', borderBottom: '1px solid #F1F5F9' }
const NUM: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function SalesTable({ reg, busy }: { reg: SalesRegister | null; busy: boolean }) {
  if (busy && !reg) return <Waiting />
  if (!reg) return <GlassCard className="p-8"><EmptyState icon={<FileText className="w-6 h-6" style={{ color: '#94A3B8' }} />} title="Choose a range" description="Pick the dates and press Show." /></GlassCard>
  if (!reg.rows.length) return <GlassCard className="p-8"><EmptyState icon={<FileText className="w-6 h-6" style={{ color: '#94A3B8' }} />} title="No bills in this range" description="Nothing was raised between these dates, or the filters exclude it all." /></GlassCard>

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1"
           style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <Stat label="Bills" text={String(reg.matched)} />
        <Stat label="Billed" text={money(reg.totals.total)} />
        <Stat label="Received against them" text={money(reg.totals.paid)} />
        <Stat label="Still owed" text={money(reg.totals.balance)} warn={reg.totals.balance > 0} />
        {reg.totals.discount > 0 && <Stat label="Discount given" text={money(reg.totals.discount)} />}
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Date</th>
              <th style={TH}>Bill no</th>
              <th style={TH}>Patient</th>
              <th style={TH}>Doctor</th>
              <th style={TH}>Departments</th>
              <th style={{ ...TH, textAlign: 'right' }}>Billed</th>
              <th style={{ ...TH, textAlign: 'right' }}>Received</th>
              <th style={{ ...TH, textAlign: 'right' }}>Owed</th>
            </tr>
          </thead>
          <tbody>
            {reg.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...TD, whiteSpace: 'nowrap', color: '#64748B' }}>{r.date}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>{r.billNo}</td>
                <td style={TD}>
                  {r.patientName}
                  {r.uhid && <span style={{ color: '#94A3B8', fontSize: '11px' }}> · {r.uhid}</span>}
                </td>
                <td style={{ ...TD, color: '#475569' }}>{r.doctorName}</td>
                <td style={{ ...TD, color: '#475569' }}>
                  {r.sources.map((s) => SOURCE_LABEL[s.source] ?? s.source).join(', ') || '—'}
                </td>
                <td style={NUM}>{money(r.total)}</td>
                <td style={NUM}>{money(r.paid)}</td>
                <td style={{ ...NUM, color: r.balance > 0 ? '#B45309' : '#94A3B8', fontWeight: r.balance > 0 ? 600 : 400 }}>
                  {money(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reg.truncated && (
        <p className="px-4 py-3" style={{ fontSize: '12px', color: '#B45309', background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}>
          Showing the most recent {reg.rows.length} of {reg.matched} bills. Narrow the dates to see the rest —
          the totals above cover all {reg.matched}.
        </p>
      )}
    </GlassCard>
  )
}

function ReceiptsTable({ data, busy }: { data: { movements: CashMovement[]; summary: CashSummary } | null; busy: boolean }) {
  if (busy && !data) return <Waiting />
  if (!data) return <GlassCard className="p-8"><EmptyState icon={<Receipt className="w-6 h-6" style={{ color: '#94A3B8' }} />} title="Choose a range" description="Pick the dates and press Show." /></GlassCard>
  if (!data.movements.length) return <GlassCard className="p-8"><EmptyState icon={<Receipt className="w-6 h-6" style={{ color: '#94A3B8' }} />} title="Nothing received in this range" description="No payments, advances or refunds between these dates." /></GlassCard>

  const s = data.summary
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1"
           style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <Stat label="Receipts" text={String(s.count)} />
        {s.cash > 0 && <Stat label="Cash" text={money(s.cash)} />}
        {s.upi > 0 && <Stat label="UPI" text={money(s.upi)} />}
        {s.card > 0 && <Stat label="Card" text={money(s.card)} />}
        {s.bank > 0 && <Stat label="Bank" text={money(s.bank)} />}
        {s.insurance > 0 && <Stat label="Insurance" text={money(s.insurance)} />}
        {s.refunds > 0 && <Stat label="Paid out" text={money(s.refunds)} warn />}
        <Stat label="Net received" text={money(s.net)} />
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Date</th>
              <th style={TH}>Reference</th>
              <th style={TH}>Patient</th>
              <th style={TH}>Kind</th>
              <th style={TH}>Method</th>
              <th style={TH}>Received by</th>
              <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.movements.map((m) => (
              <tr key={m.id}>
                <td style={{ ...TD, whiteSpace: 'nowrap', color: '#64748B' }}>
                  {new Date(m.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>{m.reference}</td>
                <td style={TD}>{m.patientName}</td>
                <td style={{ ...TD, color: '#475569' }}>
                  {m.kind === 'payment' ? 'Bill payment' : m.kind === 'advance' ? 'Advance' : 'Refund'}
                </td>
                <td style={{ ...TD, color: '#475569' }}>{METHOD_LABEL[m.method] ?? m.method}</td>
                <td style={{ ...TD, color: '#475569' }}>{m.cashierName}</td>
                <td style={{ ...NUM, color: m.amount < 0 ? '#B45309' : '#0F172A', fontWeight: 600 }}>
                  {m.amount < 0 ? `(${money(m.amount)})` : money(m.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

function Stat({ label, text, warn }: { label: string; text: string; warn?: boolean }) {
  return (
    <div>
      <span style={{ fontSize: '11px', color: '#94A3B8' }}>{label} </span>
      <span className="tabular-nums" style={{ fontSize: '14px', fontWeight: 700, color: warn ? '#B45309' : '#0F172A' }}>
        {text}
      </span>
    </div>
  )
}

function Waiting() {
  return (
    <GlassCard className="p-10 flex items-center justify-center" style={{ color: '#94A3B8' }}>
      <Loader2 className="w-5 h-5 animate-spin" />
    </GlassCard>
  )
}
