'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Link2, Plus, Search, Syringe, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useDrugSearch } from '@/lib/hooks/useDrugSearch'
import {
  addVaccineProduct, cancelVaccineOrder, dispenseVaccine, listVaccineOrders, listVaccineStock,
  removeVaccineProduct, setVaccineFreeSupply,
  type VaccineOrder, type VaccineSupply,
} from '@/app/actions/vaccination'

interface Props {
  initialOrders: VaccineOrder[]
  initialStock: VaccineSupply[]
  canDispense: boolean
  canManage: boolean
}

const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const money = (n: number | null | undefined) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`)
const btn = (primary = false): React.CSSProperties => primary
  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
  : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }

/** Pharmacy → Vaccines: what to hand over today, vaccine stock, and the vaccine ↔ product map. */
export default function VaccinesView({ initialOrders, initialStock, canDispense, canManage }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [stock, setStock] = useState(initialStock)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState<VaccineOrder | null>(null)
  const [showUnset, setShowUnset] = useState(false)

  const refresh = async () => {
    const [o, s] = await Promise.all([listVaccineOrders(), listVaccineStock()])
    setOrders(o); setStock(s)
  }
  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Could not save'); return }
      await refresh()
    })
  }

  const { toDispense, dispensed } = useMemo(() => ({
    toDispense: orders.filter((o) => o.fulfilment === 'pending'),
    dispensed: orders.filter((o) => o.fulfilment === 'dispensed'),
  }), [orders])
  const unpaid = toDispense.filter((o) => !o.bill || o.bill.paid < o.bill.total)
  const configured = stock.filter((s) => s.products.length > 0 || s.free_supply)
  const unset = stock.filter((s) => s.products.length === 0 && !s.free_supply)
  const lowOrExpiring = configured.filter((s) => !s.free_supply && (s.inStock <= 0 || s.products.some((p) => isSoon(p.earliestExpiry))))

  return (
    <div className="space-y-4">
      {error && <p className="text-sm px-3 py-2 rounded-xl" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{error}</p>}

      {/* To hand over */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <Syringe className="w-4 h-4" style={{ color: '#0D9488' }} /> To dispense
          </h3>
          {unpaid.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>
              {unpaid.length} waiting for payment
            </span>
          )}
        </div>
        {toDispense.length === 0 ? (
          <p className="text-sm" style={{ color: '#94A3B8' }}>Nothing waiting. Vaccines recorded in a consultation appear here for payment and hand-over.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>
                {['Child', 'Vaccine', 'Given', 'Amount', 'Payment', ''].map((h) => (
                  <th key={h} className="text-left px-2 py-2 text-xs font-semibold" style={{ color: '#475569' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {toDispense.map((o) => {
                  const paid = !!o.bill && o.bill.paid >= o.bill.total
                  return (
                    <tr key={o.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td className="px-2 py-2">
                        <p className="font-medium" style={{ color: '#0F172A' }}>{o.patient.full_name}</p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>{o.patient.uhid}</p>
                      </td>
                      <td className="px-2 py-2">
                        <p style={{ color: '#0F172A' }}>{o.vaccine} {o.dose_label}</p>
                        <p className="text-xs" style={{ color: o.inStock > 0 ? '#64748B' : '#B91C1C' }}>
                          {o.productName ?? 'No product linked'}{o.inStock > 0 ? ` · ${o.inStock} in stock` : ' · no stock'}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-xs" style={{ color: '#64748B' }}>{fmt(o.given_date)}</td>
                      <td className="px-2 py-2 tabular-nums">{money(o.charge_amount)}</td>
                      <td className="px-2 py-2">
                        {paid
                          ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#DCFCE7', color: '#15803D' }}>Paid</span>
                          : <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>
                              Collect {money(o.bill ? o.bill.total - o.bill.paid : o.charge_amount)}{o.bill ? ` · ${o.bill.bill_no}` : ''}
                            </span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {canDispense && (
                          <button type="button" disabled={isPending || !paid} onClick={() => run(() => dispenseVaccine(o.id))}
                            title={paid ? 'Take the vial out of stock' : 'Collect the payment first'}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold mr-1.5"
                            style={{ ...btn(true), opacity: paid ? 1 : 0.45, cursor: paid ? 'pointer' : 'not-allowed' }}>
                            Dispense
                          </button>
                        )}
                        {canManage && (
                          <button type="button" disabled={isPending} onClick={() => setCancelling(o)}
                            className="px-2 py-1 rounded-lg text-xs" style={btn()}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {dispensed.length > 0 && (
          <p className="text-xs mt-3" style={{ color: '#64748B' }}>
            <CheckCircle className="w-3.5 h-3.5 inline mr-1" style={{ color: '#15803D' }} />
            Dispensed in the last 7 days: {dispensed.map((o) => `${o.patient.full_name} — ${o.vaccine} ${o.dose_label}${o.batch_no ? ` (${o.batch_no})` : ''}`).join(' · ')}
          </p>
        )}
      </GlassCard>

      {/* Stock + brands per vaccine */}
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Vaccine stock</h3>
        <p className="text-xs mb-3" style={{ color: '#64748B' }}>
          A vaccine can have more than one brand (for example a painful and a painless one). The brand that expires first is used next, and the doctor can pick another at the consultation.
        </p>
        {lowOrExpiring.length > 0 && (
          <p className="text-xs px-3 py-2 rounded-xl mb-3" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            {lowOrExpiring.map((s) => `${s.vaccine}: ${s.inStock <= 0 ? 'out of stock' : `expires ${fmt(s.products.map((p) => p.earliestExpiry).filter(Boolean).sort()[0] ?? null)}`}`).join(' · ')}
          </p>
        )}

        <div className="space-y-1.5">
          {configured.map((s) => <StockRow key={s.vaccine} s={s} canManage={canManage} isPending={isPending} run={run} />)}
        </div>
        {configured.length === 0 && <p className="text-sm" style={{ color: '#94A3B8' }}>No vaccine is set up yet — link a pharmacy product below.</p>}

        {unset.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setShowUnset((u) => !u)} className="flex items-center gap-1 text-xs font-medium" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
              {showUnset ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Not set up yet ({unset.length})
            </button>
            {showUnset && (
              <div className="space-y-1.5 mt-2">
                {unset.map((s) => <StockRow key={s.vaccine} s={s} canManage={canManage} isPending={isPending} run={run} />)}
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {stock.length === 0 && <EmptyState title="No vaccines" description="The immunisation schedule has no vaccines yet." />}

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={() => { const o = cancelling; setCancelling(null); if (o) run(() => cancelVaccineOrder(o.id)) }}
        loading={isPending}
        title="Cancel this vaccine order?"
        description={cancelling ? `The charge for ${cancelling.vaccine} ${cancelling.dose_label} (${cancelling.patient.full_name}) is cancelled. The dose stays recorded in the child's record — remove it from the consultation if it was not given.` : ''}
        confirmLabel="Cancel order"
      />
    </div>
  )
}

