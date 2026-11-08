'use client'

import Link from 'next/link'
import { useState } from 'react'
import SetupNudge from '@/components/ui/SetupNudge'
import {
  Plus, RefreshCw, AlertTriangle, Package,
  CheckCircle2, Circle, User2, ChevronDown, ChevronRight,
  X, Loader2, Truck, CreditCard, Search, BedDouble, Check, Pencil, Printer,
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
  updateBatch, updateDrugReorderLevel, updateDrugCategory, ensureBatchLabels,
} from '@/app/actions/pharmacy'
import { listIpdPharmacyRequests, dispenseIpdRequest } from '@/app/actions/ipdTreatment'
import VaccinesView from './VaccinesView'
import H1RegisterView from './H1RegisterView'
import type { VaccineOrder, VaccineSupply } from '@/app/actions/vaccination'
import type { DrugWithStock, PrescriptionWithVisit, PharmacySale, Patient, IpdPharmacyRequest } from '@/lib/types'
import type { PharmacyAlerts, RichBatch, AwaitingDispatchPatient, DispatchedPatientHistory } from '@/app/actions/pharmacy'
import { listDispatchedHistory } from '@/app/actions/pharmacy'
import { listPharmacySales } from '@/app/actions/pharmacySale'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import Select from '@/components/ui/Select'
import { useDrugSearch } from '@/lib/hooks/useDrugSearch'
import DispenseModal from './DispenseModal'
import SaleCartBuilder from './SaleCartBuilder'

type TabKey = 'cart' | 'queue' | 'ipd' | 'vaccines' | 'stock' | 'alerts' | 'h1'
type BillInfo = { billId: string; billNo: string; status: string }

interface Props {
  initialPending: PrescriptionWithVisit[]
  initialStock: DrugWithStock[]
  initialAlerts: PharmacyAlerts
  initialReadySales: PharmacySale[]
  initialFulfilledSales: PharmacySale[]
  allPatients: Patient[]
  initialAwaitingDispatch: AwaitingDispatchPatient[]
  initialIpdRequests: IpdPharmacyRequest[]
  initialOpdHistory: DispatchedPatientHistory[]
  initialVaccineOrders: VaccineOrder[]
  initialVaccineStock: VaccineSupply[]
  /** Whether this hospital makes medicines wait for payment (Settings → Billing & Collections). */
  pharmacyPayFirst?: boolean
}

