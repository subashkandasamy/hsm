'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, ArrowLeft, Check, Copy, FileUp, Loader2, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import PageHeader from '@/components/ui/PageHeader'
import { useDrugSearch } from '@/lib/hooks/useDrugSearch'
import { ensureReceiptLabels, lastBatchFor, receiveStock, resolveProductCode, rememberProductCode, type PrefillLine, type StockReceiptLine, type StockReceiptSummary } from '@/app/actions/pharmacy'
import { useScanListener } from '@/lib/hooks/useScanListener'
import { istToday } from '@/lib/istDate'
import type { Drug } from '@/lib/types'
import ImportInvoicePanel, { type ImportedLine } from './ImportInvoicePanel'

/** A row being typed. Everything except batch / expiry / qty / rate comes from the master. */
interface Line {
  key: string
  drug: Drug | null
  brandName: string | null
  batch: string
  /** MM/YY as printed on the pack. */
  expiry: string
  packs: string
  packSize: string
  packUnit: string
  free: string
  rate: string
  mrp: string
  hsn: string
  gst: string
  manufacturer: string
  storage: string
  reorder: string
  showMore: boolean
  /** A scanned pack the counter has not been taught yet — remembered once the
   *  medicine on this line is picked. */
  scanCode?: string
  scanNote?: string
  /** The medicine name as an imported invoice spelt it, when it came from a file. */
  rawName?: string
  /** The catalogue match was a guess — worth a glance before saving. */
  needsCheck?: boolean
}

let seq = 0
const newLine = (): Line => ({
  key: `l${++seq}`, drug: null, brandName: null, batch: '', expiry: '', packs: '', packSize: '', packUnit: '',
  free: '', rate: '', mrp: '', hsn: '', gst: '', manufacturer: '', storage: '', reorder: '', showMore: false,
})

const num = (v: string) => (v.trim() === '' ? null : Number(v))
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const input: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: '0.5rem', padding: '0.4rem 0.55rem',
  fontSize: '0.875rem', color: '#0F172A', background: '#fff', width: '100%', minHeight: '38px',
}
const btn = (primary = false): React.CSSProperties => primary
  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
  : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }

