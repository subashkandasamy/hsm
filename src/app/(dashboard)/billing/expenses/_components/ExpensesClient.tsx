'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Eye, FileText, Loader2, Paperclip, Plus, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Modal from '@/components/ui/Modal'
import Money from '@/components/ui/Money'
import Pager from '@/components/ui/Pager'
import EmptyState from '@/components/ui/EmptyState'
import Combobox from '@/components/ui/Combobox'
import Select from '@/components/ui/Select'
import {
  addExpense, cancelExpense, getExpenseBillUploadUrl, getExpenseBillUrl, getExpenseReport, listExpenses,
} from '@/app/actions/expenses'
import { EXPENSE_METHODS, csvText, methodLabel, type Expense, type ExpenseReport, type ExpenseTotal } from '@/lib/expenses'
import { rememberedSize, rememberSize } from '@/lib/listUrl'
import { downloadCsv } from '@/lib/csv'
import type { Paged } from '@/lib/paging'

const LIST = 'expenses'
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 12, border: '1px solid #E2E8F0',
  background: 'rgba(255,255,255,0.9)', color: '#0F172A', fontSize: 14, outline: 'none', minHeight: 44,
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 6 }
const dmy = (ymd: string) => {
  const [y, m, d] = ymd.split('-')
  return `${d}-${m}-${y}`
}

interface Props {
  initial: Paged<Expense> & { categories: string[] }
  today: string
  canAdd: boolean
  canManage: boolean
}

