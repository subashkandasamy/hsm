'use client'

import { useState } from 'react'
import { BookOpen, Wallet, History as HistoryIcon, Loader2, Printer, CheckCircle2, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import DateText from '@/components/ui/DateText'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import { getDayBook, closeShift, getShiftSummary } from '@/app/actions/cashRegister'
import type { DayBook, ShiftSummary, CashShiftClose, CashMovement, CashSummary } from '@/lib/types'

type Tab = 'daybook' | 'shift' | 'history'

function fmt(n: number) {
  const v = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-₹' : '₹') + v
}
function bucketKey(method: string) {
  if (method === 'cash') return 'cash'
  if (method === 'card') return 'card'
  if (method === 'upi') return 'upi'
  if (method === 'bank_transfer') return 'bank'
  if (method === 'insurance') return 'insurance'
  return null
}
function summarize(movs: CashMovement[]): CashSummary {
  const s: CashSummary = { cash: 0, card: 0, upi: 0, bank: 0, insurance: 0, refunds: 0, net: 0, count: movs.length }
  for (const m of movs) {
    const k = bucketKey(m.method) as keyof CashSummary | null
    if (k && k in s) (s[k] as number) += m.amount
    if (m.kind === 'refund') s.refunds += Math.abs(m.amount)
  }
  s.net = s.cash + s.card + s.upi + s.bank + s.insurance
  return s
}
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', bank_transfer: 'Bank', insurance: 'Insurance' }
const KIND_LABEL: Record<string, string> = { payment: 'Bill Payment', advance: 'Advance', refund: 'Refund' }

interface Props {
  today: string
  initialDayBook: DayBook
  initialShift: ShiftSummary
  initialCloses: CashShiftClose[]
  hospitalName: string
}

export default function CashBookClient({ today, initialDayBook, initialShift, initialCloses, hospitalName }: Props) {
  const { profile } = useAuth()
  const canClose = !!profile?.role && hasPermission(profile.role, 'billing:write')
  const [tab, setTab] = useState<Tab>('daybook')

  // ── Day Book ──
  const [date, setDate] = useState(today)
  const [dayBook, setDayBook] = useState(initialDayBook)
  const [cashierFilter, setCashierFilter] = useState('')
  const [loadingDay, setLoadingDay] = useState(false)

  async function loadDay(d: string) {
    setLoadingDay(true)
    const db = await getDayBook({ date: d })
    setDayBook(db)
    setCashierFilter('')
    setLoadingDay(false)
  }

  const visibleMovements = cashierFilter
    ? dayBook.movements.filter((m) => (m.cashierId ?? 'unknown') === cashierFilter)
    : dayBook.movements
  const shownSummary = cashierFilter ? summarize(visibleMovements) : dayBook.summary

  // ── My Shift ──
  const [shift, setShift] = useState(initialShift)
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeErr, setCloseErr] = useState<string | null>(null)
  const [justClosed, setJustClosed] = useState<CashShiftClose | null>(null)
  const [closes, setCloses] = useState(initialCloses)

  const variancePreview = counted !== '' ? (parseFloat(counted) || 0) - shift.expectedCash : null

  async function handleClose() {
    setClosing(true); setCloseErr(null)
    const res = await closeShift({ counted_cash: parseFloat(counted) || 0, notes: notes || null })
    if (!res.success) { setCloseErr(res.error); setClosing(false); return }
    // Refresh shift window + history
    const [fresh, freshList] = await Promise.all([getShiftSummary(), (await import('@/app/actions/cashRegister')).listShiftCloses()])
    const newClose = freshList.find((c) => c.id === res.id) ?? null
    setShift(fresh); setCloses(freshList); setJustClosed(newClose)
    setCounted(''); setNotes(''); setClosing(false)
  }

  // ── Slip modal ──
  const [slip, setSlip] = useState<CashShiftClose | null>(null)

  const summaryCards: { label: string; value: number; color: string }[] = [
    { label: 'Cash', value: shownSummary.cash, color: '#0D9488' },
    { label: 'Card', value: shownSummary.card, color: '#6366F1' },
    { label: 'UPI', value: shownSummary.upi, color: '#8B5CF6' },
    { label: 'Bank', value: shownSummary.bank, color: '#0EA5E9' },
    { label: 'Refunds Out', value: shownSummary.refunds, color: '#F59E0B' },
    { label: 'Net Collected', value: shownSummary.net, color: '#0F172A' },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Cash Book" subtitle="Daily collections and cashier shift reconciliation" />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 no-print">
        {([
          { key: 'daybook', label: 'Day Book', icon: <BookOpen className="w-4 h-4" /> },
          { key: 'shift', label: 'My Shift', icon: <Wallet className="w-4 h-4" /> },
          { key: 'history', label: 'Shift History', icon: <HistoryIcon className="w-4 h-4" /> },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={tab === t.key
              ? { background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }
              : { background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── DAY BOOK ── */}
      {tab === 'daybook' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Date</label>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); loadDay(e.target.value) }} />
            </div>
            {dayBook.perCashier.length > 0 && (
              <div>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Cashier</label>
                <Select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)}>
                  <option value="">All cashiers</option>
                  {dayBook.perCashier.map((c) => <option key={c.cashierId} value={c.cashierId}>{c.name}</option>)}
                </Select>
              </div>
            )}
            {loadingDay && <Loader2 className="w-4 h-4 animate-spin mb-2" style={{ color: '#94A3B8' }} />}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {summaryCards.map((c) => (
              <GlassCard key={c.label} className="p-3">
                <p className="text-xs" style={{ color: '#94A3B8' }}>{c.label}</p>
                <p className="text-base font-bold tabular-nums" style={{ color: c.color }}>{fmt(c.value)}</p>
              </GlassCard>
            ))}
          </div>

          {dayBook.perCashier.length > 0 && (
            <GlassCard className="p-0 overflow-hidden">
              <p className="text-xs font-semibold uppercase tracking-wide px-4 py-2.5" style={{ color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>By Cashier</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ color: '#94A3B8' }}>
                    {['Cashier', 'Cash', 'Card', 'UPI', 'Bank', 'Total'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {dayBook.perCashier.map((c) => (
                      <tr key={c.cashierId} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 14px', color: '#0F172A', fontWeight: 500 }}>{c.name}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>{fmt(c.cash)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>{fmt(c.card)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>{fmt(c.upi)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>{fmt(c.bank)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>{fmt(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-0 overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wide px-4 py-2.5" style={{ color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>Movements ({visibleMovements.length})</p>
            {visibleMovements.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#94A3B8' }}>No collections on this day</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ color: '#94A3B8' }}>
                    {['Time', 'Type', 'Patient', 'Reference', 'Method', 'Cashier', 'Amount'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: i === 6 ? 'right' : 'left', fontSize: '11px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {visibleMovements.map((m) => (
                      <tr key={m.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 14px', color: '#94A3B8', whiteSpace: 'nowrap' }}>{new Date(m.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '8px 14px', color: '#64748B' }}>{KIND_LABEL[m.kind]}</td>
                        <td style={{ padding: '8px 14px', color: '#0F172A' }}>{m.patientName}</td>
                        <td style={{ padding: '8px 14px', color: '#94A3B8', fontFamily: 'monospace', fontSize: '12px' }}>{m.reference}</td>
                        <td style={{ padding: '8px 14px', color: '#64748B' }}>{METHOD_LABEL[m.method] ?? m.method}</td>
                        <td style={{ padding: '8px 14px', color: '#64748B' }}>{m.cashierName}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: m.amount < 0 ? '#DC2626' : '#0F172A' }}>{fmt(m.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ── MY SHIFT ── */}
      {tab === 'shift' && (
        <div className="max-w-lg space-y-4">
          <GlassCard className="p-5">
            <p className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>Current shift</p>
            <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
              Since {shift.lastCloseAt ? new Date(shift.lastCloseAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'start of today'} · {shift.paymentCount} transaction{shift.paymentCount !== 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {[
                { label: 'Expected Cash', value: shift.expectedCash, bold: true },
                { label: 'Card', value: shift.cardTotal },
                { label: 'UPI', value: shift.upiTotal },
                { label: 'Bank Transfer', value: shift.bankTotal },
              ].map((r) => (
                <div key={r.label} className="flex justify-between" style={{ fontSize: r.bold ? '15px' : '13px' }}>
                  <span style={{ color: r.bold ? '#0F172A' : '#64748B', fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
                  <span className="tabular-nums" style={{ color: r.bold ? '#0D9488' : '#475569', fontWeight: r.bold ? 700 : 500 }}>{fmt(r.value)}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {canClose ? (
            <GlassCard className="p-5">
              <p className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>Close shift / handover</p>
              {justClosed ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', color: '#065F46' }}>
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    <div className="text-sm">
                      Shift closed. Variance: <strong>{fmt(justClosed.variance)}</strong>
                      {Math.abs(justClosed.variance) > 0.001 && <span> ({justClosed.variance > 0 ? 'excess' : 'short'})</span>}
                    </div>
                  </div>
                  <button onClick={() => setSlip(justClosed)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer' }}>
                    <Printer className="w-4 h-4" /> Print handover slip
                  </button>
                  <button onClick={() => setJustClosed(null)} className="block text-xs" style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Start a new count</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {closeErr && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{closeErr}</div>}
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Cash counted in drawer (₹)</label>
                    <Input type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" />
                  </div>
                  {variancePreview !== null && (
                    <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl"
                      style={{ background: Math.abs(variancePreview) < 0.01 ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', color: Math.abs(variancePreview) < 0.01 ? '#065F46' : '#92400E' }}>
                      {Math.abs(variancePreview) >= 0.01 && <AlertTriangle className="w-4 h-4" />}
                      Variance: <strong>{fmt(variancePreview)}</strong> {variancePreview > 0 ? '(excess)' : variancePreview < 0 ? '(short)' : '(matched)'}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Notes (optional)</label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Handover remarks…" />
                  </div>
                  <button onClick={handleClose} disabled={closing || counted === ''}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: closing || counted === '' ? '#94A3B8' : '#0D9488', border: 'none', cursor: closing || counted === '' ? 'not-allowed' : 'pointer' }}>
                    {closing && <Loader2 className="w-4 h-4 animate-spin" />} Close Shift
                  </button>
                </div>
              )}
            </GlassCard>
          ) : (
            <p className="text-sm" style={{ color: '#94A3B8' }}>You don&apos;t have permission to close a shift.</p>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab === 'history' && (
        <GlassCard className="p-0 overflow-hidden">
          {closes.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#94A3B8' }}>No shift closes yet</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ color: '#94A3B8' }}>
                  {['Closed', 'Cashier', 'Expected', 'Counted', 'Variance', ''].map((h, i) => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: i >= 2 && i <= 4 ? 'right' : 'left', fontSize: '11px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {closes.map((c) => (
                    <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 14px', color: '#64748B', whiteSpace: 'nowrap' }}><DateText date={c.created_at} /></td>
                      <td style={{ padding: '8px 14px', color: '#0F172A' }}>{c.cashier?.full_name ?? '—'}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>{fmt(c.expected_cash)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#475569' }}>{fmt(c.counted_cash)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: Math.abs(c.variance) < 0.01 ? '#10B981' : '#DC2626' }}>{fmt(c.variance)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <button onClick={() => setSlip(c)} style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer' }}><Printer className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {/* ── Handover slip modal ── */}
      {slip && (
        <Modal open onClose={() => setSlip(null)} title="Shift Handover Slip" maxWidth="26rem"
          footer={<div className="flex justify-end gap-2">
            <button onClick={() => setSlip(null)} className="px-4 py-2.5 rounded-xl text-sm" style={{ border: '1px solid #E2E8F0', color: '#475569' }}>Close</button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#0D9488', border: 'none' }}><Printer className="w-4 h-4" /> Print</button>
          </div>}>
          <style>{`@media print { body * { visibility: hidden; } #slip-print, #slip-print * { visibility: visible; } #slip-print { position: absolute; top: 0; left: 0; width: 100%; } }`}</style>
          <div id="slip-print" style={{ fontSize: '13px' }}>
            <p style={{ textAlign: 'center', fontWeight: 800, fontSize: '15px', color: '#0F172A', margin: '0 0 2px' }}>{hospitalName}</p>
            <p style={{ textAlign: 'center', fontSize: '11px', letterSpacing: '2px', color: '#0F766E', textTransform: 'uppercase', margin: '0 0 12px' }}>Cash Handover Slip</p>
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
              {[
                ['Cashier', slip.cashier?.full_name ?? '—'],
                ['From', new Date(slip.from_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })],
                ['To', new Date(slip.to_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })],
                ['Transactions', String(slip.payment_count)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#475569' }}><span>{k}</span><span style={{ fontWeight: 600, color: '#0F172A' }}>{v}</span></div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '8px', paddingTop: '8px' }}>
              {[
                ['Expected Cash', fmt(slip.expected_cash)],
                ['Counted Cash', fmt(slip.counted_cash)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#475569' }}><span>{k}</span><span style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>{v}</span></div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #E2E8F0', marginTop: '4px' }}>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>Variance</span>
                <span style={{ fontWeight: 800, fontFamily: 'monospace', color: Math.abs(slip.variance) < 0.01 ? '#10B981' : '#DC2626' }}>{fmt(slip.variance)}</span>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '8px', paddingTop: '8px', color: '#64748B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Card</span><span style={{ fontFamily: 'monospace' }}>{fmt(slip.card_total)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>UPI</span><span style={{ fontFamily: 'monospace' }}>{fmt(slip.upi_total)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Bank</span><span style={{ fontFamily: 'monospace' }}>{fmt(slip.bank_total)}</span></div>
            </div>
            {slip.notes && <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}><strong>Notes:</strong> {slip.notes}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', fontSize: '11px', color: '#94A3B8' }}>
              <span>Handed over by ____________</span>
              <span>Received by ____________</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
