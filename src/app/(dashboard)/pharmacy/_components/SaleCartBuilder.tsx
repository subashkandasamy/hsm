'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  Search, Package, User2, CreditCard, Truck, Loader2, X, AlertCircle,
  ChevronDown, ChevronRight, ScanBarcode,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import {
  startPharmacySale, addSaleItem, updateSaleItemQty, removeSaleItem,
  finalizeSale, cancelSale, getPharmacySale, fulfillSale, listPharmacySales,
} from '@/app/actions/pharmacySale'
import { checkBillStatus, resolveProductCode, rememberProductCode, type ScannedBatch, type ScannedProduct } from '@/app/actions/pharmacy'
import { useScanListener } from '@/lib/hooks/useScanListener'
import type { DrugWithStock, Patient, PharmacySale } from '@/lib/types'

interface Props {
  drugs: DrugWithStock[]
  initialReadySales: PharmacySale[]
  initialFulfilledSales?: PharmacySale[]
  allPatients?: Patient[]
  /** false = this hospital hands medicines over before payment; the bill is collected later. */
  payFirst?: boolean
}

export default function SaleCartBuilder({ drugs, initialReadySales, initialFulfilledSales = [], allPatients = [], payFirst = true }: Props) {
  // Cart builder state
  const [patientQuery, setPatientQuery]       = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [activeSale, setActiveSale]           = useState<PharmacySale | null>(null)
  const [drugQuery, setDrugQuery]           = useState('')
  const [selectedDrugId, setSelectedDrugId] = useState('')
  const [addQty, setAddQty]                 = useState(1)
  const [cartPending, setCartPending]       = useState(false)
  const [cartError, setCartError]           = useState('')
  // drugId → brand/display name chosen by the pharmacist — persists through finalize so
  // the fulfillment queue also shows the brand label in the same session
  const [displayNameMap, setDisplayNameMap] = useState<Map<string, string>>(new Map())

  // Scanning
  const [scanMsg, setScanMsg] = useState<{ id: number; tone: 'ok' | 'warn'; text: string } | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  /** An unrecognised pack, waiting for someone to say what it is. */
  const [teach, setTeach] = useState<{ code: string; query: string } | null>(null)
  const [typedCode, setTypedCode] = useState('')
  /** Latches one scan at a time: two fast scans must not both add a new line. */
  const scanBusyRef = useRef(false)
  const flashSeq = useRef(0)

  // Fulfillment queue state
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [readySales, setReadySales] = useState(initialReadySales)
  const [billStatusMap, setBillStatusMap] = useState<Map<string, { status: string; paid: number; total: number }>>(
    new Map(initialReadySales.map((s) => [
      s.id,
      { status: s.bill?.status ?? 'unpaid', paid: s.bill?.paid ?? 0, total: s.bill?.total ?? 0 },
    ]))
  )
  const [checkingPayment, setCheckingPayment] = useState<Set<string>>(new Set())
  const [handingOver, setHandingOver]         = useState<Set<string>>(new Set())
  const [fulfillErrors, setFulfillErrors]     = useState<Map<string, string>>(new Map())
  const [globalSuccess, setGlobalSuccess]     = useState('')

  // Restore any in-progress draft sale when navigating back to the page
  useEffect(() => {
    async function restoreDraft() {
      if (activeSale) return
      const drafts = await listPharmacySales({ status: 'draft' })
      if (!drafts.length) return
      const draft = drafts[0]
      setActiveSale(draft)
      if (draft.patient) {
        setSelectedPatient(draft.patient as unknown as Patient)
        setPatientQuery(draft.patient.full_name)
      }
    }
    restoreDraft()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-filter patients as user types
  const patientResults = useMemo(() => {
    const q = patientQuery.trim().toLowerCase()
    if (!q || selectedPatient) return []
    return allPatients.filter((p) =>
      p.full_name.toLowerCase().includes(q) ||
      p.uhid.toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q)
    ).slice(0, 8)
  }, [patientQuery, allPatients, selectedPatient])

  const teachMatches = useMemo(() => {
    const q = (teach?.query ?? '').trim().toLowerCase()
    if (q.length < 2) return []
    return drugs.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.generic_name ?? '').toLowerCase().includes(q) ||
      (d.stocked_brands ?? []).some(b => b.toLowerCase().includes(q)) ||
      (d.brand_aliases ?? []).some(b => b.toLowerCase().includes(q))
    ).slice(0, 8)
  }, [teach, drugs])

  const filteredDrugs = useMemo(() => {
    const q = drugQuery.toLowerCase()
    return drugs.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.generic_name ?? '').toLowerCase().includes(q) ||
      (d.brand_aliases ?? []).some(b => b.toLowerCase().includes(q))
    ).slice(0, 15)
  }, [drugQuery, drugs])

  async function startCart() {
    if (!selectedPatient) return
    setCartError(''); setCartPending(true)
    const res = await startPharmacySale({ patientId: selectedPatient.id })
    if (!res.success) { setCartError(res.error); setCartPending(false); return }
    const sale = await getPharmacySale(res.saleId)
    setActiveSale(sale); setCartPending(false)
  }

  async function addItem() {
    if (!activeSale || !selectedDrugId || addQty < 1) return
    setCartError(''); setCartPending(true)
    const res = await addSaleItem({ saleId: activeSale.id, drugId: selectedDrugId, qty: addQty })
    if (!res.success) { setCartError(res.error); setCartPending(false); return }
    const updated = await getPharmacySale(activeSale.id)
    setActiveSale(updated); setSelectedDrugId(''); setDrugQuery(''); setAddQty(1); setCartPending(false)
  }

  /** Puts a scanned medicine in the cart, or adds one to the line already there. */
  async function addScanned(product: ScannedProduct, sale: PharmacySale, batch?: ScannedBatch) {
    const label = product.brandName ?? product.name
    if (batch?.expired) {
      flashScan('warn', `${label} batch ${batch.batchNo} has expired — do not sell it`)
      return
    }
    if (batch && batch.available <= 0) {
      flashScan('warn', `That box of ${label} (batch ${batch.batchNo}) is empty`)
      return
    }
    if (!batch && product.available <= 0) {
      flashScan('warn', `${label} has no stock in date`)
      return
    }
    setDisplayNameMap((prev) => new Map([...prev, [product.id, label]]))

    // Read the cart as it stands now: scans can arrive faster than state settles.
    const current = await getPharmacySale(sale.id)
    // A different box of the same medicine is its own line — two batches must not
    // be merged, or the wrong one would come off the shelf.
    const existing = (current?.items ?? []).find((i) =>
      (i.drug_id ?? i.drug_master_id) === product.id && (i.drug_batch_id ?? null) === (batch?.id ?? null))
    const res = existing
      ? await updateSaleItemQty(existing.id, existing.qty + 1)
      : await addSaleItem({ saleId: sale.id, drugId: product.id, qty: 1, batchId: batch?.id ?? null })
    if (!res.success) { flashScan('warn', res.error); return }

    setActiveSale(await getPharmacySale(sale.id))
    const what = `${label}${product.strength ? ` ${product.strength}` : ''}`
    if (batch && !batch.isEarliestExpiring) {
      flashScan('warn', `${what} added — but another box expires sooner, sell that one first`)
    } else {
      flashScan('ok', batch ? `${what} · batch ${batch.batchNo} added` : `${what} added`)
    }
  }

  function flashScan(tone: 'ok' | 'warn', text: string) {
    // Identified, not compared by text: scanning the same pack twice shows the
    // same words, and the older timer must not clear the newer message.
    const id = ++flashSeq.current
    setScanMsg({ id, tone, text })
    setTimeout(() => setScanMsg((m) => (m?.id === id ? null : m)), 3500)
  }

  /** Every scan arrives here, whether from the hardware scanner or typed in. */
  async function handleScan(code: string) {
    if (scanBusyRef.current) return
    const sale = activeSale
    if (!sale) { flashScan('warn', 'Choose a patient and start a cart first'); return }
    scanBusyRef.current = true
    setScanBusy(true)
    setTeach(null)
    try {
      const found = await resolveProductCode(code)
      if (found.status === 'unreadable') { flashScan('warn', 'That code could not be read'); return }
      if (found.status === 'known') { await addScanned(found.product, sale, found.batch); return }
      // Never seen before: ask once what it is.
      setTeach({ code: found.scanned.raw, query: '' })
      flashScan('warn', 'New pack — tell the counter what this is, once')
    } finally {
      scanBusyRef.current = false
      setScanBusy(false)
      setTypedCode('')
    }
  }

  /** Remembers the pack against the medicine just picked, then bills it. */
  async function teachAs(drugId: string, isGlobal: boolean, brand: string | null) {
    const sale = activeSale
    if (!teach || !sale) return
    setScanBusy(true)
    const res = await rememberProductCode(teach.code, { id: drugId, isGlobal }, brand)
    setScanBusy(false)
    if (!res.success) { flashScan('warn', res.error); return }
    setTeach(null)
    await addScanned(res.product, sale)
  }

  // A hardware scanner types very fast and presses Enter — catch that anywhere on
  // the page, except while the cursor is in a text box.
  useScanListener((code) => { void handleScan(code) }, true)

  async function changeQty(itemId: string, qty: number) {
    if (qty < 1 || !activeSale) return
    setCartPending(true)
    await updateSaleItemQty(itemId, qty)
    setActiveSale(await getPharmacySale(activeSale.id))
    setCartPending(false)
  }

  async function removeItem(itemId: string) {
    if (!activeSale) return
    setCartPending(true)
    await removeSaleItem(itemId)
    setActiveSale(await getPharmacySale(activeSale.id))
    setCartPending(false)
  }

  async function finalizeCart() {
    if (!activeSale) return
    setCartError(''); setCartPending(true)
    const res = await finalizeSale(activeSale.id)
    if (!res.success) { setCartError(res.error); setCartPending(false); return }
    setGlobalSuccess('Bill generated — waiting for payment at counter')
    setActiveSale(null); setSelectedPatient(null)
    const ready = await listPharmacySales({ status: 'billed' })
    setReadySales(ready)
    setBillStatusMap(new Map(ready.map((s) => [
      s.id,
      { status: s.bill?.status ?? 'unpaid', paid: s.bill?.paid ?? 0, total: s.bill?.total ?? 0 },
    ])))
    setCartPending(false)
  }

  async function cancelCart() {
    if (!activeSale) return
    setCartPending(true)
    await cancelSale(activeSale.id)
    setActiveSale(null); setSelectedPatient(null); setCartPending(false)
  }

  // ---- Fulfillment actions ----

  async function handleCheckPayment(sale: PharmacySale) {
    if (!sale.bill_id) return
    setCheckingPayment((prev) => new Set([...prev, sale.id]))
    const result = await checkBillStatus(sale.bill_id)
    if (result) {
      setBillStatusMap((prev) => new Map([...prev, [sale.id, { status: result.status, paid: result.paid, total: result.total }]]))
    }
    setCheckingPayment((prev) => { const n = new Set(prev); n.delete(sale.id); return n })
  }

  async function handleHandOver(sale: PharmacySale) {
    setHandingOver((prev) => new Set([...prev, sale.id]))
    setFulfillErrors((prev) => { const n = new Map(prev); n.delete(sale.id); return n })
    const res = await fulfillSale(sale.id)
    setHandingOver((prev) => { const n = new Set(prev); n.delete(sale.id); return n })
    if (!res.success) {
      setFulfillErrors((prev) => new Map([...prev, [sale.id, res.error]]))
      // Refresh bill status in case of payment issue
      if (sale.bill_id) {
        const b = await checkBillStatus(sale.bill_id)
        if (b) setBillStatusMap((prev) => new Map([...prev, [sale.id, { status: b.status, paid: b.paid, total: b.total }]]))
      }
      return
    }
    setGlobalSuccess('Medicines handed over to patient')
    setReadySales((prev) => prev.filter((s) => s.id !== sale.id))
  }

  function toggleSale(saleId: string) {
    setExpandedSales((prev) => {
      const next = new Set(prev)
      if (next.has(saleId)) next.delete(saleId); else next.add(saleId)
      return next
    })
  }

  const cartTotal = activeSale?.items?.reduce((s, i) => s + i.amount, 0) ?? 0

  return (
    <div className="space-y-4">
      {/* Global feedback */}
      {globalSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {globalSuccess}
          <button onClick={() => setGlobalSuccess('')} className="ml-auto" style={{ color: '#15803D' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ══════════════ LEFT — Cart Builder ══════════════ */}
        <GlassCard className="overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 flex items-center gap-2"
            style={{ borderBottom: '1px solid #F1F5F9', background: 'rgba(13,148,136,0.03)' }}>
            <ShoppingCart className="w-4 h-4" style={{ color: '#0D9488' }} />
            <h3 className="font-semibold text-sm" style={{ color: '#0F172A' }}>New Sale Cart</h3>
          </div>

          <div className="p-5">
            {!activeSale ? (
              /* ── Patient search ── */
              <div className="space-y-3">
                <p className="text-xs font-medium" style={{ color: '#94A3B8' }}>SEARCH PATIENT</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="Type name, UHID or phone…"
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setSelectedPatient(null) }}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                    style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: 'rgba(255,255,255,0.85)', outline: 'none', minHeight: '44px' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                  />
                </div>

                {patientResults.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    {patientResults.map((p, i) => (
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setPatientQuery(p.full_name) }}
                        className="w-full text-left px-4 py-3 transition-all"
                        style={{ borderBottom: i < patientResults.length - 1 ? '1px solid #F1F5F9' : 'none', minHeight: '44px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{p.full_name}</p>
                        <p className="text-xs" style={{ color: '#64748B' }}>{p.uhid}{p.phone ? ` · ${p.phone}` : ''}</p>
                      </button>
                    ))}
                  </div>
                )}

                {selectedPatient && (
                  <div className="flex items-center justify-between p-4 rounded-xl"
                    style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'rgba(13,148,136,0.12)' }}>
                        <User2 className="w-4 h-4" style={{ color: '#0D9488' }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{selectedPatient.full_name}</p>
                        <p className="text-xs" style={{ color: '#0D9488' }}>{selectedPatient.uhid}</p>
                      </div>
                    </div>
                    <button onClick={startCart} disabled={cartPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                      style={{ background: cartPending ? '#94A3B8' : '#0D9488', border: 'none', cursor: 'pointer' }}>
                      {cartPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Start Cart
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Active cart ── */
              <div className="space-y-4">
                {/* Cart patient header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(13,148,136,0.12)' }}>
                      <User2 className="w-4 h-4" style={{ color: '#0D9488' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                        {activeSale.patient?.full_name ?? 'Patient'}
                      </p>
                      <p className="text-xs" style={{ color: '#64748B' }}>{activeSale.patient?.uhid}</p>
                    </div>
                  </div>
                  <button onClick={cancelCart} disabled={cartPending}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                    Cancel Cart
                  </button>
                </div>

                {cartError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {cartError}
                  </div>
                )}

                {/* Add medicine */}
                <div className="rounded-xl p-3 space-y-2"
                  style={{ background: 'rgba(13,148,136,0.03)', border: '1px solid rgba(13,148,136,0.15)' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold" style={{ color: '#0D9488' }}>ADD MEDICINE</p>
                    {scanMsg && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={scanMsg.tone === 'ok'
                          ? { background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
                          : { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                        {scanMsg.text}
                      </span>
                    )}
                  </div>

                  {/* Scan a pack — a hardware scanner works without clicking here first */}
                  <div className="flex items-center gap-2 px-2.5 rounded-lg"
                    style={{ border: '1px dashed #CBD5E1', background: '#fff', minHeight: '38px' }}>
                    {scanBusy
                      ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#0D9488' }} />
                      : <ScanBarcode className="w-4 h-4 flex-shrink-0" style={{ color: '#94A3B8' }} />}
                    <input
                      value={typedCode}
                      onChange={(e) => setTypedCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && typedCode.trim()) { e.preventDefault(); void handleScan(typedCode.trim()) } }}
                      placeholder="Scan the pack, or type its code"
                      className="flex-1 text-sm py-2"
                      style={{ border: 'none', outline: 'none', color: '#0F172A', background: 'transparent' }} />
                  </div>

                  {/* An unknown pack: taught once, then it always scans */}
                  {teach && (
                    <div className="rounded-lg p-2.5 space-y-2"
                      style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: '#92400E' }}>Which medicine is this?</p>
                          <p className="text-xs font-mono truncate" style={{ color: '#B45309' }}>{teach.code}</p>
                        </div>
                        <button onClick={() => setTeach(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309' }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        autoFocus
                        value={teach.query}
                        onChange={(e) => setTeach((t) => (t ? { ...t, query: e.target.value } : t))}
                        placeholder="Search what you stock…"
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ border: '1px solid #FDE68A', color: '#0F172A', background: '#fff', outline: 'none' }} />
                      {teach.query.trim().length >= 2 && (
                        <ul className="rounded-lg overflow-hidden" style={{ background: '#fff', border: '1px solid #FDE68A', maxHeight: 180, overflowY: 'auto' }}>
                          {teachMatches.length === 0 && (
                            <li className="px-3 py-2 text-xs" style={{ color: '#94A3B8' }}>Nothing in stock matches that.</li>
                          )}
                          {teachMatches.map((d) => {
                            const q = teach.query.toLowerCase()
                            const brand = (d.stocked_brands ?? []).find(b => b.toLowerCase().includes(q))
                              ?? (d.stocked_brands ?? [])[0] ?? null
                            return (
                              <li key={d.id}>
                                <button type="button" onClick={() => void teachAs(d.id, !!d.is_global, brand)}
                                  disabled={scanBusy}
                                  className="w-full text-left px-3 py-2 text-sm"
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                  <span className="font-medium" style={{ color: '#0F172A' }}>{brand ?? d.name}</span>
                                  {d.strength && <span className="ml-1 text-xs" style={{ color: '#94A3B8' }}>{d.strength}</span>}
                                  <span className="block text-xs" style={{ color: '#94A3B8' }}>
                                    {brand ? `${d.name} · ` : ''}{d.total_qty} in stock
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <p className="text-xs" style={{ color: '#B45309' }}>Told once — this pack scans straight into the bill from now on.</p>
                    </div>
                  )}
                  <div className="relative">
                    <input type="text" placeholder="Search drug by name…"
                      value={drugQuery}
                      onChange={(e) => { setDrugQuery(e.target.value); setSelectedDrugId('') }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ border: `1px solid ${selectedDrugId ? '#0D9488' : '#E2E8F0'}`, color: '#0F172A', background: '#fff', outline: 'none' }} />
                    {selectedDrugId && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>matched</span>
                    )}
                    {drugQuery && !selectedDrugId && filteredDrugs.length > 0 && (
                      <ul className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden"
                        style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: '180px', overflowY: 'auto' }}>
                        {filteredDrugs.map((d) => {
                          const q = drugQuery.toLowerCase()
                          const matchBrand = (d.brand_aliases ?? []).find(b => b.toLowerCase().includes(q))
                          return (
                            <li key={d.id}>
                              <button type="button"
                                onMouseDown={() => {
                                  const label = matchBrand ?? d.name
                                  setSelectedDrugId(d.id)
                                  setDrugQuery(label)
                                  setDisplayNameMap(prev => new Map([...prev, [d.id, label]]))
                                }}
                                className="w-full text-left px-3 py-2 text-sm"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                                <span className="font-medium" style={{ color: '#0F172A' }}>{matchBrand ?? d.name}</span>
                                {d.strength && <span className="ml-1 text-xs" style={{ color: '#94A3B8' }}>{d.strength}</span>}
                                {d.form && <span className="ml-1 text-xs capitalize" style={{ color: '#64748B' }}>· {d.form}</span>}
                                {matchBrand && <span className="block text-xs" style={{ color: '#94A3B8' }}>{d.name}</span>}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={addQty}
                      onChange={(e) => setAddQty(parseInt(e.target.value) || 1)}
                      className="w-20 px-3 py-2 rounded-lg text-sm text-center"
                      style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: '#fff', outline: 'none' }} />
                    <span className="text-xs flex-1" style={{ color: '#94A3B8' }}>qty</span>
                    <button onClick={addItem} disabled={cartPending || !selectedDrugId}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ background: selectedDrugId && !cartPending ? '#0D9488' : '#94A3B8', border: 'none', cursor: 'pointer' }}>
                      {cartPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Add
                    </button>
                  </div>
                </div>

                {/* Items */}
                {(activeSale.items ?? []).length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No items in cart yet</p>
                ) : (
                  <div className="space-y-2">
                    {activeSale.items?.map((item) => {
                      const refId = item.drug_id ?? item.drug_master_id ?? ''
                      const stockDrug = drugs.find(d => d.id === refId)
                      // When a label was scanned, the line means that exact box —
                      // so it must show that box's shelf, not the first one found.
                      const scannedBatch = item.drug_batch_id
                        ? stockDrug?.batches?.find(b => b.id === item.drug_batch_id)
                        : null
                      const location = (scannedBatch ?? stockDrug?.batches?.find(b => b.qty_available > 0))?.storage_location ?? null
                      return (
                      <div key={item.id} className="px-3 py-2.5 rounded-xl space-y-2"
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        {/* Top row: name + price + delete */}
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold" style={{ color: '#0F172A', wordBreak: 'break-word' }}>
                              {displayNameMap.get(item.drug_id ?? item.drug_master_id ?? '') ?? (item.drug ?? item.master)?.name ?? 'Drug'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                              ₹{item.unit_price}/unit
                              {scannedBatch && <span style={{ color: '#7C3AED' }}> · batch {scannedBatch.batch_no}</span>}
                            </p>
                          </div>
                          <Money amount={item.amount} className="text-sm font-semibold flex-shrink-0"
                            style={{ color: '#0F172A' }} />
                          <button onClick={() => removeItem(item.id)} disabled={cartPending}
                            className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
                            style={{ color: '#DC2626', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Bottom row: location pill + qty controls */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {location && (
                              <span className="text-xs px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
                                style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                                📍 {location}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => changeQty(item.id, item.qty - 1)} disabled={cartPending || item.qty <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded-lg"
                            style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold" style={{ color: '#0F172A' }}>{item.qty}</span>
                          <button onClick={() => changeQty(item.id, item.qty + 1)} disabled={cartPending}
                            className="w-7 h-7 flex items-center justify-center rounded-lg"
                            style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                            <Plus className="w-3 h-3" />
                          </button>
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                )}

                {/* Total + Finalize */}
                {(activeSale.items ?? []).length > 0 && (
                  <div className="pt-4 space-y-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-medium" style={{ color: '#64748B' }}>Total</span>
                      <Money amount={cartTotal} className="text-lg font-bold" style={{ color: '#0D9488' }} />
                    </div>
                    <button onClick={finalizeCart} disabled={cartPending}
                      className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                      style={{ background: cartPending ? '#94A3B8' : '#0D9488', border: 'none', cursor: 'pointer' }}>
                      {cartPending ? 'Processing…' : 'Finalize & Send to Counter'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassCard>

        {/* ══════════════ RIGHT — Fulfillment Queue ══════════════ */}
        <div className="space-y-3">
          {/* Queue header */}
          <div className="flex items-center gap-2 px-1">
            <Package className="w-4 h-4" style={{ color: '#0D9488' }} />
            <h3 className="font-semibold text-sm" style={{ color: '#0F172A' }}>Fulfillment Queue</h3>
            {readySales.length > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: '#DCFCE7', color: '#16A34A' }}>
                {readySales.length} ready
              </span>
            )}
          </div>

          {readySales.length === 0 ? (
            <GlassCard className="p-8">
              <p className="text-sm text-center" style={{ color: '#94A3B8' }}>No sales awaiting fulfillment.</p>
            </GlassCard>
          ) : (
            readySales.map((sale) => {
              const bs = billStatusMap.get(sale.id) ?? { status: sale.bill?.status ?? 'unpaid', paid: sale.bill?.paid ?? 0, total: sale.bill?.total ?? 0 }
              const isPaid    = bs.status === 'paid'
              const isPartial = bs.status === 'partial'
              const canHandOver = isPaid || (!payFirst && bs.status !== 'cancelled')
              const balance   = bs.total - bs.paid
              const isExpanded = expandedSales.has(sale.id)

              return (
                <GlassCard key={sale.id} className="overflow-hidden"
                  style={isPaid ? { border: '1.5px solid #6EE7B7' } : { border: '1.5px solid #FDE68A' }}>

                  {/* Patient header — 2-row layout for mobile */}
                  <div className="px-4 py-3"
                    style={{
                      background: isPaid ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.05)',
                      borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none',
                    }}>
                    {/* Row 1: avatar + name + chevron */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isPaid ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}>
                        <User2 className="w-4 h-4" style={{ color: isPaid ? '#059669' : '#D97706' }} />
                      </div>
                      <button type="button" onClick={() => toggleSale(sale.id)}
                        className="flex-1 min-w-0 text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>
                          {sale.patient?.full_name ?? 'Patient'}
                        </p>
                        <p className="text-xs truncate" style={{ color: '#64748B' }}>
                          {sale.patient?.uhid}
                          {' · '}{sale.items?.length ?? 0} item{(sale.items?.length ?? 0) !== 1 ? 's' : ''}
                          {sale.bill?.bill_no && <> · {sale.bill.bill_no}</>}
                        </p>
                      </button>
                      <button type="button" onClick={() => toggleSale(sale.id)}
                        className="flex-shrink-0"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />
                          : <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />}
                      </button>
                    </div>

                    {/* Row 2: actions */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap" style={{ paddingLeft: '48px' }}>
                      {canHandOver ? (
                        <button onClick={() => handleHandOver(sale)}
                          disabled={handingOver.has(sale.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          {handingOver.has(sale.id)
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Truck className="w-3 h-3" />}
                          Hand Over
                        </button>
                      ) : (
                        <>
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
                            style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                            {isPartial ? 'Partial — Full Pmt Required' : 'Awaiting Payment'}
                          </span>
                          <button onClick={() => handleCheckPayment(sale)}
                            disabled={checkingPayment.has(sale.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                            style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                            {checkingPayment.has(sale.id)
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <CreditCard className="w-3 h-3" />}
                            Check Payment
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Medicine rows — only when expanded */}
                  {isExpanded && (
                    <>
                      <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                        {sale.items?.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 pl-12 pr-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                                {displayNameMap.get(item.drug_id ?? item.drug_master_id ?? '') ?? (item.drug ?? item.master)?.name ?? 'Drug'}
                              </p>
                              {(item.drug ?? item.master)?.strength && (
                                <p className="text-xs" style={{ color: '#94A3B8' }}>{(item.drug ?? item.master)?.strength}</p>
                              )}
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                              style={{ background: '#F1F5F9', color: '#475569' }}>
                              × {item.qty}
                            </span>
                            <Money amount={item.amount} className="text-sm font-semibold w-20 text-right"
                              style={{ color: '#0F172A' }} />
                          </div>
                        ))}
                      </div>

                      {/* Bill summary footer */}
                      <div className="px-4 py-3 space-y-1.5" style={{ borderTop: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium" style={{ color: '#64748B' }}>Total</span>
                          <Money amount={bs.total} className="font-bold" style={{ color: '#0F172A' }} />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: '#64748B' }}>Paid</span>
                          <Money amount={bs.paid} className="font-semibold"
                            style={{ color: bs.paid > 0 ? '#15803D' : '#94A3B8' }} />
                        </div>
                        {balance > 0 && (
                          <div className="flex items-center justify-between text-sm font-semibold"
                            style={{ paddingTop: '4px', borderTop: '1px dashed #E2E8F0' }}>
                            <span style={{ color: '#DC2626' }}>Balance Due</span>
                            <Money amount={balance} style={{ color: '#DC2626' }} />
                          </div>
                        )}
                        {fulfillErrors.get(sale.id) && (
                          <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: '#DC2626' }}>
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            {fulfillErrors.get(sale.id)}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </GlassCard>
              )
            })
          )}
        </div>
      </div>

      {/* ── Fulfilled sale history ── */}
      {initialFulfilledSales.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 mt-2" style={{ color: '#94A3B8' }}>
            Sale History — Fulfilled ({initialFulfilledSales.length})
          </h3>
          <div className="space-y-1.5">
            {initialFulfilledSales.map((sale) => {
              const isOpen   = expandedHistory.has(sale.id)
              const saleDate = new Date(sale.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })
              const total    = sale.bill?.total ?? 0
              return (
                <div key={sale.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                  <button onClick={() => setExpandedHistory(prev => { const n = new Set(prev); n.has(sale.id) ? n.delete(sale.id) : n.add(sale.id); return n })}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    style={{ background: isOpen ? 'rgba(16,185,129,0.05)' : '#FAFAFA', border: 'none', cursor: 'pointer' }}>
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#94A3B8' }} />
                      : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#94A3B8' }} />}
                    <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                        {sale.patient?.full_name ?? 'Walk-in'}
                      </span>
                      {sale.patient?.uhid && (
                        <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{sale.patient.uhid}</span>
                      )}
                      <span className="text-xs" style={{ color: '#94A3B8' }}>{saleDate}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-md"
                        style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                        Fulfilled
                      </span>
                    </div>
                    {total > 0 && <Money amount={total} className="text-sm font-semibold flex-shrink-0" style={{ color: '#0D9488' }} />}
                  </button>
                  {isOpen && sale.items && sale.items.length > 0 && (
                    <div className="px-5 py-1.5 space-y-1 border-t" style={{ borderColor: '#F1F5F9' }}>
                      {sale.items.map((item) => {
                        const drugName = item.drug?.name ?? item.master?.name ?? 'Drug'
                        const lineTotal = (item.unit_price ?? 0) * item.qty
                        return (
                          <div key={item.id} className="flex items-center justify-between text-xs py-1"
                            style={{ borderBottom: '1px solid #F8FAFC' }}>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: '#10B981' }} />
                              <span style={{ color: '#0F172A' }}>{drugName}</span>
                              <span style={{ color: '#94A3B8' }}>× {item.qty}</span>
                            </div>
                            {lineTotal > 0 && <Money amount={lineTotal} style={{ color: '#0D9488' }} />}
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
      )}
    </div>
  )
}
