'use client'

import { useState } from 'react'
import {
  Plus, RefreshCw, AlertTriangle, Package,
  CheckCircle2, Circle, User2, ChevronDown, ChevronRight,
  X, Loader2, Truck, CreditCard, Search, BedDouble, Check,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import DateText from '@/components/ui/DateText'
import Money from '@/components/ui/Money'
import {
  listPendingPrescriptions, getStock, getAlerts,
  generatePharmacyBill, checkBillStatus, dispatchMedicines,
  dispense as dispenseDrug, listPackedAwaitingDispatch,
} from '@/app/actions/pharmacy'
import { listIpdPharmacyRequests, dispenseIpdRequest } from '@/app/actions/ipdTreatment'
import type { DrugWithStock, PrescriptionWithVisit, Drug, PharmacySale, Patient, IpdPharmacyRequest } from '@/lib/types'
import type { PharmacyAlerts, AwaitingDispatchPatient } from '@/app/actions/pharmacy'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import Select from '@/components/ui/Select'
import DispenseModal from './DispenseModal'
import AddBatchModal from './AddBatchModal'
import SaleCartBuilder from './SaleCartBuilder'

type TabKey = 'cart' | 'queue' | 'ipd' | 'stock' | 'alerts'
type BillInfo = { billId: string; billNo: string; status: string }

interface Props {
  initialPending: PrescriptionWithVisit[]
  initialStock: DrugWithStock[]
  initialAlerts: PharmacyAlerts
  drugs: Drug[]
  initialReadySales: PharmacySale[]
  allPatients: Patient[]
  initialAwaitingDispatch: AwaitingDispatchPatient[]
  initialIpdRequests: IpdPharmacyRequest[]
}

export default function PharmacyClient({
  initialPending, initialStock, initialAlerts, drugs,
  initialReadySales, allPatients, initialAwaitingDispatch,
  initialIpdRequests,
}: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canDispense = !!role && hasPermission(role, 'pharmacy:dispense')
  const canSale     = !!role && hasPermission(role, 'pharmacy:sale')
  const canManage   = !!role && hasPermission(role, 'pharmacy:manage')

  const [tab, setTab]         = useState<TabKey>('cart')
  const [pending, setPending] = useState(initialPending)
  const [awaitingDispatch, setAwaitingDispatch] = useState(initialAwaitingDispatch)
  const [stock, setStock]     = useState(initialStock)
  const [alerts, setAlerts]   = useState(initialAlerts)
  const [loading, setLoading] = useState(false)
  const [dispenseRx, setDispenseRx] = useState<PrescriptionWithVisit | null>(null)
  const [showAddBatch, setShowAddBatch] = useState(false)

  // Packing state (session)
  const [skippedRxIds, setSkippedRxIds]   = useState<Set<string>>(new Set())
  const [dispensedIds, setDispensedIds]   = useState<Set<string>>(new Set())  // rxId
  const [dispenseIdMap, setDispenseIdMap] = useState<Map<string, string>>(new Map())  // rxId → dispenseId
  const [extraByPatient, setExtraByPatient] = useState<Map<string, string[]>>(new Map())  // patientId → [dispenseId]

  // Bill state — pre-initialised from DB (persists across page refreshes)
  const pendingPatientIds = new Set(initialPending.map((rx) => rx.patient_id))
  const [billInfoMap, setBillInfoMap] = useState<Map<string, BillInfo>>(() => {
    const map = new Map<string, BillInfo>()
    for (const p of initialAwaitingDispatch) {
      if (p.bill && !pendingPatientIds.has(p.patient_id)) {
        map.set(p.patient_id, { billId: p.bill.id, billNo: p.bill.bill_no, status: p.bill.status })
      }
    }
    return map
  })
  const [patientDispenseIds, setPatientDispenseIds] = useState<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>()
    for (const p of initialAwaitingDispatch) {
      if (!pendingPatientIds.has(p.patient_id)) map.set(p.patient_id, p.dispense_ids)
    }
    return map
  })
  const [dispatchedPatients, setDispatchedPatients] = useState<Set<string>>(new Set())
  const [ipdRequests, setIpdRequests] = useState(initialIpdRequests)
  const [dispensingIpdId, setDispensingIpdId] = useState<string | null>(null)

  const alertCount = alerts.lowStock.length + alerts.nearExpiry.length + alerts.expired.length
  const ipdPendingCount = ipdRequests.filter((r) => r.status === 'pending').length

  async function refresh() {
    setLoading(true)
    const [p, s, a, aw, ipd] = await Promise.all([
      listPendingPrescriptions(), getStock(), getAlerts(), listPackedAwaitingDispatch(), listIpdPharmacyRequests(),
    ])
    setPending(p); setStock(s); setAlerts(a); setAwaitingDispatch(aw); setIpdRequests(ipd)
    const billMap = new Map<string, BillInfo>()
    const dispMap = new Map<string, string[]>()
    for (const ap of aw) {
      if (ap.bill) billMap.set(ap.patient_id, { billId: ap.bill.id, billNo: ap.bill.bill_no, status: ap.bill.status })
      dispMap.set(ap.patient_id, ap.dispense_ids)
    }
    setBillInfoMap(billMap)
    setPatientDispenseIds(dispMap)
    setLoading(false)
  }

  async function handleIpdDispense(requestId: string, pricePerUnit: number) {
    setDispensingIpdId(requestId)
    const res = await dispenseIpdRequest(requestId, pricePerUnit)
    setDispensingIpdId(null)
    if (res.success) {
      setIpdRequests((prev) => prev.map((r) => r.id === requestId ? { ...r, status: 'dispensed' as const, price_snapshot: pricePerUnit, billing_status: 'unbilled' as const } : r))
    }
  }

  // Try to auto-generate bill once all non-skipped RXs + extras for a patient are packed.
  function tryBill(
    patientId: string,
    newDispensedIds: Set<string>,
    newDispenseIdMap: Map<string, string>,
    newExtraByPatient: Map<string, string[]>,
    currentSkippedRxIds: Set<string>,
  ) {
    if (billInfoMap.has(patientId)) return

    const rxs = pending.filter((rx) => rx.patient_id === patientId && !currentSkippedRxIds.has(rx.id))
    if (!rxs.every((rx) => newDispensedIds.has(rx.id))) return

    const rxDispenseIds = rxs.map((rx) => newDispenseIdMap.get(rx.id)).filter((id): id is string => !!id)
    const extraIds = newExtraByPatient.get(patientId) ?? []
    const allDispenseIds = [...rxDispenseIds, ...extraIds]
    if (!allDispenseIds.length) return

    generatePharmacyBill({ patientId, dispenseIds: allDispenseIds }).then((res) => {
      if (res.success) {
        setBillInfoMap((prev) => new Map([...prev, [patientId, { billId: res.billId, billNo: res.billNo, status: 'unpaid' }]]))
        setPatientDispenseIds((prev) => new Map([...prev, [patientId, allDispenseIds]]))
      }
    })
  }

  async function handleCheckPayment(patientId: string) {
    const info = billInfoMap.get(patientId)
    if (!info) return
    const result = await checkBillStatus(info.billId)
    if (result) setBillInfoMap((prev) => new Map([...prev, [patientId, { ...info, status: result.status }]]))
  }

  async function handleDispatch(patientId: string): Promise<string | undefined> {
    const info = billInfoMap.get(patientId)
    const dispenseIds = patientDispenseIds.get(patientId) ?? []
    if (!info || !dispenseIds.length) return 'Missing bill or dispense info'
    const result = await dispatchMedicines({ patientId, dispenseIds, billId: info.billId })
    if (!result.success) return result.error
    setDispatchedPatients((prev) => new Set([...prev, patientId]))
    setAwaitingDispatch((prev) => prev.filter((p) => p.patient_id !== patientId))
  }

  async function handleAddAndPack(patientId: string, drugId: string, qty: number): Promise<string | undefined> {
    const result = await dispenseDrug({ patient_id: patientId, prescription_id: null, drug_id: drugId, qty })
    if (!result.success) return result.error

    const newExtra = new Map([...extraByPatient])
    newExtra.set(patientId, [...(newExtra.get(patientId) ?? []), result.dispenseId])
    setExtraByPatient(newExtra)

    tryBill(patientId, dispensedIds, dispenseIdMap, newExtra, skippedRxIds)
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

      {/* Tabs — scrollable on mobile, compact on small screens */}
      <div className="overflow-x-auto mb-5 -mx-4 px-4">
        <div className="flex gap-1 p-1 rounded-xl w-max"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
          {([
            { key: 'cart' as TabKey,   label: 'Sale Cart',   shortLabel: 'Cart',    count: initialReadySales.length },
            { key: 'queue' as TabKey,  label: 'Dispense',    shortLabel: 'Dispense', count: pending.length },
            { key: 'ipd' as TabKey,    label: 'IPD Ward',    shortLabel: 'IPD',     count: ipdPendingCount, urgent: ipdPendingCount > 0 },
            { key: 'stock' as TabKey,  label: 'Stock',       shortLabel: 'Stock',   count: stock.length },
            { key: 'alerts' as TabKey, label: 'Alerts',      shortLabel: 'Alerts',  count: alertCount, urgent: alertCount > 0 },
          ]).map(({ key, label, shortLabel, count, urgent }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 rounded-lg text-sm font-medium flex-shrink-0"
              style={{
                ...(tab === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }),
                padding: '6px 10px',
              }}>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={tab === key
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : urgent ? { background: '#FEE2E2', color: '#DC2626' } : { background: '#F1F5F9', color: '#64748B' }}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'cart' && canSale && (
        <SaleCartBuilder drugs={drugs} initialReadySales={initialReadySales} allPatients={allPatients} />
      )}
      {tab === 'cart' && !canSale && (
        <p className="text-sm p-4" style={{ color: '#64748B' }}>You don&apos;t have permission to manage sale carts.</p>
      )}

      {tab === 'queue' && (
        <DispenseQueue
          pending={pending}
          awaitingDispatch={awaitingDispatch}
          drugs={drugs}
          skippedRxIds={skippedRxIds}
          dispensedIds={dispensedIds}
          extraByPatient={extraByPatient}
          billInfoMap={billInfoMap}
          dispatchedPatients={dispatchedPatients}
          canDispense={canDispense}
          onDispense={setDispenseRx}
          onSkipRx={(rxId) => setSkippedRxIds((prev) => new Set([...prev, rxId]))}
          onUnSkipRx={(rxId) => setSkippedRxIds((prev) => { const n = new Set(prev); n.delete(rxId); return n })}
          onAddAndPack={handleAddAndPack}
          onCheckPayment={handleCheckPayment}
          onDispatch={handleDispatch}
        />
      )}

      {tab === 'ipd' && (
        <IpdWardQueue
          requests={ipdRequests}
          stock={stock}
          canDispense={canDispense}
          dispensingId={dispensingIpdId}
          onDispense={handleIpdDispense}
        />
      )}
      {tab === 'stock' && <StockView stock={stock} />}
      {tab === 'alerts' && <AlertsView alerts={alerts} />}

      {dispenseRx && (
        <DispenseModal
          open
          prescription={dispenseRx}
          drugs={drugs}
          onClose={() => setDispenseRx(null)}
          onSuccess={(dispenseId) => {
            const rxId = dispenseRx.id
            const patientId = dispenseRx.patient_id
            const newIds = new Set([...dispensedIds, rxId])
            const newMap = new Map([...dispenseIdMap, [rxId, dispenseId]])
            setDispensedIds(newIds)
            setDispenseIdMap(newMap)
            setDispenseRx(null)
            tryBill(patientId, newIds, newMap, extraByPatient, skippedRxIds)
          }}
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

// ---- Dispense Queue ----

type PatientGroup = {
  patient_id: string
  patient_name: string
  patient_uhid: string
  visit_date: string
  prescriptions: PrescriptionWithVisit[]
}

function DispenseQueue({
  pending, awaitingDispatch, drugs,
  skippedRxIds, dispensedIds, extraByPatient, billInfoMap, dispatchedPatients,
  canDispense,
  onDispense, onSkipRx, onUnSkipRx, onAddAndPack, onCheckPayment, onDispatch,
}: {
  pending: PrescriptionWithVisit[]
  awaitingDispatch: AwaitingDispatchPatient[]
  drugs: Drug[]
  skippedRxIds: Set<string>
  dispensedIds: Set<string>
  extraByPatient: Map<string, string[]>
  billInfoMap: Map<string, BillInfo>
  dispatchedPatients: Set<string>
  canDispense: boolean
  onDispense: (rx: PrescriptionWithVisit) => void
  onSkipRx: (rxId: string) => void
  onUnSkipRx: (rxId: string) => void
  onAddAndPack: (patientId: string, drugId: string, qty: number) => Promise<string | undefined>
  onCheckPayment: (patientId: string) => Promise<void>
  onDispatch: (patientId: string) => Promise<string | undefined>
}) {
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set())
  const [addDrugPatient, setAddDrugPatient] = useState<string | null>(null)
  const [addDrugId, setAddDrugId] = useState('')
  const [addDrugQty, setAddDrugQty] = useState(1)
  const [addDrugLoading, setAddDrugLoading] = useState(false)
  const [addDrugError, setAddDrugError] = useState<string | null>(null)
  const [checkingPayment, setCheckingPayment] = useState<Set<string>>(new Set())
  const [dispatching, setDispatching] = useState<Set<string>>(new Set())
  const [dispatchErrors, setDispatchErrors] = useState<Map<string, string>>(new Map())

  function toggleGroup(patientId: string) {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(patientId)) next.delete(patientId); else next.add(patientId)
      return next
    })
  }

  async function submitAddDrug(patientId: string) {
    if (!addDrugId || addDrugQty < 1) return
    setAddDrugLoading(true)
    setAddDrugError(null)
    const err = await onAddAndPack(patientId, addDrugId, addDrugQty)
    setAddDrugLoading(false)
    if (err) { setAddDrugError(err); return }
    setAddDrugPatient(null); setAddDrugId(''); setAddDrugQty(1)
  }

  async function handleCheckPayment(patientId: string) {
    setCheckingPayment((prev) => new Set([...prev, patientId]))
    await onCheckPayment(patientId)
    setCheckingPayment((prev) => { const n = new Set(prev); n.delete(patientId); return n })
  }

  async function handleDispatch(patientId: string) {
    setDispatching((prev) => new Set([...prev, patientId]))
    setDispatchErrors((prev) => { const n = new Map(prev); n.delete(patientId); return n })
    const err = await onDispatch(patientId)
    setDispatching((prev) => { const n = new Set(prev); n.delete(patientId); return n })
    if (err) setDispatchErrors((prev) => new Map([...prev, [patientId, err]]))
  }

  // Build pending groups
  const pendingGroupMap = new Map<string, PatientGroup>()
  for (const rx of pending) {
    if (!pendingGroupMap.has(rx.patient_id)) {
      pendingGroupMap.set(rx.patient_id, {
        patient_id: rx.patient_id, patient_name: rx.patient_name,
        patient_uhid: rx.patient_uhid, visit_date: rx.visit_date, prescriptions: [],
      })
    }
    pendingGroupMap.get(rx.patient_id)!.prescriptions.push(rx)
  }

  // Awaiting dispatch patients not in pending (fully packed, awaiting payment/dispatch)
  const awaitingOnlyGroups = awaitingDispatch.filter(
    (p) => !pendingGroupMap.has(p.patient_id) && !dispatchedPatients.has(p.patient_id)
  )

  const pendingGroups = [...pendingGroupMap.values()].filter(
    (g) => !dispatchedPatients.has(g.patient_id)
  )

  if (pendingGroups.length === 0 && awaitingOnlyGroups.length === 0) {
    return (
      <GlassCard className="p-6">
        <EmptyState title="No pending prescriptions"
          description="All current prescriptions have been dispensed and dispatched."
          icon={<Package className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
      </GlassCard>
    )
  }

  return (
    <div className="space-y-4">
      {/* Packing-phase patients */}
      {pendingGroups.map((group) => {
        const billInfo = billInfoMap.get(group.patient_id)
        const nonSkipped = group.prescriptions.filter((rx) => !skippedRxIds.has(rx.id))
        const skipped = group.prescriptions.filter((rx) => skippedRxIds.has(rx.id))
        const packedCount = nonSkipped.filter((rx) => dispensedIds.has(rx.id)).length
        const totalNonSkipped = nonSkipped.length
        const allRxPacked = totalNonSkipped === 0 || packedCount === totalNonSkipped
        const extraCount = (extraByPatient.get(group.patient_id) ?? []).length
        const allPacked = allRxPacked  // extras are packed immediately when added
        const isExpanded = expandedSet.has(group.patient_id)
        const isBilled = !!billInfo
        const isPaid = billInfo && billInfo.status === 'paid'

        const headerBg = isPaid
          ? 'rgba(16,185,129,0.07)'
          : isBilled
            ? 'rgba(245,158,11,0.05)'
            : allPacked ? 'rgba(13,148,136,0.05)' : 'rgba(13,148,136,0.03)'

        return (
          <GlassCard key={group.patient_id} className="overflow-hidden"
            style={isPaid ? { border: '1.5px solid #6EE7B7' } : isBilled ? { border: '1.5px solid #FDE68A' } : undefined}>

            {/* Patient header — 2-row layout for mobile */}
            <div className="px-4 py-3"
              style={{ background: headerBg, borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none' }}>

              {/* Row 1: avatar + name + chevron */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isPaid ? 'rgba(16,185,129,0.12)' : '#F1F5F9' }}>
                  <User2 className="w-4 h-4" style={{ color: isPaid ? '#059669' : '#94A3B8' }} />
                </div>
                <button type="button" onClick={() => toggleGroup(group.patient_id)}
                  className="flex-1 min-w-0 text-left"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{group.patient_name}</p>
                  <p className="text-xs truncate" style={{ color: '#64748B' }}>
                    {group.patient_uhid}
                    {group.visit_date && <> · <DateText date={group.visit_date} /></>}
                  </p>
                </button>
                <button type="button" onClick={() => toggleGroup(group.patient_id)}
                  className="flex-shrink-0"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />
                    : <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />}
                </button>
              </div>

              {/* Row 2: status badges + action buttons */}
              <div className="flex items-center gap-2 mt-2 flex-wrap" style={{ paddingLeft: '48px' }}>
                {isPaid ? (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                      {billInfo!.billNo}
                    </span>
                    <button
                      onClick={() => handleDispatch(group.patient_id)}
                      disabled={dispatching.has(group.patient_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                      style={{ background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      {dispatching.has(group.patient_id)
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Truck className="w-3 h-3" />}
                      Dispatch
                    </button>
                    {dispatchErrors.get(group.patient_id) && (
                      <span className="text-xs" style={{ color: '#DC2626' }}>
                        {dispatchErrors.get(group.patient_id)}
                      </span>
                    )}
                  </>
                ) : isBilled ? (
                  <>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
                      style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                      {billInfo!.status === 'partial' ? 'Partial — Full Pmt Required' : 'Awaiting Payment'} · {billInfo!.billNo}
                    </span>
                    <button
                      onClick={() => handleCheckPayment(group.patient_id)}
                      disabled={checkingPayment.has(group.patient_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                      style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                      {checkingPayment.has(group.patient_id)
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <CreditCard className="w-3 h-3" />}
                      Check Payment
                    </button>
                  </>
                ) : allPacked ? (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#059669', border: '1px solid #6EE7B7' }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Generating Bill…
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
                    style={{ background: '#FFF7ED', color: '#92400E', border: '1px solid #FED7AA' }}>
                    {totalNonSkipped - packedCount}/{totalNonSkipped} pending
                    {extraCount > 0 && ` · ${extraCount} extra`}
                  </span>
                )}

                {/* Add Drug button (only in packing phase) */}
                {!isBilled && canDispense && (
                  <button
                    onClick={() => {
                      setAddDrugPatient(group.patient_id)
                      setAddDrugId(''); setAddDrugQty(1); setAddDrugError(null)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <Plus className="w-3 h-3" /> Add Drug
                  </button>
                )}
              </div>
            </div>

            {/* Drug rows */}
            {isExpanded && (
              <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {/* Non-skipped prescriptions */}
                {nonSkipped.map((rx) => {
                  const isPacked = dispensedIds.has(rx.id)
                  return (
                    <div key={rx.id} className="flex items-center gap-3 pl-12 pr-4 py-3"
                      style={{ opacity: isPacked ? 0.55 : 1, background: isPacked ? 'rgba(16,185,129,0.03)' : 'transparent' }}>
                      <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                        {isPacked
                          ? <CheckCircle2 className="w-5 h-5" style={{ color: '#10B981' }} />
                          : <Circle className="w-5 h-5" style={{ color: '#CBD5E1' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm mb-1"
                          style={{ color: isPacked ? '#64748B' : '#0F172A', textDecoration: isPacked ? 'line-through' : 'none' }}>
                          {rx.drug_name}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {rx.dosage && (
                            <span className="text-xs flex items-center gap-1">
                              <span className="font-medium" style={{ color: '#94A3B8' }}>Dose</span>
                              <span className="px-1.5 py-0.5 rounded" style={{ background: '#F1F5F9', color: '#334155', fontWeight: 600 }}>{rx.dosage}</span>
                            </span>
                          )}
                          {rx.frequency && (
                            <span className="text-xs flex items-center gap-1">
                              <span className="font-medium" style={{ color: '#94A3B8' }}>Freq</span>
                              <span className="px-1.5 py-0.5 rounded" style={{ background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>{rx.frequency}</span>
                            </span>
                          )}
                          {rx.duration && (
                            <span className="text-xs flex items-center gap-1">
                              <span className="font-medium" style={{ color: '#94A3B8' }}>Dur</span>
                              <span className="px-1.5 py-0.5 rounded" style={{ background: '#FDF4FF', color: '#7E22CE', fontWeight: 600 }}>{rx.duration} days</span>
                            </span>
                          )}
                          {rx.instructions && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                              {rx.instructions}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {isPacked ? (
                          <span className="text-xs px-3 py-1.5 rounded-lg font-medium"
                            style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid #6EE7B7' }}>
                            Packed ✓
                          </span>
                        ) : isBilled ? null : canDispense ? (
                          <>
                            <button onClick={() => onDispense(rx)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                              Pack
                            </button>
                            <button onClick={() => onSkipRx(rx.id)} title="Skip this drug"
                              className="w-6 h-6 flex items-center justify-center rounded-lg"
                              style={{ color: '#94A3B8', background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
                            Pharmacist only
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Extra drugs added by pharmacist */}
                {(extraByPatient.get(group.patient_id) ?? []).map((dispenseId, idx) => (
                  <div key={dispenseId} className="flex items-center gap-3 pl-12 pr-4 py-3"
                    style={{ background: 'rgba(13,148,136,0.03)', opacity: 0.55 }}>
                    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" style={{ color: '#10B981' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: '#64748B', textDecoration: 'line-through' }}>
                        Extra item {idx + 1}
                      </p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>Added by pharmacist · Packed ✓</p>
                    </div>
                    <span className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                      Extra ✓
                    </span>
                  </div>
                ))}

                {/* Skipped prescriptions (faded, restore option) */}
                {skipped.map((rx) => (
                  <div key={rx.id} className="flex items-center gap-3 pl-12 pr-4 py-2.5"
                    style={{ opacity: 0.4, background: '#FAFAFA' }}>
                    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                      <Circle className="w-4 h-4" style={{ color: '#CBD5E1' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: '#94A3B8', textDecoration: 'line-through' }}>
                        {rx.drug_name}
                      </p>
                      <p className="text-xs" style={{ color: '#CBD5E1' }}>Skipped this session</p>
                    </div>
                    <button onClick={() => onUnSkipRx(rx.id)}
                      className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                      Restore
                    </button>
                  </div>
                ))}

                {/* Add Drug inline form */}
                {addDrugPatient === group.patient_id && (
                  <div className="px-4 py-3" style={{ background: 'rgba(13,148,136,0.03)', borderTop: '1px solid #F1F5F9' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#0D9488' }}>Add Extra Drug</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select
                        value={addDrugId}
                        onChange={(e) => setAddDrugId(e.target.value)}
                        className="flex-1"
                        style={{ minWidth: '180px' }}
                      >
                        <option value="">Select drug…</option>
                        {drugs.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}{d.strength ? ` ${d.strength}` : ''}</option>
                        ))}
                      </Select>
                      <input
                        type="number" min={1} value={addDrugQty}
                        onChange={(e) => setAddDrugQty(Number(e.target.value) || 1)}
                        placeholder="Qty"
                        className="w-20 rounded-xl text-sm px-3 py-2"
                        style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A', minHeight: '40px', outline: 'none' }} />
                      <button
                        onClick={() => submitAddDrug(group.patient_id)}
                        disabled={!addDrugId || addDrugQty < 1 || addDrugLoading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                        style={{ background: (!addDrugId || addDrugLoading) ? '#94A3B8' : '#0D9488', border: 'none', cursor: 'pointer', minHeight: '40px' }}>
                        {addDrugLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Add & Pack
                      </button>
                      <button
                        onClick={() => setAddDrugPatient(null)}
                        className="px-3 py-2 rounded-xl text-sm"
                        style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer', minHeight: '40px' }}>
                        Cancel
                      </button>
                    </div>
                    {addDrugError && (
                      <p className="mt-2 text-xs" style={{ color: '#DC2626' }}>{addDrugError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        )
      })}

      {/* Awaiting dispatch patients (from DB — fully packed, not dispatched) */}
      {awaitingOnlyGroups.map((ap) => {
        const billInfo = billInfoMap.get(ap.patient_id) ?? (ap.bill ? { billId: ap.bill.id, billNo: ap.bill.bill_no, status: ap.bill.status } : null)
        const isPaid = billInfo && billInfo.status === 'paid'
        const isExpanded = expandedSet.has(ap.patient_id)

        return (
          <GlassCard key={ap.patient_id} className="overflow-hidden"
            style={isPaid ? { border: '1.5px solid #6EE7B7' } : { border: '1.5px solid #FDE68A' }}>

            {/* 2-row layout for mobile */}
            <div className="px-4 py-3"
              style={{ background: isPaid ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.05)', borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none' }}>

              {/* Row 1: avatar + name + chevron */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isPaid ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}>
                  <User2 className="w-4 h-4" style={{ color: isPaid ? '#059669' : '#D97706' }} />
                </div>
                <button type="button" onClick={() => toggleGroup(ap.patient_id)}
                  className="flex-1 min-w-0 text-left"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{ap.patient_name}</p>
                  <p className="text-xs truncate" style={{ color: '#64748B' }}>{ap.patient_uhid}</p>
                </button>
                <button type="button" onClick={() => toggleGroup(ap.patient_id)}
                  className="flex-shrink-0"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />}
                </button>
              </div>

              {/* Row 2: status + actions */}
              <div className="flex items-center gap-2 mt-2 flex-wrap" style={{ paddingLeft: '48px' }}>
                {isPaid ? (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                      <CheckCircle2 className="w-3 h-3" /> Bill Paid
                    </span>
                    <button
                      onClick={() => handleDispatch(ap.patient_id)}
                      disabled={dispatching.has(ap.patient_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                      style={{ background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      {dispatching.has(ap.patient_id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                      Dispatch
                    </button>
                  </>
                ) : (
                  <>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
                      style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                      {billInfo?.status === 'partial' ? 'Partial — Full Pmt Required' : 'Awaiting Payment'}{billInfo ? ` · ${billInfo.billNo}` : ''}
                    </span>
                    {billInfo && (
                      <button
                        onClick={() => handleCheckPayment(ap.patient_id)}
                        disabled={checkingPayment.has(ap.patient_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                        {checkingPayment.has(ap.patient_id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                        Check Payment
                      </button>
                    )}
                  </>
                )}
                {dispatchErrors.get(ap.patient_id) && (
                  <span className="text-xs" style={{ color: '#DC2626' }}>{dispatchErrors.get(ap.patient_id)}</span>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {ap.drug_names.map((name, i) => (
                  <div key={i} className="flex items-center gap-3 pl-12 pr-4 py-3"
                    style={{ opacity: 0.55, background: 'rgba(16,185,129,0.03)' }}>
                    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" style={{ color: '#10B981' }} />
                    </div>
                    <p className="font-semibold text-sm" style={{ color: '#64748B', textDecoration: 'line-through' }}>{name}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )
      })}
    </div>
  )
}

// ---- Stock View ----

function StockView({ stock }: { stock: DrugWithStock[] }) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? stock.filter((d) => {
        const q = query.toLowerCase()
        return (
          d.name.toLowerCase().includes(q) ||
          (d.generic_name ?? '').toLowerCase().includes(q) ||
          (d.form ?? '').toLowerCase().includes(q) ||
          (d.strength ?? '').toLowerCase().includes(q)
        )
      })
    : stock

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
        <input
          type="text"
          placeholder="Search by drug name, generic, form or strength…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0 }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <GlassCard className="p-6">
          <EmptyState
            title={query ? 'No drugs matched' : 'No drugs in stock'}
            description={query ? `No results for "${query}"` : 'Add drug batches to see stock here.'} />
        </GlassCard>
      )}

      {filtered.map((drug) => {
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

// ---- Alerts View ----

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

// ── IPD Ward Queue ────────────────────────────────────────────────────────────

function autoFillPrice(itemName: string, stock: DrugWithStock[]): number {
  const query = itemName.split(' ')[0].toLowerCase()
  const drug = stock.find((d) =>
    d.name.toLowerCase().startsWith(query) || query.startsWith(d.name.toLowerCase())
  )
  if (!drug) return 0
  const batch = drug.batches.find((b) => b.qty_available > 0)
  return batch?.mrp ?? 0
}

interface IpdWardQueueProps {
  requests: IpdPharmacyRequest[]
  stock: DrugWithStock[]
  canDispense: boolean
  dispensingId: string | null
  onDispense: (id: string, pricePerUnit: number) => void
}

function IpdWardQueue({ requests, stock, canDispense, dispensingId, onDispense }: IpdWardQueueProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')

  const pending   = requests.filter((r) => r.status === 'pending')
  const dispensed = requests.filter((r) => r.status === 'dispensed')

  function startDispense(req: IpdPharmacyRequest) {
    const auto = autoFillPrice(req.item_name, stock)
    setPriceInput(auto > 0 ? String(auto) : '')
    setConfirmingId(req.id)
  }

  function cancelDispense() {
    setConfirmingId(null)
    setPriceInput('')
  }

  function confirmDispense(reqId: string) {
    const price = parseFloat(priceInput) || 0
    onDispense(reqId, price)
    setConfirmingId(null)
    setPriceInput('')
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BedDouble className="w-4 h-4" style={{ color: '#0D9488' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              IPD Ward Requests
              <span className="ml-2 text-xs font-normal" style={{ color: '#94A3B8' }}>
                — no payment required to dispense
              </span>
            </h3>
          </div>

          {pending.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>No pending IPD requests.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((req) => {
                const adm = req.admission
                const isConfirming = confirmingId === req.id
                const isDispatching = dispensingId === req.id
                return (
                  <div key={req.id} className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid rgba(13,148,136,0.2)', background: 'rgba(13,148,136,0.03)' }}>
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-3 py-3 flex-wrap">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{req.item_name}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded-md"
                            style={{ background: '#F1F5F9', color: '#64748B' }}>
                            Qty: {req.quantity}{req.unit ? ` ${req.unit}` : ''}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                          {adm?.patient?.full_name ?? '—'}{' '}
                          <span className="font-mono" style={{ color: '#94A3B8' }}>({adm?.patient?.uhid ?? '—'})</span>
                          {adm?.ward ? ` · ${adm.ward.name}` : ''}
                          {adm?.bed  ? ` Bed ${adm.bed.bed_no}` : ''}
                        </p>
                      </div>
                      {canDispense && !isConfirming && (
                        <button
                          onClick={() => startDispense(req)}
                          disabled={isDispatching}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          <Check className="w-3.5 h-3.5" />
                          {isDispatching ? 'Dispensing…' : 'Dispense'}
                        </button>
                      )}
                    </div>

                    {/* Price confirm panel */}
                    {isConfirming && (
                      <div className="px-3 pb-3 pt-1 flex items-center gap-2 flex-wrap"
                        style={{ borderTop: '1px solid rgba(13,148,136,0.15)', background: 'rgba(13,148,136,0.06)' }}>
                        <span className="text-xs font-medium flex-shrink-0" style={{ color: '#0F172A' }}>
                          Price per unit (₹)
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceInput}
                          onChange={(e) => setPriceInput(e.target.value)}
                          placeholder="Enter MRP"
                          className="w-28 px-2 py-1 rounded-lg text-xs"
                          style={{ border: '1px solid #CBD5E1', outline: 'none', color: '#0F172A' }}
                          autoFocus
                        />
                        {priceInput && parseFloat(priceInput) > 0 && (
                          <span className="text-xs" style={{ color: '#64748B' }}>
                            × {req.quantity} = ₹{(parseFloat(priceInput) * req.quantity).toFixed(2)}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                          <button onClick={cancelDispense}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                            style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button
                            onClick={() => confirmDispense(req.id)}
                            disabled={isDispatching}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                            <Check className="w-3 h-3" />
                            {isDispatching ? 'Dispensing…' : 'Confirm Dispense'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </GlassCard>

      {dispensed.length > 0 && (
        <GlassCard>
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#94A3B8' }}>
              Dispensed ({dispensed.length})
            </h3>
            <div className="space-y-1.5">
              {dispensed.map((req) => (
                <div key={req.id} className="flex items-center justify-between text-xs py-1.5"
                  style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                    <span style={{ color: '#0F172A' }}>{req.item_name}</span>
                    <span style={{ color: '#94A3B8' }}>{req.admission?.patient?.full_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {req.price_snapshot > 0 && (
                      <span className="font-medium" style={{ color: '#0D9488' }}>
                        ₹{(req.price_snapshot * req.quantity).toFixed(2)}
                      </span>
                    )}
                    <span style={{ color: '#64748B' }}>
                      {req.dispensed_at ? new Date(req.dispensed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
