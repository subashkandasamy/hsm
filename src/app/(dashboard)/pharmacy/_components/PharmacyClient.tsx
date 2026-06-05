'use client'

import { useState } from 'react'
import { Plus, RefreshCw, AlertTriangle, Package } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import DateText from '@/components/ui/DateText'
import Money from '@/components/ui/Money'
import { listPendingPrescriptions, getStock, getAlerts } from '@/app/actions/pharmacy'
import type { DrugWithStock, PrescriptionWithVisit, Drug } from '@/lib/types'
import type { PharmacyAlerts } from '@/app/actions/pharmacy'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import DispenseModal from './DispenseModal'
import AddBatchModal from './AddBatchModal'

type TabKey = 'queue' | 'stock' | 'alerts'

interface Props {
  initialPending: PrescriptionWithVisit[]
  initialStock: DrugWithStock[]
  initialAlerts: PharmacyAlerts
  drugs: Drug[]
}

export default function PharmacyClient({ initialPending, initialStock, initialAlerts, drugs }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canDispense = !!role && hasPermission(role, 'pharmacy:dispense')
  const canManage   = !!role && hasPermission(role, 'pharmacy:manage')
  const [tab, setTab] = useState<TabKey>('queue')
  const [pending, setPending] = useState<PrescriptionWithVisit[]>(initialPending)
  const [stock, setStock] = useState<DrugWithStock[]>(initialStock)
  const [alerts, setAlerts] = useState<PharmacyAlerts>(initialAlerts)
  const [loading, setLoading] = useState(false)
  const [dispenseRx, setDispenseRx] = useState<PrescriptionWithVisit | null>(null)
  const [showAddBatch, setShowAddBatch] = useState(false)

  const alertCount = alerts.lowStock.length + alerts.nearExpiry.length + alerts.expired.length

  async function refresh() {
    setLoading(true)
    const [p, s, a] = await Promise.all([listPendingPrescriptions(), getStock(), getAlerts()])
    setPending(p); setStock(s); setAlerts(a)
    setLoading(false)
  }

  return (
    <div>
      <PageHeader
        title="Pharmacy"
        subtitle="Dispensing, stock management, and alerts"
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button onClick={() => setShowAddBatch(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> Add Batch
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {([
          { key: 'queue' as TabKey, label: 'Dispense Queue', count: pending.length },
          { key: 'stock' as TabKey, label: 'Stock', count: stock.length },
          { key: 'alerts' as TabKey, label: 'Alerts', count: alertCount, urgent: alertCount > 0 },
        ]).map(({ key, label, count, urgent }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={tab === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }}>
            {label}
            <span className="text-xs px-1.5 py-0.5 rounded-full"
              style={tab === key
                ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                : urgent ? { background: '#FEE2E2', color: '#DC2626' } : { background: '#F1F5F9', color: '#64748B' }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <DispenseQueue pending={pending} onDispense={canDispense ? setDispenseRx : undefined} />
      )}

      {tab === 'stock' && (
        <StockView stock={stock} />
      )}

      {tab === 'alerts' && (
        <AlertsView alerts={alerts} />
      )}

      {dispenseRx && (
        <DispenseModal
          open={true}
          prescription={dispenseRx}
          drugs={drugs}
          onClose={() => setDispenseRx(null)}
          onSuccess={() => { setDispenseRx(null); refresh() }}
        />
      )}

      {showAddBatch && (
        <AddBatchModal
          open={showAddBatch}
          drugs={drugs}
          onClose={() => setShowAddBatch(false)}
          onSuccess={() => { setShowAddBatch(false); refresh() }}
        />
      )}
    </div>
  )
}

function DispenseQueue({ pending, onDispense }: {
  pending: PrescriptionWithVisit[]
  onDispense?: (rx: PrescriptionWithVisit) => void
}) {
  if (pending.length === 0) {
    return (
      <GlassCard className="p-6">
        <EmptyState title="No pending prescriptions"
          description="All current prescriptions have been dispensed."
          icon={<Package className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
      </GlassCard>
    )
  }

  return (
    <div className="space-y-3">
      {pending.map((rx) => (
        <GlassCard key={rx.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold" style={{ color: '#0F172A' }}>{rx.drug_name}</p>
                {rx.dosage && <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{rx.dosage}</span>}
                {rx.frequency && <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{rx.frequency}</span>}
                {rx.duration && <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>{rx.duration}</span>}
              </div>
              <p className="text-sm mt-1" style={{ color: '#475569' }}>
                {rx.patient_name} · <span className="font-mono text-xs">{rx.patient_uhid}</span>
              </p>
              {rx.instructions && (
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{rx.instructions}</p>
              )}
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                <DateText date={rx.visit_date} />
              </p>
            </div>
            {onDispense ? (
              <button onClick={() => onDispense(rx)}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Dispense
              </button>
            ) : (
              <span className="flex-shrink-0 text-xs px-3 py-2 rounded-xl"
                style={{ background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
                Pharmacist only
              </span>
            )}
          </div>
        </GlassCard>
      ))}
    </div>
  )
}

function StockView({ stock }: { stock: DrugWithStock[] }) {
  if (stock.length === 0) {
    return <GlassCard className="p-6"><EmptyState title="No drugs in stock" description="Add drug batches to see stock here." /></GlassCard>
  }

  return (
    <div className="space-y-3">
      {stock.map((drug) => {
        const isLow = drug.total_qty <= drug.reorder_level
        return (
          <GlassCard key={drug.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold" style={{ color: '#0F172A' }}>{drug.name}</p>
                  {drug.generic_name && <span className="text-xs" style={{ color: '#64748B' }}>({drug.generic_name})</span>}
                  {drug.form && <span className="text-xs px-2 py-0.5 rounded-lg capitalize" style={{ background: '#F1F5F9', color: '#475569' }}>{drug.form}</span>}
                  {drug.strength && <span className="text-xs" style={{ color: '#64748B' }}>{drug.strength}</span>}
                  {isLow && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                      <AlertTriangle className="w-3 h-3" /> Low Stock
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1">
                  <span className="font-bold" style={{ color: isLow ? '#DC2626' : '#0D9488' }}>{drug.total_qty}</span>
                  <span className="ml-1 text-xs" style={{ color: '#64748B' }}>{drug.unit ?? 'units'} available</span>
                  {drug.reorder_level > 0 && (
                    <span className="ml-2 text-xs" style={{ color: '#94A3B8' }}>Reorder at {drug.reorder_level}</span>
                  )}
                </p>
                {drug.batches.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {drug.batches.map((b) => (
                      <span key={b.id} className="text-xs px-2 py-0.5 rounded-lg"
                        style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                        {b.batch_no} · exp <DateText date={b.expiry} /> · {b.qty_available} · <Money amount={b.mrp} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        )
      })}
    </div>
  )
}

function AlertsView({ alerts }: { alerts: PharmacyAlerts }) {
  const hasAlerts = alerts.lowStock.length + alerts.nearExpiry.length + alerts.expired.length > 0
  if (!hasAlerts) {
    return (
      <GlassCard className="p-6">
        <EmptyState title="No alerts" description="Stock levels and expiry dates are all within acceptable ranges." />
      </GlassCard>
    )
  }

  return (
    <div className="space-y-5">
      {alerts.expired.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#DC2626' }}>
            <AlertTriangle className="w-4 h-4" /> Expired Batches ({alerts.expired.length})
          </h3>
          <div className="space-y-2">
            {alerts.expired.map((b) => (
              <GlassCard key={b.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm" style={{ color: '#0F172A' }}>{b.drug_name}</span>
                    <span className="ml-2 font-mono text-xs" style={{ color: '#94A3B8' }}>{b.batch_no}</span>
                  </div>
                  <div className="text-xs" style={{ color: '#DC2626' }}>
                    Expired <DateText date={b.expiry} /> · {b.qty_available} units
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {alerts.lowStock.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#B45309' }}>
            Low Stock ({alerts.lowStock.length} drugs)
          </h3>
          <div className="space-y-2">
            {alerts.lowStock.map((d) => (
              <GlassCard key={d.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm" style={{ color: '#0F172A' }}>{d.name}</span>
                  <span className="text-xs" style={{ color: '#B45309' }}>
                    {d.total_qty} remaining · reorder at {d.reorder_level}
                  </span>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {alerts.nearExpiry.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#0D9488' }}>
            Expiring Within 30 Days ({alerts.nearExpiry.length} batches)
          </h3>
          <div className="space-y-2">
            {alerts.nearExpiry.map((b) => (
              <GlassCard key={b.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm" style={{ color: '#0F172A' }}>{b.drug_name}</span>
                    <span className="ml-2 font-mono text-xs" style={{ color: '#94A3B8' }}>{b.batch_no}</span>
                  </div>
                  <span className="text-xs" style={{ color: '#0D9488' }}>
                    Expires <DateText date={b.expiry} /> · {b.qty_available} units
                  </span>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