/** "0928" / "09/28" / "09/2028" → the last day of that month. */
export function expiryToDate(mmyy: string): string | null {
  const m = /^(\d{2})\s*\/?\s*(\d{2}|\d{4})$/.exec(mmyy.trim())
  if (!m) return null
  const month = Number(m[1])
  if (month < 1 || month > 12) return null
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return last
}
/** '2028-09-30' → '09/28', the form's own way of writing an expiry. */
const isoToMmYy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(2, 4)}`

const monthsUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.now()) / (30.44 * 86400000))

interface Props {
  initialDrug: Drug | null
  /** Rows pre-filled from what is below the reorder level. */
  prefill: PrefillLine[]
  lastSupplier: string | null
  recent: StockReceiptSummary[]
}

export default function ReceiveStockClient({ initialDrug, prefill, lastSupplier, recent }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ created: number; merged: number; units: number; receiptId: string } | null>(null)
  const [labelling, setLabelling] = useState(false)

  const [header, setHeader] = useState({
    supplier: lastSupplier ?? '', invoiceNo: '', invoiceDate: istToday(), invoiceTotal: '', opening: false,
  })
  const [lines, setLines] = useState<Line[]>(() => {
    if (prefill.length) return prefill.map(fromPrefill)
    const l = newLine()
    if (initialDrug) return [applyDrug(l, initialDrug, null)]
    return [l]
  })

  const [scanMsg, setScanMsg] = useState<{ id: number; tone: 'ok' | 'warn'; text: string } | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const scanBusyRef = useRef(false)
  const flashSeq = useRef(0)
  const scanBoxRef = useRef<HTMLInputElement>(null)
  const [typedCode, setTypedCode] = useState('')

  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<{ total: number; unmatched: number; unsure: number } | null>(null)

  const set = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const addLine = () => setLines((ls) => [...ls, newLine()])
  const removeLine = (key: string) => setLines((ls) => (ls.length === 1 ? [newLine()] : ls.filter((l) => l.key !== key)))

  /** Turns a read invoice into rows of this form, matched where the catalogue was sure. */
  function loadImported(rows: ImportedLine[]) {
    const next = rows.map(({ row, match }) => {
      let l: Line = {
        ...newLine(),
        batch: row.batch,
        expiry: row.expiry,
        packs: row.packs,
        free: row.free,
        rate: row.rate,
        mrp: row.mrp,
        packSize: row.packSize,
        hsn: row.hsn,
        gst: row.gst,
        manufacturer: row.manufacturer,
        rawName: row.name,
      }
      if (match.drug) {
        l = applyDrug(l, match.drug, match.brand)
        // What the invoice itself says wins over the catalogue's defaults.
        if (row.packSize) l.packSize = row.packSize
        if (row.hsn) l.hsn = row.hsn
        if (row.gst) l.gst = row.gst
        if (row.manufacturer) l.manufacturer = row.manufacturer
        l.needsCheck = match.confidence !== 'sure'
      }
      return l
    })
    // Keep anything already typed in; drop the untouched blank row.
    const kept = lines.filter((l) => l.drug || l.batch || l.packs)
    setLines([...kept, ...next])
    setImported({
      total: next.length,
      unmatched: next.filter((l) => !l.drug).length,
      unsure: next.filter((l) => l.needsCheck).length,
    })
    setImporting(false)
  }

  function flashScan(tone: 'ok' | 'warn', text: string) {
    const id = ++flashSeq.current
    setScanMsg({ id, tone, text })
    setTimeout(() => setScanMsg((m) => (m?.id === id ? null : m)), 4000)
  }

  /**
   * A scanned pack goes onto the first line still empty, or onto a new one.
   * Receiving is the best moment to learn a code: the box is in your hand and
   * you are about to say what it is anyway.
   */
  async function handleScan(code: string) {
    if (scanBusyRef.current) return
    scanBusyRef.current = true
    setScanBusy(true)
    try {
      const found = await resolveProductCode(code)
      if (found.status === 'unreadable') { flashScan('warn', 'That code could not be read'); return }

      // Where to put it: the first untouched row, else a fresh one.
      let key = lines.find((l) => !l.drug && !l.batch && !l.packs && !l.scanCode)?.key
      if (!key) {
        const fresh = newLine()
        key = fresh.key
        setLines((ls) => [...ls, fresh])
      }

      const g = found.scanned
      const fromCode: Partial<Line> = {
        ...(g.batch ? { batch: g.batch } : {}),
        ...(g.expiry ? { expiry: isoToMmYy(g.expiry) } : {}),
      }

      if (found.status === 'unknown') {
        set(key, { ...fromCode, scanCode: g.raw })
        flashScan('warn', g.batch || g.expiry
          ? 'New pack — batch and expiry read from the code. Pick the medicine and it will be remembered.'
          : 'New pack — pick the medicine and this code will be remembered.')
        return
      }

      const p = found.product
      // What the last purchase of this medicine knew — pack, rate, HSN, GST — and
      // where it was never bought before, what the catalogue says about the brand.
      const last = await lastBatchFor({ id: p.id, isGlobal: p.isGlobal })
      const b = p.brand
      set(key, {
        drug: { id: p.id, name: p.name, generic_name: null, form: p.form, strength: p.strength, unit: null, is_active: true, is_global: p.isGlobal },
        brandName: p.brandName,
        packSize: String(last?.pack_size ?? b?.pack_size ?? 1),
        packUnit: last?.pack_unit ?? b?.pack_unit ?? 'strip',
        hsn: last?.hsn_code ?? b?.hsn_code ?? '30049099',
        gst: String(last?.gst_rate ?? b?.gst_rate ?? 12),
        manufacturer: last?.manufacturer ?? b?.manufacturer ?? '',
        ...(last ? {
          mrp: last.mrp != null ? String(last.mrp) : '',
          rate: last.purchase_price != null ? String(last.purchase_price) : '',
          storage: last.storage_location ?? '',
        } : {}),
        ...fromCode,
      })
      flashScan('ok', `${p.brandName ?? p.name}${g.batch ? ` · batch ${g.batch}` : ''}${g.expiry ? ` · exp ${isoToMmYy(g.expiry)}` : ''}`)
    } finally {
      scanBusyRef.current = false
      setScanBusy(false)
      setTypedCode('')
      scanBoxRef.current?.focus()
    }
  }

  /** Called when a line with a pending scan finally gets its medicine. */
  async function teachPendingCode(l: Line, drugId: string, isGlobal: boolean, brand: string | null) {
    if (!l.scanCode) return
    const res = await rememberProductCode(l.scanCode, { id: drugId, isGlobal }, brand)
    if (res.success) {
      set(l.key, { scanCode: undefined, scanNote: 'pack remembered' })
      flashScan('ok', `${brand ?? 'That pack'} will scan straight in from now on`)
    } else {
      set(l.key, { scanCode: undefined })
      flashScan('warn', res.error)
    }
  }

  useScanListener((code) => { void handleScan(code) }, true)

  const totals = useMemo(() => {
    let cost = 0, units = 0, filled = 0
    for (const l of lines) {
      const qty = unitsOf(l)
      if (!l.drug || !qty) continue
      filled++
      units += qty + freeUnitsOf(l)
      const rate = num(l.rate)
      if (rate != null) cost += rate * (Number(l.packs) || 0)
    }
    return { cost, units, filled }
  }, [lines])

  const invoiceTotal = num(header.invoiceTotal)
  const mismatch = invoiceTotal != null && totals.cost > 0 && Math.abs(invoiceTotal - totals.cost) > 1

  function save() {
    setError('')
    const payload: StockReceiptLine[] = []
    for (const l of lines) {
      if (!l.drug && !l.batch && !l.expiry && !l.packs) continue // untouched row
      if (!l.drug) { setError('Pick the medicine on every line'); return }
      const expiry = expiryToDate(l.expiry)
      if (!expiry) { setError(`${label(l)}: enter the expiry as MM/YY, e.g. 09/28`); return }
      if (expiry <= istToday()) { setError(`${label(l)}: that expiry has passed`); return }
      const qty = unitsOf(l)
      if (!qty) { setError(`${label(l)}: enter the quantity`); return }
      if (!l.batch.trim()) { setError(`${label(l)}: enter the batch number`); return }
      const mrp = num(l.mrp)
      if (mrp == null || mrp <= 0) { setError(`${label(l)}: enter the MRP`); return }
      payload.push({
        drug_master_id: l.drug.is_global ? l.drug.id : null,
        drug_id: l.drug.is_global ? null : l.drug.id,
        brand_name: l.brandName, manufacturer: l.manufacturer || null,
        batch_no: l.batch.trim(), expiry,
        qty_available: qty, free_qty: freeUnitsOf(l),
        purchase_price: num(l.rate), mrp,
        pack_size: num(l.packSize), pack_unit: l.packUnit || null,
        hsn_code: l.hsn || null, gst_rate: num(l.gst),
        reorder_level: num(l.reorder) ?? 0, storage_location: l.storage || null,
      })
    }
    if (!payload.length) { setError('Add at least one medicine'); return }

    startTransition(async () => {
      const res = await receiveStock({
        supplier_name: header.supplier || null,
        invoice_no: header.invoiceNo || null,
        invoice_date: header.invoiceDate || null,
        invoice_total: num(header.invoiceTotal),
        opening_stock: header.opening,
      }, payload)
      if (!res.success) { setError(res.error); return }
      setDone({ created: res.created, merged: res.merged, units: res.units, receiptId: res.receiptId })
      setLines([newLine()])
      setHeader((h) => ({ ...h, invoiceNo: '', invoiceTotal: '' }))
    })
  }

  return (
    <div>
      <PageHeader
        title="Receive stock"
        subtitle="One invoice at a time. Pick the medicine and the rest fills in from the catalogue — type only batch, expiry, quantity and rate."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => { setImporting(true); setImported(null) }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium" style={btn()}>
              <FileUp className="w-4 h-4" /> Import invoice
            </button>
            <button onClick={() => router.push('/pharmacy')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium" style={btn()}>
              <ArrowLeft className="w-4 h-4" /> Back to pharmacy
            </button>
          </div>
        }
      />

      {done && (
        <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 flex-wrap" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' }}>
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">
            Received {done.units} units · {done.created} new batch{done.created === 1 ? '' : 'es'}
            {done.merged ? ` · ${done.merged} added to an existing batch` : ''}
          </span>
          {done.created > 0 && (
            <button
              disabled={labelling}
              onClick={async () => {
                // Codes are minted first, then the sheet is opened — a label must
                // never print a barcode the database does not know.
                setLabelling(true)
                const res = await ensureReceiptLabels(done.receiptId)
                setLabelling(false)
                if (!res.success) { setError(res.error); return }
                window.open(`/print/batch-labels/pdf?receipt=${done.receiptId}&copies=packs`, '_blank')
              }}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={btn(true)}>
              {labelling ? 'Preparing…' : 'Print shelf labels'}
            </button>
          )}
          <button onClick={() => { setDone(null); router.push('/pharmacy') }} className={done.created > 0 ? 'px-3 py-1.5 rounded-lg text-xs font-medium' : 'ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold'} style={done.created > 0 ? btn() : btn(true)}>
            Go to stock
          </button>
          <button onClick={() => setDone(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={btn()}>Receive another invoice</button>
        </div>
      )}

      {prefill.length > 0 && (
        <p className="mb-3 text-sm px-3 py-2 rounded-xl" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          {prefill.length} medicine{prefill.length === 1 ? ' is' : 's are'} at or below the reorder level. Quantities are a suggestion — change them, and remove anything you are not buying.
        </p>
      )}

      {importing && <ImportInvoicePanel onLoad={loadImported} onClose={() => setImporting(false)} />}

      {imported && (
        <p className="mb-3 text-sm px-3 py-2 rounded-xl flex items-center gap-2 flex-wrap"
          style={imported.unmatched || imported.unsure
            ? { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }
            : { background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
          <span>
            {imported.total} line{imported.total === 1 ? '' : 's'} read from the invoice
            {imported.unmatched ? ` · ${imported.unmatched} need the medicine picked` : ''}
            {imported.unsure ? ` · ${imported.unsure} to check` : ''}
            {!imported.unmatched && !imported.unsure ? ' · all matched' : ''}
          </span>
          <button onClick={() => setImported(null)} className="ml-auto text-xs underline"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>dismiss</button>
        </p>
      )}

      {/* Invoice header — typed once */}
      <GlassCard className="p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Supplier</span>
            <input value={header.supplier} onChange={(e) => setHeader((h) => ({ ...h, supplier: e.target.value }))} placeholder="e.g. Apex Pharma Distributors" style={input} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Invoice no.</span>
            <input value={header.invoiceNo} onChange={(e) => setHeader((h) => ({ ...h, invoiceNo: e.target.value }))} placeholder="INV-2291" style={input} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Invoice date</span>
            <input type="date" max={istToday()} value={header.invoiceDate} onChange={(e) => setHeader((h) => ({ ...h, invoiceDate: e.target.value }))} style={input} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Invoice total (₹)</span>
            <input type="number" inputMode="decimal" step="0.01" value={header.invoiceTotal} onChange={(e) => setHeader((h) => ({ ...h, invoiceTotal: e.target.value }))} placeholder="to check the lines" style={input} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm mt-3" style={{ color: '#334155' }}>
          <input type="checkbox" checked={header.opening} onChange={(e) => setHeader((h) => ({ ...h, opening: e.target.checked }))} />
          Opening stock (no purchase invoice)
        </label>
      </GlassCard>

      {recent.length > 0 && (
        <p className="mb-3 text-xs" style={{ color: '#64748B' }}>
          <span className="font-medium" style={{ color: '#334155' }}>Recent: </span>
          {recent.slice(0, 3).map((r) => {
            // A receipt whose lines went into batches that already existed has no batches of its own.
            const what = r.units ? `${r.units} units` : 'added to existing batches'
            return `${r.supplier_name ?? 'Opening stock'}${r.invoice_no ? ` · ${r.invoice_no}` : ''} · ${what}`
          }).join('   |   ')}
        </p>
      )}

      {/* Scan a pack straight onto a line */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 px-2.5 rounded-xl flex-1" style={{ border: '1px dashed #CBD5E1', background: '#fff', minHeight: '40px', minWidth: 260 }}>
          {scanBusy
            ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#0D9488' }} />
            : <ScanBarcode className="w-4 h-4 flex-shrink-0" style={{ color: '#94A3B8' }} />}
          <input
            ref={scanBoxRef}
            value={typedCode}
            onChange={(e) => setTypedCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && typedCode.trim()) { e.preventDefault(); void handleScan(typedCode.trim()) } }}
            placeholder="Scan each pack as you unpack the box — click here first, then keep scanning"
            className="flex-1 text-sm py-2"
            style={{ border: 'none', outline: 'none', color: '#0F172A', background: 'transparent' }} />
        </div>
        {scanMsg && (
          <span className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={scanMsg.tone === 'ok'
              ? { background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
              : { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
            {scanMsg.text}
          </span>
        )}
      </div>

      {/* Lines */}
      <div className="space-y-2">
        {lines.map((l, i) => (
          <LineRow key={l.key} line={l} index={i} set={set} remove={() => removeLine(l.key)}
            onAddLine={addLine} isLast={i === lines.length - 1}
            onPicked={(drugId, isGlobal, brand) => void teachPendingCode(l, drugId, isGlobal, brand)} />
        ))}
      </div>

      <button onClick={addLine} className="flex items-center gap-1.5 mt-3 px-3 py-2 rounded-xl text-sm font-medium" style={btn()}>
        <Plus className="w-4 h-4" /> Add medicine
      </button>

      {/* Totals + save */}
      <GlassCard className="p-4 mt-4 sticky bottom-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm" style={{ color: '#334155' }}>
            <span className="font-semibold">{totals.filled}</span> medicine{totals.filled === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold">{totals.units}</span> units ·{' '}
            <span className="font-semibold">{money(totals.cost)}</span> purchase value
          </div>
          {mismatch && (
            <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
              <AlertTriangle className="w-3.5 h-3.5" /> Invoice says {money(invoiceTotal!)} — difference {money(Math.abs(invoiceTotal! - totals.cost))}
            </span>
          )}
          {error && <span className="text-xs font-medium" style={{ color: '#B91C1C' }}>{error}</span>}
          <button onClick={save} disabled={isPending} className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold" style={{ ...btn(true), opacity: isPending ? 0.7 : 1 }}>
            {isPending ? 'Saving…' : 'Receive stock'}
          </button>
        </div>
      </GlassCard>
    </div>
  )
}

/** A low-stock medicine as a ready row: everything but batch and expiry filled in. */
function fromPrefill(p: PrefillLine): Line {
  return {
    ...newLine(),
    drug: {
      id: (p.drugMasterId ?? p.drugId)!, name: p.name, generic_name: null, form: p.form,
      strength: p.strength, unit: p.unit, is_active: true, is_global: !!p.drugMasterId,
    },
    brandName: p.brandName,
    packSize: p.packSize != null ? String(p.packSize) : '1',
    packUnit: p.packUnit ?? 'strip',
    packs: p.suggestedPacks != null ? String(p.suggestedPacks) : '',
    rate: p.rate != null ? String(p.rate) : '',
    mrp: p.mrp != null ? String(p.mrp) : '',
    hsn: p.hsn ?? '30049099',
    gst: p.gst != null ? String(p.gst) : '12',
    manufacturer: p.manufacturer ?? '',
    reorder: String(p.reorderLevel),
  }
}

const label = (l: Line) => l.brandName || l.drug?.name || 'This line'
/** What a "unit" is once a pack is opened — the master's `unit` holds the strength (mg). */
function countedUnit(l: Line): string {
  const form = (l.drug?.form ?? '').toLowerCase()
  if (/tablet|tab\b/.test(form)) return 'tablets'
  if (/capsule|cap\b/.test(form)) return 'capsules'
  if (Number(l.packSize) <= 1) return l.packUnit ? `${l.packUnit}s` : 'units'
  return 'units'
}
const unitsOf = (l: Line) => (Number(l.packs) || 0) * (Number(l.packSize) || 1)
const freeUnitsOf = (l: Line) => (Number(l.free) || 0) * (Number(l.packSize) || 1)

/** Fills everything the catalogue knows, so only batch / expiry / qty / rate are left. */
function applyDrug(l: Line, d: Drug, brand: string | null): Line {
  const b = (d.brand_data ?? []).find((x) => x.brand_name === brand) ?? (d.brand_data ?? [])[0]
  return {
    ...l, drug: d, brandName: brand ?? b?.brand_name ?? null,
    packSize: b?.pack_size ? String(b.pack_size) : (l.packSize || '1'),
    packUnit: b?.pack_unit ?? (l.packUnit || 'strip'),
    hsn: b?.hsn_code ?? (l.hsn || '30049099'),
    gst: b?.gst_rate != null ? String(b.gst_rate) : (l.gst || '12'),
    manufacturer: b?.manufacturer ?? l.manufacturer,
  }
}

function LineRow({ line: l, index, set, remove, onAddLine, isLast, onPicked }: {
  line: Line; index: number; set: (key: string, patch: Partial<Line>) => void
  remove: () => void; onAddLine: () => void; isLast: boolean
  onPicked?: (drugId: string, isGlobal: boolean, brand: string | null) => void
}) {
  // An imported line starts with the invoice's own wording in the box, so picking
  // the medicine is a glance and a click rather than retyping it.
  const [query, setQuery] = useState(l.drug ? '' : (l.rawName ?? ''))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = useDrugSearch(query, 8)
  const batchRef = useRef<HTMLInputElement>(null)

  const expiryIso = expiryToDate(l.expiry)
  const months = expiryIso ? monthsUntil(expiryIso) : null
  const rate = num(l.rate), mrp = num(l.mrp)
  const margin = rate != null && mrp != null && rate > 0 && l.packSize ? ((mrp * Number(l.packSize) - rate) / rate) * 100 : null

  function pick(d: Drug, brand: string | null) {
    const next = applyDrug(l, d, brand)
    // On an imported line the invoice's own pack size is what actually arrived,
    // so it outranks the catalogue's default for that brand.
    if (l.rawName && l.packSize) next.packSize = l.packSize
    set(l.key, next)
    // A pack scanned a moment ago now has a name: remember it for next time.
    if (l.scanCode) onPicked?.(d.id, !!d.is_global, next.brandName ?? brand)
    setOpen(false); setQuery('')
    setTimeout(() => batchRef.current?.focus(), 30)
  }

  async function copyLast() {
    if (!l.drug) return
    const b = await lastBatchFor({ id: l.drug.id, isGlobal: !!l.drug.is_global })
    if (!b) return
    set(l.key, {
      packSize: b.pack_size ? String(b.pack_size) : l.packSize,
      packUnit: b.pack_unit ?? l.packUnit,
      mrp: b.mrp != null ? String(b.mrp) : l.mrp,
      rate: b.purchase_price != null ? String(b.purchase_price) : l.rate,
      hsn: b.hsn_code ?? l.hsn,
      gst: b.gst_rate != null ? String(b.gst_rate) : l.gst,
      manufacturer: b.manufacturer ?? l.manufacturer,
      storage: b.storage_location ?? l.storage,
    })
  }

  return (
    <GlassCard className="p-3">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-xs font-semibold mt-2.5 w-5 text-right" style={{ color: '#94A3B8' }}>{index + 1}</span>

        {/* Medicine */}
        <div className="flex-1 min-w-[230px] relative">
          {l.drug ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>
                  {l.brandName ?? l.drug.name}
                  {l.drug.strength ? <span style={{ color: '#475569' }}> · {l.drug.strength}</span> : null}
                  {l.needsCheck && (
                    <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-md font-medium align-middle"
                      style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>check</span>
                  )}
                  {l.scanNote && (
                    <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-md font-medium align-middle"
                      style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>{l.scanNote}</span>
                  )}
                </p>
                {l.rawName && (
                  <p className="text-xs truncate" style={{ color: '#CBD5E1' }}>invoice: {l.rawName}</p>
                )}
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  {l.drug.name}{l.packSize ? ` · pack ${l.packSize} ${l.packUnit}` : ''}{l.hsn ? ` · HSN ${l.hsn}` : ''}{l.gst ? ` · GST ${l.gst}%` : ''}
                </p>
              </div>
              <button onClick={() => set(l.key, { drug: null, brandName: null })} title="Change medicine" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {l.scanCode && (
                <p className="text-xs mb-1 font-mono truncate" style={{ color: '#B45309' }}>
                  scanned {l.scanCode} — which medicine?
                </p>
              )}
              <div className="flex items-center gap-1.5 px-2 rounded-lg" style={{ border: `1px solid ${l.scanCode ? '#FDE68A' : '#E2E8F0'}`, background: '#fff', minHeight: '38px' }}>
                <Search className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                <input
                  autoFocus={isLast && index > 0}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setOpen(e.target.value.trim().length >= 2); setActive(0) }}
                  onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
                  onKeyDown={(e) => {
                    if (!open || !results.length) return
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                    else if (e.key === 'Enter') {
                      e.preventDefault()
                      const d = results[active]
                      const q = query.trim().toLowerCase()
                      const brand = (d.brand_aliases ?? []).find((b) => b.toLowerCase().includes(q)) ?? null
                      pick(d, brand)
                    } else if (e.key === 'Escape') setOpen(false)
                  }}
                  placeholder="Type brand or salt, or scan…"
                  className="flex-1 text-sm" style={{ border: 'none', outline: 'none', color: '#0F172A' }} />
              </div>
              {open && results.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl overflow-hidden"
                  style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', maxHeight: 260, overflowY: 'auto' }}>
                  {results.map((d, idx) => {
                    const q = query.trim().toLowerCase()
                    const brand = (d.brand_aliases ?? []).find((b) => b.toLowerCase().includes(q)) ?? (d.brand_aliases ?? [])[0] ?? null
                    const b = (d.brand_data ?? []).find((x) => x.brand_name === brand)
                    return (
                      <li key={d.id}>
                        <button onMouseDown={() => pick(d, brand)} onMouseEnter={() => setActive(idx)}
                          className="w-full text-left px-3 py-2 text-sm"
                          style={{ background: idx === active ? 'rgba(13,148,136,0.08)' : 'transparent', border: 'none', cursor: 'pointer', color: '#0F172A' }}>
                          <span className="font-medium">{brand ?? d.name}</span>
                          {d.strength ? <span style={{ color: '#475569' }}> · {d.strength}</span> : null}
                          {d.form ? <span style={{ color: '#94A3B8' }}> ({d.form})</span> : null}
                          <span className="block text-xs" style={{ color: '#94A3B8' }}>
                            {d.name}{b?.pack_size ? ` · pack ${b.pack_size} ${b.pack_unit ?? ''}` : ''}{b?.manufacturer ? ` · ${b.manufacturer}` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {/* The four typed fields */}
        <label className="w-[110px]">
          <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>Batch</span>
          <input ref={batchRef} value={l.batch} onChange={(e) => set(l.key, { batch: e.target.value })} placeholder="B2291" style={input} />
        </label>
        <label className="w-[92px]">
          <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>Expiry</span>
          <input value={l.expiry} onChange={(e) => set(l.key, { expiry: e.target.value })} placeholder="MM/YY" inputMode="numeric" style={{
            ...input,
            borderColor: l.expiry && !expiryIso ? '#FCA5A5' : months != null && months < 3 ? '#FDE68A' : '#E2E8F0',
          }} />
        </label>
        <label className="w-[86px]">
          <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>{l.packUnit ? `${l.packUnit}s` : 'Packs'}</span>
          <input value={l.packs} onChange={(e) => set(l.key, { packs: e.target.value })} placeholder="10" inputMode="numeric" style={input} />
        </label>
        <label className="w-[80px]">
          <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>Free</span>
          <input value={l.free} onChange={(e) => set(l.key, { free: e.target.value })} placeholder="0" inputMode="numeric" style={input} />
        </label>
        <label className="w-[96px]">
          <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>Rate / pack</span>
          <input value={l.rate} onChange={(e) => set(l.key, { rate: e.target.value })} placeholder="80" inputMode="decimal" style={input} />
        </label>
        <label className="w-[96px]">
          <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>MRP / unit</span>
          <input value={l.mrp} onChange={(e) => set(l.key, { mrp: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && isLast) { e.preventDefault(); onAddLine() } }}
            placeholder="10.50" inputMode="decimal" style={input} />
        </label>
        <button onClick={remove} title="Remove line" className="mt-5" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1' }}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Row feedback */}
      <div className="flex items-center gap-3 flex-wrap mt-1.5 pl-7 text-xs">
        {unitsOf(l) > 0 && (
          <span style={{ color: '#475569' }}>
            = <strong>{unitsOf(l) + freeUnitsOf(l)}</strong> {countedUnit(l)}
            {freeUnitsOf(l) > 0 ? ` (incl. ${freeUnitsOf(l)} free)` : ''}
          </span>
        )}
        {expiryIso && <span style={{ color: months != null && months < 3 ? '#B45309' : '#94A3B8' }}>expires {new Date(`${expiryIso}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}{months != null && months < 3 ? ` · only ${months} month${months === 1 ? '' : 's'} left` : ''}</span>}
        {l.expiry && !expiryIso && <span style={{ color: '#B91C1C' }}>expiry as MM/YY, e.g. 09/28</span>}
        {margin != null && <span style={{ color: margin < 0 ? '#B91C1C' : '#15803D' }}>margin {margin.toFixed(0)}%</span>}
        {rate != null && mrp != null && l.packSize && rate > mrp * Number(l.packSize) && <span style={{ color: '#B91C1C' }}>rate is above MRP — check</span>}
        {l.drug && (
          <button onClick={copyLast} className="flex items-center gap-1" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0D9488' }}>
            <Copy className="w-3 h-3" /> same as last time
          </button>
        )}
        {l.drug && (
          <button onClick={() => set(l.key, { showMore: !l.showMore })}
            className="underline underline-offset-2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0D9488' }}>
            {l.showMore ? 'Hide details' : 'Edit pack, HSN, GST, storage'}
          </button>
        )}
      </div>

      {l.showMore && l.drug && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-2 pl-7">
          {([
            ['packSize', 'Pack size'], ['packUnit', 'Pack unit'], ['hsn', 'HSN'], ['gst', 'GST %'],
            ['storage', 'Rack / shelf'], ['reorder', 'Reorder level'],
          ] as const).map(([k, lab]) => (
            <label key={k}>
              <span className="block text-[11px] mb-0.5" style={{ color: '#94A3B8' }}>{lab}</span>
              <input value={l[k]} onChange={(e) => set(l.key, { [k]: e.target.value })} style={input} />
            </label>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