export default function ExpensesClient({ initial, today, canAdd, canManage }: Props) {
  const [tab, setTab] = useState<'list' | 'reports'>('list')
  const [rows, setRows] = useState(initial.rows)
  const [total, setTotal] = useState(initial.total)
  const [page, setPage] = useState(initial.page)
  const [size, setSize] = useState(initial.size)
  const [categories, setCategories] = useState(initial.categories)
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<{ title: string; url: string; local: boolean } | null>(null)
  const [viewError, setViewError] = useState('')
  const ticket = useRef(0)

  async function load(next: { page?: number; size?: number }) {
    const mine = ++ticket.current
    setLoading(true)
    const res = await listExpenses({ page: next.page ?? page, size: next.size ?? size })
    if (mine !== ticket.current) return
    setRows(res.rows); setTotal(res.total); setPage(res.page); setSize(res.size); setCategories(res.categories)
    setLoading(false)
  }

  // Rows per page this person chose before (this browser).
  useEffect(() => {
    const remembered = rememberedSize(LIST)
    if (!remembered || remembered === initial.size) return
    const t = setTimeout(() => { void load({ size: remembered, page: 1 }) }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function viewBill(e: Expense) {
    setViewError('')
    const res = await getExpenseBillUrl(e.id)
    if (!res.success) { setViewError(res.error); return }
    setViewing({ title: `${e.category} · ${dmy(e.expense_date)}`, url: res.url, local: res.where === 'hospital' })
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex gap-2">
          {([['list', 'Expenses'], ['reports', 'Reports']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: tab === k ? '#0D9488' : 'rgba(255,255,255,0.8)', color: tab === k ? '#fff' : '#475569', border: `1px solid ${tab === k ? '#0D9488' : '#E2E8F0'}`, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {viewError && <p className="text-sm" style={{ color: '#DC2626' }}>{viewError}</p>}

      {tab === 'list' ? (
        <>
          {canAdd && (
            <AddExpenseForm today={today} categories={categories}
              onAdded={(e) => {
                if (page === 1) { setRows((prev) => [e, ...prev].slice(0, size)); setTotal((t) => t + 1) } else void load({ page: 1 })
                if (!categories.some((c) => c.toLowerCase() === e.category.toLowerCase())) setCategories((prev) => [...prev, e.category])
              }} />
          )}
          <ExpenseList rows={rows} canManage={canManage} onView={viewBill}
            onCancelled={(e) => setRows((prev) => prev.map((r) => (r.id === e.id ? e : r)))} />
          {total > 0 && (
            <Pager page={page} size={size} total={total} busy={loading}
              onPage={(p) => { void load({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              onSize={(n) => { rememberSize(LIST, n); void load({ size: n, page: 1 }) }} />
          )}
        </>
      ) : (
        <ReportsView today={today} onView={viewBill} />
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? 'Bill'} maxWidth="56rem">
        {viewing && (viewing.local ? (
          // On the hospital network only: a page here cannot embed it.
          <p className="text-sm" style={{ color: '#475569' }}>
            This bill is kept on the hospital computer.{' '}
            <a href={viewing.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488', fontWeight: 600 }}>Open it</a>
            {' '}(works on the hospital network).
          </p>
        ) : (
          <div className="space-y-2">
            <div style={{ height: '70vh', background: '#F8FAFC', borderRadius: 12, overflow: 'hidden' }}>
              {/\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(viewing.url)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={viewing.url} alt={viewing.title} className="w-full h-full object-contain" />
                : <iframe src={viewing.url} title={viewing.title} className="w-full h-full" style={{ border: 'none' }} />}
            </div>
            <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="text-sm" style={{ color: '#0D9488', fontWeight: 600 }}>Open in a new tab</a>
          </div>
        ))}
      </Modal>
    </div>
  )
}

// ── Add an expense ──────────────────────────────────────────────────────────

function AddExpenseForm({ today, categories, onAdded }: { today: string; categories: string[]; onAdded: (e: Expense) => void }) {
  const blank = { date: today, category: '', amount: '', paidTo: '', method: 'cash', reference: '', notes: '', noBill: false, noBillReason: '' }
  const [f, setF] = useState(blank)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof blank, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setMsg(null) }

  async function save() {
    setMsg(null)
    if (!f.category.trim()) return setMsg({ ok: false, text: 'Choose or type a category' })
    if (!(Number(f.amount) > 0)) return setMsg({ ok: false, text: 'Enter the amount paid' })
    if (!file && !f.noBill) return setMsg({ ok: false, text: 'Attach the bill (photo or PDF), or tick "No bill"' })
    if (f.noBill && !f.noBillReason.trim()) return setMsg({ ok: false, text: 'Say why there is no bill' })

    let billPath: string | null = null
    if (file && !f.noBill) {
      setSaving('Uploading the bill…')
      const link = await getExpenseBillUploadUrl(file.name, file.size)
      if (!link.success) { setSaving(''); return setMsg({ ok: false, text: link.error }) }
      const put = await fetch(link.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      if (!put.ok) { setSaving(''); return setMsg({ ok: false, text: 'The bill did not upload — try again' }) }
      billPath = link.filePath
    }
    setSaving('Saving…')
    const res = await addExpense({
      expenseDate: f.date, category: f.category, amount: Number(f.amount), paidTo: f.paidTo, method: f.method,
      reference: f.reference, notes: f.notes, billPath, noBillReason: f.noBill ? f.noBillReason : null,
    })
    setSaving('')
    if (!res.success) return setMsg({ ok: false, text: res.error })
    onAdded(res.expense)
    setF({ ...blank, date: f.date, method: f.method })
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setMsg({ ok: true, text: `Saved — ₹${res.expense.amount.toLocaleString('en-IN')} for ${res.expense.category}.` })
  }

  return (
    <GlassCard className="p-5">
      <p className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#0F172A' }}><Plus className="w-4 h-4" /> Add an expense</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="ex-date">Date</label>
          <input id="ex-date" type="date" max={today} value={f.date} onChange={(e) => set('date', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ex-category">Category</label>
          {/* The app's own list, not the browser's (which is unstyled, dark on a dark-mode computer, and drawn off to the side). */}
          <Combobox id="ex-category" value={f.category} onChange={(v) => set('category', v)} options={categories}
            placeholder="Choose or type, e.g. Electricity" maxLength={60} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ex-amount">Amount (₹)</label>
          <input id="ex-amount" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={f.amount}
            onChange={(e) => set('amount', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ex-method">Paid by</label>
          <Select id="ex-method" value={f.method} onChange={(e) => set('method', e.target.value)}>
            {EXPENSE_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </Select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="ex-paid-to">Paid to</label>
          <input id="ex-paid-to" placeholder="Shop, person or company" value={f.paidTo} onChange={(e) => set('paidTo', e.target.value)} style={inputStyle} maxLength={120} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ex-ref">Bill / payment ref.</label>
          <input id="ex-ref" placeholder="Bill no. or UPI ref." value={f.reference} onChange={(e) => set('reference', e.target.value)} style={inputStyle} maxLength={80} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle} htmlFor="ex-notes">Notes</label>
          <input id="ex-notes" placeholder="Optional" value={f.notes} onChange={(e) => set('notes', e.target.value)} style={inputStyle} maxLength={500} />
        </div>
      </div>

      {/* The bill, or why there is none — one of the two is required. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!f.noBill && (
          <>
            <input ref={fileRef} id="ex-bill" type="file" accept="image/*,application/pdf,.pdf,.heic"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null) }} style={{ display: 'none' }} />
            <label htmlFor="ex-bill" className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
              <Paperclip className="w-4 h-4" /> {file ? 'Change bill' : 'Attach bill (photo or PDF)'}
            </label>
            {file && (
              <span className="text-sm flex items-center gap-1.5" style={{ color: '#0F172A' }}>
                <FileText className="w-4 h-4" style={{ color: '#64748B' }} />{file.name}
                <button type="button" aria-label="Remove the bill" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}><X className="w-4 h-4" /></button>
              </span>
            )}
          </>
        )}
        <label className="flex items-center gap-2 text-sm" style={{ color: '#0F172A', cursor: 'pointer' }}>
          <input type="checkbox" checked={f.noBill} onChange={(e) => set('noBill', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#0D9488' }} />
          No bill
        </label>
        {f.noBill && (
          <input aria-label="Why there is no bill" placeholder="Why — e.g. tea for night staff, auto fare" value={f.noBillReason}
            onChange={(e) => set('noBillReason', e.target.value)} style={{ ...inputStyle, maxWidth: 360 }} maxLength={200} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={!!saving}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving || 'Save expense'}
        </button>
        {msg && <span className="text-sm" style={{ color: msg.ok ? '#059669' : '#DC2626' }}>{msg.text}</span>}
      </div>
    </GlassCard>
  )
}

// ── The list ────────────────────────────────────────────────────────────────

function ExpenseList({ rows, canManage, onView, onCancelled }: {
  rows: Expense[]; canManage: boolean; onView: (e: Expense) => void; onCancelled: (e: Expense) => void
}) {
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function confirmCancel(id: string) {
    setBusy(true); setErr('')
    const res = await cancelExpense(id, reason)
    setBusy(false)
    if (!res.success) { setErr(res.error); return }
    onCancelled(res.expense); setCancelling(null); setReason('')
  }

  if (!rows.length) {
    return <GlassCard className="p-6"><EmptyState title="No expenses yet" description="Expenses you add appear here, newest first." /></GlassCard>
  }
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#94A3B8', textAlign: 'left' }}>
              {['Date', 'Category', 'Paid to', 'Paid by', 'Amount', 'Bill', 'Added by', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, textAlign: h === 'Amount' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const off = !!e.cancelled_at
              const cell: React.CSSProperties = { padding: '10px 14px', color: off ? '#94A3B8' : '#0F172A', textDecoration: off ? 'line-through' : undefined, verticalAlign: 'top' }
              return (
                <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{dmy(e.expense_date)}</td>
                  <td style={cell}>
                    {e.category}
                    {e.notes && <span className="block text-xs" style={{ color: '#94A3B8', textDecoration: 'none' }}>{e.notes}</span>}
                  </td>
                  <td style={cell}>{e.paid_to || '—'}{e.reference && <span className="block text-xs" style={{ color: '#94A3B8' }}>Ref {e.reference}</span>}</td>
                  <td style={cell}>{methodLabel(e.method)}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}><Money amount={e.amount} /></td>
                  <td style={{ ...cell, textDecoration: 'none' }}>
                    {e.has_bill
                      ? <button type="button" onClick={() => onView(e)} className="flex items-center gap-1 text-xs font-semibold" style={{ border: 'none', background: 'transparent', color: '#0D9488', cursor: 'pointer', padding: 0 }}><Eye className="w-3.5 h-3.5" /> View</button>
                      : <span className="text-xs" style={{ color: '#B45309' }} title={e.no_bill_reason ?? ''}>No bill{e.no_bill_reason ? ` — ${e.no_bill_reason}` : ''}</span>}
                  </td>
                  <td style={{ ...cell, color: '#64748B' }}>{e.recorded_by}</td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {off ? (
                      <span className="text-xs" style={{ color: '#DC2626' }} title={`${e.cancel_reason ?? ''} — ${e.cancelled_by ?? ''}`}>Cancelled{e.cancel_reason ? `: ${e.cancel_reason}` : ''}</span>
                    ) : canManage && (cancelling === e.id ? (
                      <span className="flex items-center gap-2">
                        <input autoFocus aria-label="Why cancel" placeholder="Why cancel?" value={reason} onChange={(ev) => setReason(ev.target.value)}
                          style={{ ...inputStyle, minHeight: 32, padding: '5px 8px', width: 160, fontSize: 12 }} maxLength={200} />
                        <button type="button" disabled={busy || !reason.trim()} onClick={() => void confirmCancel(e.id)} className="text-xs font-semibold"
                          style={{ border: 'none', background: 'transparent', color: busy || !reason.trim() ? '#CBD5E1' : '#DC2626', cursor: 'pointer' }}>Cancel it</button>
                        <button type="button" onClick={() => { setCancelling(null); setReason(''); setErr('') }} className="text-xs"
                          style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}>Keep</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => { setCancelling(e.id); setReason(''); setErr('') }} className="text-xs"
                        style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}>Cancel</button>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {err && <p className="text-sm px-4 py-2" style={{ color: '#DC2626' }}>{err}</p>}
    </GlassCard>
  )
}

// ── Reports ─────────────────────────────────────────────────────────────────

function monthStart(ymd: string) { return `${ymd.slice(0, 8)}01` }
function lastMonth(ymd: string): [string, string] {
  const [y, m] = ymd.split('-').map(Number)
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
  const days = new Date(Date.UTC(py, pm, 0)).getUTCDate()
  const mm = String(pm).padStart(2, '0')
  return [`${py}-${mm}-01`, `${py}-${mm}-${String(days).padStart(2, '0')}`]
}

function ReportsView({ today, onView }: { today: string; onView: (e: Expense) => void }) {
  const [from, setFrom] = useState(monthStart(today))
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<ExpenseReport | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ask = useRef(0)

  async function run(a: string, b: string) {
    setFrom(a); setTo(b); setErr('')
    const mine = ++ask.current
    setBusy(true)
    const res = await getExpenseReport({ from: a, to: b })
    if (mine !== ask.current) return
    setBusy(false)
    if (!res.success) { setErr(res.error); return }
    setReport(res.report)
  }
  useEffect(() => {
    const t = setTimeout(() => { void run(monthStart(today), today) }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function csv() {
    if (!report) return
    downloadCsv(`expenses_${report.from}_to_${report.to}.csv`,
      ['Date', 'Category', 'Paid to', 'Paid by', 'Reference', 'Amount', 'Bill', 'No-bill reason', 'Notes', 'Added by', 'Added at', 'Status', 'Cancel reason'],
      report.rows.map((e) => [
        e.expense_date, csvText(e.category), csvText(e.paid_to), methodLabel(e.method), csvText(e.reference), e.amount.toFixed(2),
        e.has_bill ? 'Yes' : 'No', csvText(e.no_bill_reason), csvText(e.notes), csvText(e.recorded_by),
        new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        e.cancelled_at ? 'Cancelled' : 'Counted', csvText(e.cancel_reason),
      ]))
  }

  const presets: Array<[string, string, string]> = [
    ['Today', today, today], ['This month', monthStart(today), today], ['Last month', ...lastMonth(today)],
  ]
  return (
    <div className="space-y-4" style={{ opacity: busy ? 0.6 : 1 }}>
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          {presets.map(([label, a, b]) => (
            <button key={label} type="button" onClick={() => void run(a, b)} className="px-3 py-2 rounded-xl text-sm"
              style={{ border: `1px solid ${from === a && to === b ? '#0D9488' : '#E2E8F0'}`, background: from === a && to === b ? 'rgba(13,148,136,0.08)' : '#fff', color: '#0F172A', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
          <div>
            <label style={labelStyle} htmlFor="rep-from">From</label>
            <input id="rep-from" type="date" value={from} max={today} onChange={(e) => e.target.value && void run(e.target.value, to)} style={{ ...inputStyle, width: 160 }} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="rep-to">To</label>
            <input id="rep-to" type="date" value={to} max={today} onChange={(e) => e.target.value && void run(from, e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </div>
          <button type="button" onClick={csv} disabled={!report?.rows.length} className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ml-auto"
            style={{ background: 'rgba(13,148,136,0.08)', color: report?.rows.length ? '#0D9488' : '#94A3B8', border: '1px solid rgba(13,148,136,0.25)', cursor: report?.rows.length ? 'pointer' : 'not-allowed' }}>
            <Download className="w-4 h-4" /> Download CSV
          </button>
        </div>
        {err && <p className="text-sm mt-2" style={{ color: '#DC2626' }}>{err}</p>}
      </GlassCard>

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ['Total spent', <Money key="t" amount={report.total} />],
              ['Expenses', report.count.toLocaleString('en-IN')],
              ['With bill', report.withBill.toLocaleString('en-IN')],
              ['Without bill', report.withoutBill.toLocaleString('en-IN')],
            ] as Array<[string, React.ReactNode]>).map(([label, value]) => (
              <GlassCard key={label} className="p-4">
                <p className="text-xs" style={{ color: '#64748B' }}>{label}</p>
                <p className="text-lg font-bold mt-1" style={{ color: label === 'Without bill' && report.withoutBill ? '#B45309' : '#0F172A' }}>{value}</p>
              </GlassCard>
            ))}
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <Breakdown title="By category" items={report.byCategory} total={report.total} />
            <Breakdown title="By payment method" items={report.byMethod} total={report.total} />
            <Breakdown title="By staff" items={report.byStaff} total={report.total} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>
              Every expense, {dmy(report.from)} to {dmy(report.to)} — cancelled ones are struck through and not counted
            </p>
            <ExpenseList rows={report.rows} canManage={false} onView={onView} onCancelled={() => {}} />
          </div>
        </>
      )}
    </div>
  )
}

function Breakdown({ title, items, total }: { title: string; items: ExpenseTotal[]; total: number }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748B' }}>{title}</p>
      {!items.length ? <p className="text-sm" style={{ color: '#94A3B8' }}>Nothing in this range.</p> : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.key}>
              <div className="flex justify-between text-sm" style={{ color: '#0F172A' }}>
                <span>{t.label} <span style={{ color: '#94A3B8' }}>· {t.count}</span></span>
                <span className="font-semibold"><Money amount={t.amount} /></span>
              </div>
              <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, marginTop: 3 }}>
                <div style={{ width: `${total ? Math.round((t.amount / total) * 100) : 0}%`, height: 4, background: '#0D9488', borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