export default function PharmacyClient({
  initialPending, initialStock, initialAlerts,
  initialReadySales, initialFulfilledSales, allPatients, initialAwaitingDispatch,
  initialIpdRequests, initialOpdHistory, initialVaccineOrders, initialVaccineStock,
  pharmacyPayFirst = true,
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
  const [opdHistory, setOpdHistory] = useState(initialOpdHistory)
  const [fulfilledSales, setFulfilledSales] = useState(initialFulfilledSales)

  const alertCount = alerts.lowStock.length + alerts.nearExpiry.length + alerts.expired.length
  const ipdPendingCount = ipdRequests.filter((r) => r.status === 'pending').length

  async function refresh() {
    setLoading(true)
    const [p, s, a, aw, ipd, hist, fulfilled] = await Promise.all([
      listPendingPrescriptions(), getStock(), getAlerts(), listPackedAwaitingDispatch(),
      listIpdPharmacyRequests(), listDispatchedHistory(), listPharmacySales({ status: 'fulfilled' }),
    ])
    setPending(p); setStock(s); setAlerts(a); setAwaitingDispatch(aw)
    setIpdRequests(ipd); setOpdHistory(hist); setFulfilledSales(fulfilled)
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
              <Link href="/pharmacy/receive"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Plus className="w-4 h-4" /> Receive stock
              </Link>
            )}
          </div>
        }
      />

      {stock.length === 0 && <SetupNudge message="Add medicines & stock to start dispensing" />}

      {/* Tabs — scrollable on mobile, compact on small screens */}
      <div className="overflow-x-auto mb-5 -mx-4 px-4">
        <div className="flex gap-1 p-1 rounded-xl w-max"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
          {([
            { key: 'cart' as TabKey,   label: 'Sale Cart',   shortLabel: 'Cart',    count: initialReadySales.length },
            { key: 'queue' as TabKey,  label: 'Dispense',    shortLabel: 'Dispense', count: pending.length },
            { key: 'ipd' as TabKey,    label: 'IPD Ward',    shortLabel: 'IPD',     count: ipdPendingCount, urgent: ipdPendingCount > 0 },
            ...(initialVaccineStock.some((v) => v.products.length > 0 || v.free_supply) || initialVaccineOrders.length
              ? [{ key: 'vaccines' as TabKey, label: 'Vaccines', shortLabel: 'Vax', count: initialVaccineOrders.filter((o) => o.fulfilment === 'pending').length, urgent: initialVaccineOrders.some((o) => o.fulfilment === 'pending' && (!o.bill || o.bill.paid < o.bill.total)) }]
              : [{ key: 'vaccines' as TabKey, label: 'Vaccines', shortLabel: 'Vax', count: 0 }]),
            { key: 'stock' as TabKey,  label: 'Stock',       shortLabel: 'Stock',   count: stock.length },
            { key: 'alerts' as TabKey, label: 'Alerts',      shortLabel: 'Alerts',  count: alertCount, urgent: alertCount > 0 },
            { key: 'h1' as TabKey,     label: 'H1 Register', shortLabel: 'H1',      count: null },
          ]).map(({ key, label, shortLabel, count, urgent }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 rounded-lg text-sm font-medium flex-shrink-0"
              style={{
                ...(tab === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }),
                padding: '6px 10px',
              }}>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
              {count != null && (
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={tab === key
                    ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : urgent ? { background: '#FEE2E2', color: '#DC2626' } : { background: '#F1F5F9', color: '#64748B' }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'cart' && canSale && (
        <SaleCartBuilder drugs={stock} initialReadySales={initialReadySales} initialFulfilledSales={fulfilledSales} allPatients={allPatients} payFirst={pharmacyPayFirst} />
      )}
      {tab === 'cart' && !canSale && (
        <p className="text-sm p-4" style={{ color: '#64748B' }}>You don&apos;t have permission to manage sale carts.</p>
      )}

      {tab === 'queue' && (
        <DispenseQueue
          pending={pending}
          awaitingDispatch={awaitingDispatch}
          skippedRxIds={skippedRxIds}
          dispensedIds={dispensedIds}
          extraByPatient={extraByPatient}
          billInfoMap={billInfoMap}
          dispatchedPatients={dispatchedPatients}
          canDispense={canDispense}
          payFirst={pharmacyPayFirst}
          dispatchedHistory={opdHistory}
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
      {tab === 'vaccines' && (
        <VaccinesView initialOrders={initialVaccineOrders} initialStock={initialVaccineStock} canDispense={canDispense} canManage={canManage} />
      )}
      {tab === 'stock' && <StockView stock={stock} canManage={canManage} onRefresh={refresh} />}
      {tab === 'alerts' && <AlertsView alerts={alerts} />}

      {tab === 'h1' && <H1RegisterView />}

      {dispenseRx && (
        <DispenseModal
          open
          prescription={dispenseRx}
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

// Typeahead for adding an extra drug — searches the catalogue server-side
// (it's too large to render as a full <select>).
function AddDrugSelect({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const [open, setOpen] = useState(false)
  const results = useDrugSearch(q, 12)

  if (label) {
    return (
      <div className="flex-1 flex items-center gap-2" style={{ minWidth: '180px' }}>
        <div className="flex-1 px-3 py-2 rounded-xl text-sm truncate" style={{ border: '1px solid #0D9488', background: '#fff', color: '#0F172A', minHeight: '40px' }}>{label}</div>
        <button type="button" onClick={() => { setLabel(''); setQ(''); onSelect('') }}
          className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Change</button>
      </div>
    )
  }
  return (
    <div className="relative flex-1" style={{ minWidth: '180px' }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search drug by brand or generic…" autoComplete="off"
        className="w-full rounded-xl text-sm px-3 py-2" style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A', minHeight: '40px', outline: 'none' }} />
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-y-auto"
          style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {results.map((d) => {
            const lbl = `${d.name}${d.strength ? ' ' + d.strength : ''}`
            return (
              <div key={d.id} onMouseDown={() => { onSelect(d.id); setLabel(lbl); setOpen(false) }}
                className="px-3 py-2 text-sm cursor-pointer" style={{ borderBottom: '1px solid #F1F5F9', color: '#1E293B' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F0FDFA')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                {lbl}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DispenseQueue({
  pending, awaitingDispatch,
  skippedRxIds, dispensedIds, extraByPatient, billInfoMap, dispatchedPatients,
  canDispense, payFirst, dispatchedHistory,
  onDispense, onSkipRx, onUnSkipRx, onAddAndPack, onCheckPayment, onDispatch,
}: {
  /** false = this hospital hands medicines over before payment; the bill is collected later. */
  payFirst: boolean
  pending: PrescriptionWithVisit[]
  awaitingDispatch: AwaitingDispatchPatient[]
  skippedRxIds: Set<string>
  dispensedIds: Set<string>
  extraByPatient: Map<string, string[]>
  billInfoMap: Map<string, BillInfo>
  dispatchedPatients: Set<string>
  canDispense: boolean
  dispatchedHistory: DispatchedPatientHistory[]
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
    <>
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
        // Dispatch waits for payment only where the hospital takes it first.
        const canDispatch = isPaid || (!payFirst && isBilled && billInfo!.status !== 'cancelled')

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
                {canDispatch ? (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={isPaid ? { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' } : { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                      {isPaid ? '' : 'Unpaid — collect at billing · '}{billInfo!.billNo}
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
                      <AddDrugSelect onSelect={setAddDrugId} />
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
        const canDispatch = isPaid || (!payFirst && !!billInfo && billInfo.status !== 'cancelled')
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
                {canDispatch ? (
                  <>
                    {isPaid ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                        style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                        <CheckCircle2 className="w-3 h-3" /> Bill Paid
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
                        style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                        Unpaid — collect at billing{billInfo ? ` · ${billInfo.billNo}` : ''}
                      </span>
                    )}
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
    {/* ── OPD Dispatch History ── */}
    {dispatchedHistory.length > 0 && (
      <div className="mt-6">
        <OpdDispatchHistory history={dispatchedHistory} />
      </div>
    )}
    </>
  )
}

function OpdDispatchHistory({ history }: { history: DispatchedPatientHistory[] }) {
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setExpandedSet(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  return (
    <GlassCard>
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: '#94A3B8' }}>
          Recently Dispatched (last 7 days · {history.length} patient{history.length !== 1 ? 's' : ''})
        </h3>
        <div className="space-y-1.5">
          {history.map((p) => {
            const isOpen = expandedSet.has(p.patient_id)
            return (
              <div key={p.patient_id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                <button onClick={() => toggle(p.patient_id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                  style={{ background: isOpen ? 'rgba(16,185,129,0.05)' : '#FAFAFA', border: 'none', cursor: 'pointer' }}>
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#94A3B8' }} />
                           : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#94A3B8' }} />}
                  <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{p.patient_name}</span>
                    {p.patient_uhid && <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{p.patient_uhid}</span>}
                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                      {new Date(p.dispatched_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F1F5F9', color: '#64748B' }}>
                      {p.items.length} item{p.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {p.total > 0 && <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#0D9488' }}>₹{p.total.toFixed(2)}</span>}
                </button>
                {isOpen && (
                  <div className="px-5 py-1.5 space-y-1 border-t" style={{ borderColor: '#F1F5F9' }}>
                    {p.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1" style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <div className="flex items-center gap-2">
                          <Check className="w-3 h-3 flex-shrink-0" style={{ color: '#10B981' }} />
                          <span style={{ color: '#0F172A' }}>{item.name}</span>
                          <span style={{ color: '#94A3B8' }}>× {item.qty}</span>
                        </div>
                        {item.total > 0 && <span className="font-medium" style={{ color: '#0D9488' }}>₹{item.total.toFixed(2)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </GlassCard>
  )
}

// ---- Stock View ----

type BatchDraft = { batch_no: string; expiry: string; qty_available: string; mrp: string; purchase_price: string; storage_location: string }

type StockFilter = 'all' | 'low' | 'expiring' | 'out' | 'vaccines'
type StockSort = 'name' | 'qty' | 'expiry' | 'value'

/** A batch this close to expiry should be used, returned or written off. */
const EXPIRING_DAYS = 90

function daysUntil(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(date + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
}

/** "18 days" / "3 months" — how long a batch has left, in words a shelf uses. */
function expiryIn(days: number): string {
  if (days < 0) return 'expired'
  if (days === 0) return 'today'
  if (days < 45) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.round(days / 30)
  if (months < 18) return `${months} month${months === 1 ? '' : 's'}`
  return `${Math.round(days / 365)} years`
}

/** What one medicine looks like on the shelf, worked out once per render. */
type StockRow = {
  drug: DrugWithStock
  title: string
  subtitle: string
  low: boolean
  out: boolean
  value: number
  soonestDays: number | null
  expiring: boolean
  expiringBatches: number
}

function buildRow(d: DrugWithStock): StockRow {
  const brand = (d.stocked_brands ?? [])[0]
  const title = brand ?? d.name
  const subtitleParts = [brand ? d.name : d.generic_name, d.strength].filter(Boolean)
  const soonest = d.batches.length
    ? d.batches.reduce((a, b) => (a.expiry <= b.expiry ? a : b)).expiry
    : null
  const soonestDays = soonest ? daysUntil(soonest) : null
  return {
    drug: d,
    title,
    subtitle: subtitleParts.join(' · '),
    low: d.total_qty > 0 && d.total_qty <= (d.reorder_level ?? 0),
    out: d.total_qty <= 0,
    value: d.batches.reduce((s, b) => s + b.qty_available * (b.mrp ?? 0), 0),
    soonestDays,
    expiring: soonestDays !== null && soonestDays <= EXPIRING_DAYS,
    expiringBatches: d.batches.filter(b => daysUntil(b.expiry) <= EXPIRING_DAYS).length,
  }
}

function StockView({ stock, canManage, onRefresh }: {
  stock: DrugWithStock[]; canManage: boolean; onRefresh: () => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [sort, setSort] = useState<StockSort>('name')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [reorderDraft, setReorderDraft] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [batchDrafts, setBatchDrafts] = useState<Record<string, BatchDraft>>({})
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const rows = stock.map(buildRow)

  const q = query.trim().toLowerCase()
  const searched = q
    ? rows.filter((r) => {
        const d = r.drug
        return (
          d.name.toLowerCase().includes(q) ||
          (d.generic_name ?? '').toLowerCase().includes(q) ||
          (d.form ?? '').toLowerCase().includes(q) ||
          (d.strength ?? '').toLowerCase().includes(q) ||
          (d.stocked_brands ?? []).some(b => b.toLowerCase().includes(q)) ||
          (d.brand_aliases ?? []).some(b => b.toLowerCase().includes(q)) ||
          d.batches.some(b =>
            b.batch_no.toLowerCase().includes(q) ||
            (b.storage_location ?? '').toLowerCase().includes(q))
        )
      })
    : rows

  const counts = {
    all: searched.length,
    low: searched.filter(r => r.low).length,
    expiring: searched.filter(r => r.expiring).length,
    out: searched.filter(r => r.out).length,
    vaccines: searched.filter(r => r.drug.is_vaccine).length,
  }

  const filtered = searched.filter((r) =>
    filter === 'low' ? r.low
    : filter === 'expiring' ? r.expiring
    : filter === 'out' ? r.out
    : filter === 'vaccines' ? !!r.drug.is_vaccine
    : true)

  // The categories this hospital already uses, so the box suggests their own
  // words rather than inventing a taxonomy for them.
  const categoryOptions = [...new Set(rows.map((r) => r.drug.form).filter(Boolean) as string[])].sort()

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'qty') return a.drug.total_qty - b.drug.total_qty || a.title.localeCompare(b.title)
    if (sort === 'value') return b.value - a.value || a.title.localeCompare(b.title)
    if (sort === 'expiry') {
      if (a.soonestDays === null) return b.soonestDays === null ? a.title.localeCompare(b.title) : 1
      if (b.soonestDays === null) return -1
      return a.soonestDays - b.soonestDays || a.title.localeCompare(b.title)
    }
    return a.title.localeCompare(b.title)
  })

  const totalUnits = sorted.reduce((s, r) => s + r.drug.total_qty, 0)
  const totalValue = sorted.reduce((s, r) => s + r.value, 0)

  function openEdit(drug: DrugWithStock) {
    setEditId(drug.id)
    setOpenId(drug.id)
    setReorderDraft(String(drug.reorder_level ?? 0))
    setCategoryDraft(drug.form ?? '')
    const drafts: Record<string, BatchDraft> = {}
    drug.batches.forEach(b => {
      drafts[b.id] = {
        batch_no: b.batch_no,
        expiry: b.expiry,
        qty_available: String(b.qty_available),
        mrp: String(b.mrp),
        purchase_price: b.purchase_price != null ? String(b.purchase_price) : '',
        storage_location: b.storage_location ?? '',
      }
    })
    setBatchDrafts(drafts)
    setSaveErr('')
  }

  async function saveEdit(drug: DrugWithStock) {
    setSaving(true); setSaveErr('')
    const reorder = parseInt(reorderDraft, 10)
    if (isNaN(reorder) || reorder < 0) { setSaveErr('The alert quantity must be 0 or more'); setSaving(false); return }

    // Save reorder level if changed
    if (reorder !== (drug.reorder_level ?? 0)) {
      const res = await updateDrugReorderLevel(drug.id, reorder)
      if (!res.success) { setSaveErr(res.error); setSaving(false); return }
    }

    // Category — only on a hospital's own record; a catalogue drug's form is
    // shared by every hospital, so the field is not shown for those.
    if (!drug.is_global && categoryDraft.trim() !== (drug.form ?? '')) {
      const res = await updateDrugCategory(drug.id, categoryDraft.trim() || null)
      if (!res.success) { setSaveErr(res.error); setSaving(false); return }
    }

    // Save each modified batch
    for (const b of drug.batches) {
      const d = batchDrafts[b.id]
      if (!d) continue
      const qty = parseInt(d.qty_available, 10)
      const mrp = parseFloat(d.mrp)
      const pp  = d.purchase_price ? parseFloat(d.purchase_price) : null
      if (!d.batch_no.trim()) { setSaveErr(`Batch number required for ${b.batch_no}`); setSaving(false); return }
      if (!d.expiry)           { setSaveErr(`Expiry required for ${b.batch_no}`); setSaving(false); return }
      if (isNaN(qty) || qty < 0) { setSaveErr(`Invalid qty for ${b.batch_no}`); setSaving(false); return }
      if (isNaN(mrp) || mrp < 0) { setSaveErr(`Invalid MRP for ${b.batch_no}`); setSaving(false); return }
      const loc = d.storage_location.trim() || null
      const changed = d.batch_no !== b.batch_no || d.expiry !== b.expiry ||
        qty !== b.qty_available || mrp !== b.mrp || pp !== b.purchase_price ||
        loc !== (b.storage_location ?? null)
      if (changed) {
        const res = await updateBatch(b.id, { batch_no: d.batch_no.trim(), expiry: d.expiry, qty_available: qty, mrp, purchase_price: pp, storage_location: loc })
        if (!res.success) { setSaveErr(res.error); setSaving(false); return }
      }
    }

    setSaving(false); setEditId(null)
    onRefresh()
  }

  const inp = 'px-2 py-1.5 rounded-lg text-xs border w-full'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  const chips: Array<{ key: StockFilter; label: string; count: number; tone: string }> = [
    { key: 'all',      label: 'All',           count: counts.all,      tone: '#0D9488' },
    { key: 'low',      label: 'Running low',   count: counts.low,      tone: '#DC2626' },
    { key: 'expiring', label: 'Expiring soon', count: counts.expiring, tone: '#D97706' },
    { key: 'out',      label: 'Out of stock',  count: counts.out,      tone: '#64748B' },
    { key: 'vaccines', label: 'Vaccines',      count: counts.vaccines, tone: '#7C3AED' },
  ]

  const emptyTitle = q ? 'Nothing matched' : filter === 'all' ? 'No medicines yet' : 'Nothing here'
  const emptyDesc =
    q ? `No medicine, brand, batch or rack matches "${query}"`
    : filter === 'low' ? 'Every medicine is above the quantity it alerts at.'
    : filter === 'expiring' ? `No batch expires within ${EXPIRING_DAYS} days.`
    : filter === 'out' ? 'Nothing has run out.'
    : filter === 'vaccines' ? 'No vaccine is linked to a stocked product yet.'
    : 'Receive a purchase invoice to fill the shelf.'

  return (
    <div className="space-y-3">
      {/* Search + sort */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
          <input type="text" placeholder="Search brand, salt, batch number or rack…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0 }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div style={{ width: 176 }}>
          <Select value={sort} onChange={(e) => setSort(e.target.value as StockSort)}>
            <option value="name">Name A–Z</option>
            <option value="qty">Least stock first</option>
            <option value="expiry">Expiring first</option>
            <option value="value">Highest value</option>
          </Select>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {chips.map((c) => {
          const on = filter === c.key
          const dim = c.count === 0 && !on
          return (
            <button key={c.key} type="button" onClick={() => setFilter(c.key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
              style={{
                background: on ? c.tone : '#fff',
                color: on ? '#fff' : dim ? '#94A3B8' : c.tone,
                border: `1px solid ${on ? c.tone : '#E2E8F0'}`,
                cursor: 'pointer', minHeight: 34,
              }}>
              {c.label}
              <span className="px-1.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,0.25)' : '#F1F5F9', color: on ? '#fff' : '#64748B' }}>{c.count}</span>
            </button>
          )
        })}
      </div>

      {sorted.length > 0 && (
        <p className="text-xs" style={{ color: '#64748B' }}>
          {sorted.length} medicine{sorted.length === 1 ? '' : 's'} · {totalUnits} units · <Money amount={totalValue} /> at MRP
        </p>
      )}

      {sorted.length === 0 && (
        <GlassCard className="p-6">
          <EmptyState title={emptyTitle} description={emptyDesc} />
        </GlassCard>
      )}

      {sorted.map(({ drug, title, subtitle, low, out, value, soonestDays, expiringBatches }) => {
        const isEditing = editId === drug.id
        const isOpen = openId === drug.id || isEditing
        const unit = (drug.form ?? drug.unit ?? 'units').toLowerCase()

        return (
          <GlassCard key={drug.id} className="p-3">
            <div className="flex items-start gap-2">
              {/* Header — tap anywhere to see the batches */}
              <button type="button" onClick={() => { if (!isEditing) setOpenId(isOpen ? null : drug.id) }}
                className="flex-1 min-w-0 flex items-start gap-2 text-left"
                style={{ background: 'none', border: 'none', padding: 0, cursor: isEditing ? 'default' : 'pointer' }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: '#94A3B8' }}>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>{title}</span>
                    {drug.form && <span className="text-xs px-1.5 py-0.5 rounded-md capitalize" style={{ background: '#F1F5F9', color: '#475569' }}>{drug.form}</span>}
                    {drug.is_vaccine && <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold" style={{ background: '#F5F3FF', color: '#7C3AED' }}>Vaccine</span>}
                    {/* H1 and X carry a legal register duty — worth seeing before it is handed over. */}
                    {(drug.schedule === 'H1' || drug.schedule === 'X') && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold"
                        title="Every supply is written to the Schedule H1 register"
                        style={{ background: '#FEE2E2', color: '#B91C1C' }}>Schedule {drug.schedule}</span>
                    )}
                    {out && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#F1F5F9', color: '#64748B' }}>Out of stock</span>}
                    {low && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                        <AlertTriangle className="w-3 h-3" /> Running low
                      </span>
                    )}
                    {soonestDays !== null && soonestDays <= EXPIRING_DAYS && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#FEF3C7', color: '#B45309' }}>
                        {expiringBatches === drug.batches.length
                          ? `expires in ${expiryIn(soonestDays)}`
                          : `${expiringBatches} of ${drug.batches.length} batches expiring`}
                      </span>
                    )}
                  </span>
                  {subtitle && <span className="block text-xs mt-0.5" style={{ color: '#64748B' }}>{subtitle}</span>}
                </span>
                <span className="text-right flex-shrink-0 pl-2">
                  <span className="block text-sm font-bold" style={{ color: out ? '#64748B' : low ? '#DC2626' : '#0D9488' }}>
                    {drug.total_qty} <span className="text-xs font-normal" style={{ color: '#64748B' }}>{unit}</span>
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {(drug.reorder_level ?? 0) > 0 ? <>alerts below {drug.reorder_level}</> : <Money amount={value} />}
                  </span>
                </span>
              </button>

              {canManage && !isEditing && (
                <button onClick={() => openEdit(drug)} title="Edit stock"
                  className="p-1.5 rounded-lg flex-shrink-0"
                  style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* ── Batches ── */}
            {isOpen && !isEditing && (
              <div className="mt-3 pl-6 space-y-1.5">
                {drug.batches.length === 0 && (
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    Nothing on the shelf — everything received has been used or has expired.
                  </p>
                )}
                {drug.batches.map((b) => {
                  const dl = daysUntil(b.expiry)
                  const soon = dl <= EXPIRING_DAYS
                  return (
                    <div key={b.id} className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs rounded-lg px-2.5 py-1.5"
                      style={{ background: soon ? '#FFFBEB' : '#F8FAFC', border: `1px solid ${soon ? '#FDE68A' : '#E2E8F0'}` }}>
                      <span className="font-mono font-medium" style={{ color: '#0F172A' }}>{b.batch_no}</span>
                      <span style={{ color: soon ? '#B45309' : '#64748B' }}>exp <DateText date={b.expiry} /> · {expiryIn(dl)}</span>
                      <span className="font-semibold" style={{ color: '#0D9488' }}>{b.qty_available} {unit}</span>
                      <span style={{ color: '#64748B' }}><Money amount={b.mrp} /> each</span>
                      {b.storage_location && <span style={{ color: '#7C3AED' }}>📍 {b.storage_location}</span>}
                      {b.supplier_name && <span style={{ color: '#94A3B8' }}>{b.supplier_name}</span>}
                    </div>
                  )
                })}
                {canManage && (
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <Link href={`/pharmacy/receive?q=${encodeURIComponent(title)}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold"
                      style={{ color: '#0D9488', textDecoration: 'none' }}>
                      <Plus className="w-3 h-3" /> Receive more
                    </Link>
                    {drug.batches.length > 0 && (
                      <button
                        onClick={async () => {
                          const ids = drug.batches.map((b) => b.id)
                          const res = await ensureBatchLabels(ids)
                          if (!res.success) return
                          window.open(`/print/batch-labels/pdf?ids=${ids.join(',')}`, '_blank')
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C3AED', padding: 0 }}>
                        <Printer className="w-3 h-3" /> Print shelf labels
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Edit mode ── */}
            {isEditing && (
              <div className="mt-3 pl-6 space-y-3">
                {/* The minimum stock quantity the low-stock alert runs on.
                    Called the same thing here as on the receive screen, because
                    it is the same number — and 0 is a real answer, not a blank:
                    plenty on a hospital's shelf is never reordered. */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium flex-shrink-0" style={{ color: '#64748B' }}>Alert below</label>
                  <input type="number" min={0} step={1} value={reorderDraft}
                    onChange={e => setReorderDraft(e.target.value)}
                    placeholder="off"
                    className={inp} style={{ ...bdr, maxWidth: 100 }} />
                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                    {Number(reorderDraft) > 0
                      ? <>show as running low at or below {reorderDraft} {unit}</>
                      : <>0 — no low-stock alert for this medicine</>}
                  </span>
                </div>

                {/* Category. Free text with the categories already in use offered
                    as suggestions, so a hospital keeps its own vocabulary
                    instead of being given ours — and so a list of 600 medicines
                    does not grow 600 one-off spellings either. Not offered for a
                    catalogue medicine: that form is shared by every hospital. */}
                {!drug.is_global && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-xs font-medium flex-shrink-0" style={{ color: '#64748B' }}>Category</label>
                    <input list="drug-category-options" value={categoryDraft}
                      onChange={e => setCategoryDraft(e.target.value)}
                      placeholder="e.g. Syringe / needle"
                      className={inp} style={{ ...bdr, maxWidth: 240 }} />
                    <datalist id="drug-category-options">
                      {categoryOptions.map((c) => <option key={c} value={c} />)}
                    </datalist>
                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                      shown beside the name, and searchable — leave blank if none fits
                    </span>
                  </div>
                )}

                {/* Batch rows — card layout on mobile, grid on desktop */}
                {drug.batches.length > 0 && (
                  <div className="space-y-2">
                    {drug.batches.map((b, i) => {
                      const d = batchDrafts[b.id] ?? { batch_no: b.batch_no, expiry: b.expiry, qty_available: String(b.qty_available), mrp: String(b.mrp), purchase_price: '', storage_location: '' }
                      return (
                        <div key={b.id} className="rounded-xl p-3 space-y-2"
                          style={{ border: '1px solid #E2E8F0', background: i % 2 === 0 ? '#FAFCFF' : '#fff' }}>
                          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div>
                              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Batch No.</p>
                              <input value={d.batch_no} onChange={e => setBatchDrafts(p => ({ ...p, [b.id]: { ...p[b.id], batch_no: e.target.value } }))}
                                className={inp} style={bdr} />
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Expiry</p>
                              <input type="date" value={d.expiry} onChange={e => setBatchDrafts(p => ({ ...p, [b.id]: { ...p[b.id], expiry: e.target.value } }))}
                                className={inp} style={bdr} />
                            </div>
                          </div>
                          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                            <div>
                              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Qty</p>
                              <input type="number" min={0} step={1} value={d.qty_available} onChange={e => setBatchDrafts(p => ({ ...p, [b.id]: { ...p[b.id], qty_available: e.target.value } }))}
                                className={inp} style={bdr} />
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>MRP (₹)</p>
                              <input type="number" min={0} step="0.01" value={d.mrp} onChange={e => setBatchDrafts(p => ({ ...p, [b.id]: { ...p[b.id], mrp: e.target.value } }))}
                                className={inp} style={bdr} />
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Cost (₹)</p>
                              <input type="number" min={0} step="0.01" value={d.purchase_price} onChange={e => setBatchDrafts(p => ({ ...p, [b.id]: { ...p[b.id], purchase_price: e.target.value } }))}
                                placeholder="opt." className={inp} style={{ ...bdr, color: '#94A3B8' }} />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-1" style={{ color: '#7C3AED' }}>📍 Location</p>
                            <input value={d.storage_location} onChange={e => setBatchDrafts(p => ({ ...p, [b.id]: { ...p[b.id], storage_location: e.target.value } }))}
                              placeholder="e.g. Rack A / Shelf 2 / Bin 3" className={inp} style={{ ...bdr, color: '#7C3AED' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {saveErr && <p className="text-xs" style={{ color: '#DC2626' }}>{saveErr}</p>}

                <div className="flex gap-2">
                  <button onClick={() => saveEdit(drug)} disabled={saving}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditId(null)} disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        )
      })}
    </div>
  )
}

// ---- Alerts View ----

function DrugMeta({ d }: { d: DrugWithStock }) {
  const stocked      = (d.stocked_brands ?? [])[0]
  // Pack and HSN must belong to the brand on the shelf — never another brand's.
  const primaryBrand = stocked ? d.brand_data?.find(b => b.brand_name === stocked) : d.brand_data?.[0]
  const displayName  = stocked ?? d.name
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{displayName}</span>
        {d.form && <span className="text-xs px-1.5 py-0.5 rounded-md capitalize" style={{ background: '#F1F5F9', color: '#475569' }}>{d.form}</span>}
        {d.strength && <span className="text-xs" style={{ color: '#64748B' }}>{d.strength}</span>}
      </div>
      {primaryBrand && (
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          {primaryBrand.manufacturer && <span className="text-xs" style={{ color: '#64748B' }}>{primaryBrand.manufacturer}</span>}
          {primaryBrand.pack_size && primaryBrand.pack_unit && <span className="text-xs" style={{ color: '#94A3B8' }}>{primaryBrand.pack_size} {primaryBrand.pack_unit}/pack</span>}
          {primaryBrand.hsn_code && <span className="text-xs" style={{ color: '#94A3B8' }}>HSN {primaryBrand.hsn_code}</span>}
        </div>
      )}
    </div>
  )
}

function BatchMeta({ b }: { b: RichBatch }) {
  const displayName = b.brand_name ?? b.drug_name
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{displayName}</span>
        {b.form && <span className="text-xs px-1.5 py-0.5 rounded-md capitalize" style={{ background: '#F1F5F9', color: '#475569' }}>{b.form}</span>}
        {b.strength && <span className="text-xs" style={{ color: '#64748B' }}>{b.strength}</span>}
        <span className="font-mono text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F8FAFC', color: '#94A3B8', border: '1px solid #E2E8F0' }}>Batch {b.batch_no}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {b.manufacturer && <span className="text-xs" style={{ color: '#64748B' }}>{b.manufacturer}</span>}
        {b.pack_size && b.pack_unit && <span className="text-xs" style={{ color: '#94A3B8' }}>{b.pack_size} {b.pack_unit}</span>}
        {b.hsn_code && <span className="text-xs" style={{ color: '#94A3B8' }}>HSN {b.hsn_code}</span>}
      </div>
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
                <div className="flex items-start justify-between gap-4">
                  <BatchMeta b={b} />
                  <div className="text-xs text-right flex-shrink-0" style={{ color: '#DC2626' }}>
                    <div>Expired <DateText date={b.expiry} /></div>
                    <div className="mt-0.5" style={{ color: '#94A3B8' }}>{b.qty_available} units · <span style={{ color: '#0D9488' }}>₹{b.mrp}/unit</span></div>
                    {b.storage_location && <div className="mt-0.5" style={{ color: '#7C3AED' }}>📍 {b.storage_location}</div>}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}
      {alerts.lowStock.length > 0 && (
        <section>
          <div className="flex justify-end mb-2">
            <Link href="/pharmacy/receive?low=1"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#0D9488', color: '#fff' }}>
              <Plus className="w-3.5 h-3.5" /> Order what&apos;s low
            </Link>
          </div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#B45309' }}>
            Low Stock ({alerts.lowStock.length} drugs)
          </h3>
          <div className="space-y-2">
            {alerts.lowStock.map((d) => (
              <GlassCard key={d.id} className="p-3">
                <div className="flex items-start justify-between gap-4">
                  <DrugMeta d={d} />
                  <div className="text-xs text-right flex-shrink-0" style={{ color: '#B45309' }}>
                    <div className="font-semibold">{d.total_qty} remaining</div>
                    <div className="mt-0.5" style={{ color: '#94A3B8' }}>Alerts below {d.reorder_level}</div>
                    {d.batches[0]?.storage_location && <div className="mt-0.5" style={{ color: '#7C3AED' }}>📍 {d.batches[0].storage_location}</div>}
                  </div>
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
                <div className="flex items-start justify-between gap-4">
                  <BatchMeta b={b} />
                  <div className="text-xs text-right flex-shrink-0" style={{ color: '#0D9488' }}>
                    <div>Expires <DateText date={b.expiry} /></div>
                    <div className="mt-0.5" style={{ color: '#94A3B8' }}>{b.qty_available} units · <span style={{ color: '#0D9488' }}>₹{b.mrp}/unit</span></div>
                    {b.storage_location && <div className="mt-0.5" style={{ color: '#7C3AED' }}>📍 {b.storage_location}</div>}
                  </div>
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

interface StockInfo {
  mrp: number
  location: string | null
  availableQty: number
  inStock: boolean
  sufficient: boolean
}

function findStockInfo(
  _itemName: string,
  stock: DrugWithStock[],
  requestedQty: number,
  drugRef?: { id: string | null; isMaster: boolean } | null
): StockInfo {
  // Match exclusively by stored drug ID — no name string matching.
  const drug = drugRef?.id
    ? stock.find((d) => d.id === drugRef.id && d.is_global === drugRef.isMaster)
    : undefined
  if (!drug) return { mrp: 0, location: null, availableQty: 0, inStock: false, sufficient: false }
  const availableBatches = drug.batches.filter((b) => b.qty_available > 0)
  const availableQty = availableBatches.reduce((s, b) => s + b.qty_available, 0)
  const firstBatch = availableBatches[0]
  return {
    mrp: firstBatch?.mrp ?? 0,
    location: firstBatch?.storage_location ?? null,
    availableQty,
    inStock: availableQty > 0,
    sufficient: availableQty >= requestedQty,
  }
}

interface IpdWardQueueProps {
  requests: IpdPharmacyRequest[]
  stock: DrugWithStock[]
  canDispense: boolean
  dispensingId: string | null
  onDispense: (id: string, pricePerUnit: number) => void
}

// Build grouped history: patient → admission → items
interface IpdAdmissionGroup {
  admissionId: string
  wardBed: string
  admittedAt: string | null
  items: IpdPharmacyRequest[]
  subtotal: number
  hasUnbilled: boolean
}
interface IpdPatientGroup {
  patientName: string
  uhid: string
  admissions: IpdAdmissionGroup[]
}

function buildIpdHistory(dispensed: IpdPharmacyRequest[]): IpdPatientGroup[] {
  const patientMap = new Map<string, IpdPatientGroup>()
  for (const req of dispensed) {
    const patientName = req.admission?.patient?.full_name ?? 'Unknown Patient'
    const uhid        = req.admission?.patient?.uhid ?? ''
    if (!patientMap.has(patientName)) patientMap.set(patientName, { patientName, uhid, admissions: [] })
    const patient = patientMap.get(patientName)!

    let adm = patient.admissions.find(a => a.admissionId === req.admission_id)
    if (!adm) {
      const ward = req.admission?.ward?.name ?? ''
      const bed  = req.admission?.bed?.bed_no ? `Bed ${req.admission.bed.bed_no}` : ''
      adm = {
        admissionId: req.admission_id,
        wardBed: [ward, bed].filter(Boolean).join(' · '),
        admittedAt: req.admission?.admitted_at ?? null,
        items: [],
        subtotal: 0,
        hasUnbilled: false,
      }
      patient.admissions.push(adm)
    }
    adm.items.push(req)
    adm.subtotal += req.price_snapshot * req.quantity
    if (req.billing_status === 'unbilled') adm.hasUnbilled = true
  }
  return Array.from(patientMap.values())
}

function IpdWardQueue({ requests, stock, canDispense, dispensingId, onDispense }: IpdWardQueueProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmingStockInfo, setConfirmingStockInfo] = useState<StockInfo | null>(null)
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())
  const [expandedAdmissions, setExpandedAdmissions] = useState<Set<string>>(new Set())

  const pending   = requests.filter((r) => r.status === 'pending')
  const dispensed = requests.filter((r) => r.status === 'dispensed')
  const history   = buildIpdHistory(dispensed)

  function startDispense(req: IpdPharmacyRequest) {
    const drugRef = (req.drug_master_id || req.drug_id)
      ? { id: req.drug_master_id ?? req.drug_id, isMaster: !!req.drug_master_id }
      : null
    const info = findStockInfo(req.item_name, stock, req.quantity, drugRef)
    setConfirmingStockInfo(info)
    setConfirmingId(req.id)
  }

  function cancelDispense() {
    setConfirmingId(null)
    setConfirmingStockInfo(null)
  }

  function confirmDispense(reqId: string) {
    // Price always comes from stock MRP — no manual input
    const price = confirmingStockInfo?.mrp ?? 0
    onDispense(reqId, price)
    setConfirmingId(null)
    setConfirmingStockInfo(null)
  }

  function togglePatient(key: string) {
    setExpandedPatients(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleAdmission(key: string) {
    setExpandedAdmissions(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  return (
    <div className="space-y-4">
      {/* ── Pending requests ── */}
      <GlassCard>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BedDouble className="w-4 h-4" style={{ color: '#0D9488' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              IPD Ward Requests
            </h3>
            <span className="text-xs" style={{ color: '#94A3B8' }}>— price auto-filled from stock MRP</span>
          </div>

          {pending.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>No pending IPD requests.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((req) => {
                const adm = req.admission
                const isConfirming  = confirmingId === req.id
                const isDispatching = dispensingId === req.id
                const rowDrugRef = (req.drug_master_id || req.drug_id)
                  ? { id: req.drug_master_id ?? req.drug_id, isMaster: !!req.drug_master_id }
                  : null
                const rowStock = findStockInfo(req.item_name, stock, req.quantity, rowDrugRef)
                return (
                  <div key={req.id} className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid rgba(13,148,136,0.2)', background: 'rgba(13,148,136,0.03)' }}>
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-3 py-3 flex-wrap">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{req.item_name}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F1F5F9', color: '#64748B' }}>
                            Qty: {req.quantity}
                          </span>
                          {rowStock.sufficient ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                              style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                              {rowStock.availableQty} in stock · ₹{rowStock.mrp}/unit
                            </span>
                          ) : rowStock.inStock ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                              style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                              Only {rowStock.availableQty} in stock · ₹{rowStock.mrp}/unit
                            </span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                              style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                              Not in stock
                            </span>
                          )}
                          {rowStock.location && (
                            <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                              📍 {rowStock.location}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                          {adm?.patient?.full_name ?? '—'}{' '}
                          <span className="font-mono" style={{ color: '#94A3B8' }}>({adm?.patient?.uhid ?? '—'})</span>
                          {adm?.ward ? ` · ${adm.ward.name}` : ''}
                          {adm?.bed  ? ` Bed ${adm.bed.bed_no}` : ''}
                        </p>
                      </div>
                      {canDispense && !isConfirming && (
                        <button onClick={() => startDispense(req)} disabled={isDispatching}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          <Check className="w-3.5 h-3.5" />
                          {isDispatching ? 'Dispensing…' : 'Dispense'}
                        </button>
                      )}
                    </div>

                    {/* Confirm panel — no price input, price comes from stock */}
                    {isConfirming && (
                      <div className="px-3 pb-3 pt-2 space-y-2"
                        style={{ borderTop: '1px solid rgba(13,148,136,0.15)', background: 'rgba(13,148,136,0.06)' }}>
                        {!confirmingStockInfo?.inStock ? (
                          <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                            ⚠ <span className="font-semibold">Not in stock — add this drug to stock first so price can be captured correctly.</span>
                          </div>
                        ) : !confirmingStockInfo.sufficient ? (
                          <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                            style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E' }}>
                            ⚠ <span className="font-semibold">Only {confirmingStockInfo.availableQty} in stock, {requests.find(r => r.id === confirmingId)?.quantity} requested.</span>
                          </div>
                        ) : confirmingStockInfo.location ? (
                          <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                            style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', color: '#7C3AED' }}>
                            📍 <span className="font-semibold">Pick from: {confirmingStockInfo.location}</span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs" style={{ color: '#475569' }}>
                            {confirmingStockInfo?.mrp && confirmingStockInfo.mrp > 0 ? (
                              <>
                                <span className="font-semibold" style={{ color: '#0D9488' }}>₹{confirmingStockInfo.mrp}/unit</span>
                                {' '}(MRP from stock){' '}
                                {requests.find(r => r.id === confirmingId) && (
                                  <span>× {requests.find(r => r.id === confirmingId)!.quantity} = <span className="font-semibold">₹{(confirmingStockInfo.mrp * requests.find(r => r.id === confirmingId)!.quantity).toFixed(2)}</span></span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: '#DC2626' }}>No price available — bill will be unbilled until stock is added</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={cancelDispense}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                              style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                              Cancel
                            </button>
                            <button onClick={() => confirmDispense(confirmingId!)} disabled={isDispatching}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                              <Check className="w-3 h-3" />
                              {isDispatching ? 'Dispensing…' : 'Confirm Dispense'}
                            </button>
                          </div>
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

      {/* ── Dispensed history — grouped by patient → admission ── */}
      {history.length > 0 && (
        <GlassCard>
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#94A3B8' }}>
              Dispensed History ({dispensed.length} items · {history.length} patient{history.length !== 1 ? 's' : ''})
            </h3>
            <div className="space-y-2">
              {history.map((patient) => {
                const patientKey = patient.uhid || patient.patientName
                const isPatientOpen = expandedPatients.has(patientKey)
                const totalItems = patient.admissions.reduce((s, a) => s + a.items.length, 0)
                const totalAmt   = patient.admissions.reduce((s, a) => s + a.subtotal, 0)
                const hasUnbilled = patient.admissions.some(a => a.hasUnbilled)
                return (
                  <div key={patientKey} className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid #E2E8F0' }}>
                    {/* Patient header */}
                    <button onClick={() => togglePatient(patientKey)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                      style={{ background: isPatientOpen ? 'rgba(13,148,136,0.05)' : '#FAFAFA', border: 'none', cursor: 'pointer' }}>
                      {isPatientOpen ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#94A3B8' }} />
                                     : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#94A3B8' }} />}
                      <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{patient.patientName}</span>
                        {patient.uhid && <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{patient.uhid}</span>}
                        <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F1F5F9', color: '#64748B' }}>
                          {totalItems} item{totalItems !== 1 ? 's' : ''} · {patient.admissions.length} admission{patient.admissions.length !== 1 ? 's' : ''}
                        </span>
                        {hasUnbilled && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                            style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                            ⚠ unbilled
                          </span>
                        )}
                      </div>
                      {totalAmt > 0 && (
                        <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#0D9488' }}>
                          ₹{totalAmt.toFixed(2)}
                        </span>
                      )}
                    </button>

                    {isPatientOpen && (
                      <div className="border-t" style={{ borderColor: '#F1F5F9' }}>
                        {patient.admissions.map((adm) => {
                          const admKey = adm.admissionId
                          const isAdmOpen = expandedAdmissions.has(admKey)
                          return (
                            <div key={admKey} style={{ borderBottom: '1px solid #F8FAFC' }}>
                              {/* Admission sub-header */}
                              <button onClick={() => toggleAdmission(admKey)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-left"
                                style={{ background: isAdmOpen ? '#F0FDF4' : '#FAFAFA', border: 'none', cursor: 'pointer' }}>
                                {isAdmOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: '#94A3B8' }} />
                                           : <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: '#94A3B8' }} />}
                                <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
                                  <span className="text-xs font-semibold" style={{ color: '#374151' }}>
                                    {adm.wardBed || 'Admission'}
                                  </span>
                                  {adm.admittedAt && (
                                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                                      Admitted {new Date(adm.admittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </span>
                                  )}
                                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                                    {adm.items.length} item{adm.items.length !== 1 ? 's' : ''}
                                  </span>
                                  {adm.hasUnbilled && (
                                    <span className="text-xs px-1 py-0.5 rounded font-medium"
                                      style={{ background: '#FEF3C7', color: '#92400E' }}>unbilled</span>
                                  )}
                                </div>
                                {adm.subtotal > 0 && (
                                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#0D9488' }}>
                                    ₹{adm.subtotal.toFixed(2)}
                                  </span>
                                )}
                              </button>

                              {isAdmOpen && (
                                <div className="px-6 py-1.5 space-y-1">
                                  {adm.items.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between text-xs py-1"
                                      style={{ borderBottom: '1px solid #F8FAFC' }}>
                                      <div className="flex items-center gap-2">
                                        <Check className="w-3 h-3 flex-shrink-0" style={{ color: '#10B981' }} />
                                        <span style={{ color: '#0F172A' }}>{item.item_name}</span>
                                        <span style={{ color: '#94A3B8' }}>× {item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                                        {item.billing_status === 'unbilled' && (
                                          <span className="px-1 py-0.5 rounded font-medium"
                                            style={{ background: '#FEF3C7', color: '#92400E', fontSize: '0.6rem' }}>unbilled</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {item.price_snapshot > 0 ? (
                                          <span className="font-medium" style={{ color: '#0D9488' }}>
                                            ₹{(item.price_snapshot * item.quantity).toFixed(2)}
                                          </span>
                                        ) : (
                                          <span style={{ color: '#94A3B8' }}>—</span>
                                        )}
                                        <span style={{ color: '#94A3B8' }}>
                                          {item.dispensed_at
                                            ? new Date(item.dispensed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
                                            : '—'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