function isSoon(expiry: string | null) {
  if (!expiry) return false
  return Date.parse(`${expiry}T00:00:00Z`) - Date.now() < 60 * 86400000
}

function StockRow({ s, canManage, isPending, run }: {
  s: VaccineSupply; canManage: boolean; isPending: boolean
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => void
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const results = useDrugSearch(query, 8)

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-[150px]">
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{s.vaccine}</p>
          {s.free_supply
            ? <span className="text-xs" style={{ color: '#15803D' }}>Government supply — free</span>
            : s.products.length
              ? <span className="text-xs" style={{ color: s.inStock > 0 ? '#64748B' : '#B91C1C' }}>{s.inStock} dose{s.inStock === 1 ? '' : 's'} in stock</span>
              : <span className="text-xs" style={{ color: '#94A3B8' }}>No brand linked</span>}
        </div>

        <div className="flex-1 flex flex-wrap gap-1.5 min-w-[220px]">
          {s.products.map((p) => (
            <span key={p.linkId} className="inline-flex items-start gap-2 text-xs pl-2.5 pr-1 py-1.5 rounded-lg"
              style={{ background: '#fff', border: `1px solid ${p.inStock > 0 ? '#CCFBF1' : '#FECACA'}`, color: '#0F172A' }}>
              <span>
                <span className="font-medium block">{p.name}</span>
                <span style={{ color: '#64748B' }}>
                  <span style={{ color: p.inStock > 0 ? '#0D9488' : '#B91C1C', fontWeight: 600 }}>
                    {p.inStock > 0 ? `${p.inStock} in stock` : 'out of stock'}
                  </span>
                  {p.price != null ? ` · ${money(p.price)}` : ''}
                  {p.earliestExpiry ? ` · expires ${fmt(p.earliestExpiry)}` : ''}
                </span>
              </span>
              {canManage && (
                <button type="button" disabled={isPending} onClick={() => run(() => removeVaccineProduct(p.linkId))}
                  title={`Unlink ${p.name}`} aria-label={`Unlink ${p.name}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1' }}>
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>

        {canManage && (
          <span className="flex gap-1.5">
            <button type="button" onClick={() => { setAdding((a) => !a); setQuery('') }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium" style={btn()}>
              {s.products.length ? <><Plus className="w-3 h-3" /> Add brand</> : <><Link2 className="w-3 h-3" /> Link brand</>}
            </button>
            <button type="button" disabled={isPending} onClick={() => run(() => setVaccineFreeSupply(s.vaccine, !s.free_supply))}
              className="px-2.5 py-1 rounded-lg text-xs font-medium" style={btn()}>
              {s.free_supply ? 'Charge for this' : 'Government (free)'}
            </button>
          </span>
        )}
      </div>

      {adding && canManage && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
            <Search className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search the pharmacy for ${s.vaccine} (brand or generic)…`}
              className="flex-1 text-sm" style={{ border: 'none', outline: 'none', color: '#0F172A' }} />
            <button type="button" onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X className="w-3.5 h-3.5" /></button>
          </div>
          {results.length > 0 && (
            <ul className="mt-1 rounded-lg overflow-hidden" style={{ border: '1px solid #E2E8F0', background: '#fff' }}>
              {results.map((d) => (
                <li key={d.id}>
                  <button type="button" disabled={isPending}
                    onClick={() => { setAdding(false); run(() => addVaccineProduct(s.vaccine, d.id, !!d.is_global)) }}
                    className="w-full text-left px-3 py-2 text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F172A' }}>
                    {d.name}{d.strength ? ` ${d.strength}` : ''}{d.form ? ` (${d.form})` : ''}
                    <span className="block text-xs" style={{ color: '#94A3B8' }}>
                      {(d.brand_aliases ?? []).slice(0, 3).join(', ') || d.generic_name || ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
