'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Loader2, ExternalLink } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import H1RegisterView from './H1RegisterView'
import { listDispensedWithoutPrescription, listPurchaseRegister, type UnprescribedSupply, type PurchaseLine } from '@/app/actions/pharmacy'
import { istToday, istAddDays } from '@/lib/istDate'
import { downloadCsv, type CsvCell } from '@/lib/csv'
import type { DrugWithStock } from '@/lib/types'

type ReportKey = 'h1' | 'x' | 'norx' | 'expiry' | 'value' | 'purchases' | 'reportv'

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'h1',        label: 'H1 register' },
  { key: 'x',         label: 'X register' },
  { key: 'norx',      label: 'Without prescription' },
  { key: 'expiry',    label: 'Expiry' },
  { key: 'value',     label: 'Stock & value' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'reportv',   label: 'Report V' },
]

const inp: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: '0.5rem', padding: '0.4rem 0.6rem',
  fontSize: '0.875rem', color: '#0F172A', background: '#fff', minHeight: '38px',
}
const r2 = (n: number) => Math.round(n * 100) / 100
const monthStart = () => `${istToday().slice(0, 8)}01`

/** Every report in one place, under the Pharmacy tab that used to be "H1 Register". */
export default function PharmacyReportsView({ stock }: { stock: DrugWithStock[] }) {
  const [report, setReport] = useState<ReportKey>('h1')
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Pharmacy reports">
        {REPORTS.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={report === key} onClick={() => setReport(key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0"
            style={report === key
              ? { background: '#0F172A', color: '#fff', border: '1px solid #0F172A' }
              : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0' }}>
            {label}
          </button>
        ))}
      </div>
      {report === 'h1'        && <H1RegisterView schedule="H1" />}
      {report === 'x'         && <H1RegisterView schedule="X" />}
      {report === 'norx'      && <NoPrescriptionReport />}
      {report === 'expiry'    && <ExpiryReport stock={stock} />}
      {report === 'value'     && <StockValueReport stock={stock} />}
      {report === 'purchases' && <PurchaseReport />}
      {report === 'reportv'   && <ReportVCard />}
    </div>
  )
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function Header({ title, about, children }: { title: string; about: string; children?: React.ReactNode }) {
  return (
    <GlassCard className="p-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{about}</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">{children}</div>
      </div>
    </GlassCard>
  )
}

function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <>
      <label className="block">
        <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>From</span>
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={inp} />
      </label>
      <label className="block">
        <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>To</span>
        <input type="date" value={to} min={from} max={istToday()} onChange={(e) => setTo(e.target.value)} style={inp} />
      </label>
    </>
  )
}

function ExportButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
      style={{ background: disabled ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <Download className="w-4 h-4" /> Export CSV
    </button>
  )
}

function Loading({ what }: { what: string }) {
  return (
    <GlassCard className="p-6">
      <p className="flex items-center justify-center gap-2 text-sm" style={{ color: '#94A3B8' }}>
        <Loader2 className="w-4 h-4 animate-spin" /> {what}
      </p>
    </GlassCard>
  )
}

function Table({ head, minWidth = 800, children, foot }: { head: string[]; minWidth?: number; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <GlassCard className="p-0 overflow-x-auto">
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth }}>
        <thead>
          <tr style={{ background: '#F8FAFC', color: '#64748B' }}>
            {head.map((h) => <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </GlassCard>
  )
}

const td = 'px-3 py-2'
const rowStyle: React.CSSProperties = { borderTop: '1px solid #F1F5F9', color: '#0F172A' }

// ── Without a prescription ──────────────────────────────────────────────────

function NoPrescriptionReport() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(istToday())
  const [rows, setRows] = useState<UnprescribedSupply[] | null>(null)

  useEffect(() => {
    let live = true
    listDispensedWithoutPrescription(from, to)
      .then((r) => { if (live) setRows(r) })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [from, to])

  const head = ['Date', 'Schedule', 'Patient', 'UHID', 'Medicine', 'Brand', 'Batch', 'Qty', 'Ward', 'Dispensed by']
  const csvRows = (rows ?? []).map((r): CsvCell[] => [
    r.dispensed_at, r.schedule, r.patient_name, r.patient_uhid, r.drug_name, r.brand_name, r.batch_no, r.qty, r.inpatient ? 'yes' : '', r.dispensed_by,
  ])

  return (
    <div className="space-y-3">
      <Header title="Prescription-only medicines dispensed without a prescription"
        about="Schedule H, H1 and X medicines must be supplied against a prescription. These left the pharmacy with none linked to them. For a ward patient, check the ward order instead.">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <ExportButton disabled={!rows?.length} onClick={() => downloadCsv(`dispensed-without-prescription_${from}_to_${to}.csv`, head, csvRows)} />
      </Header>
      {rows === null ? <Loading what="Checking every supply…" /> : rows.length === 0 ? (
        <GlassCard className="p-6"><EmptyState title="Nothing to review" description="Every prescription-only medicine in this period had a prescription linked." /></GlassCard>
      ) : (
        <Table head={['Date', 'Schedule', 'Patient', 'Medicine', 'Batch', 'Qty', 'Dispensed by']} minWidth={760}>
          {rows.map((r, i) => (
            <tr key={i} style={rowStyle}>
              <td className={`${td} whitespace-nowrap`}><DateText date={r.dispensed_at} /></td>
              <td className={td}><span className="px-1.5 py-0.5 rounded-md font-semibold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{r.schedule}</span></td>
              <td className={td}>{r.patient_name ?? '—'}{r.patient_uhid && <span className="block" style={{ color: '#94A3B8' }}>{r.patient_uhid}</span>}</td>
              <td className={td}>
                <span className="font-medium">{r.brand_name ?? r.drug_name}</span>
                {r.inpatient && <span className="ml-1 text-xs" style={{ color: '#0D9488' }}>· ward</span>}
              </td>
              <td className={`${td} font-mono`}>{r.batch_no ?? '—'}</td>
              <td className={`${td} font-semibold`}>{r.qty}</td>
              <td className={td}>{r.dispensed_by ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ── Expiry ──────────────────────────────────────────────────────────────────

function ExpiryReport({ stock }: { stock: DrugWithStock[] }) {
  const [within, setWithin] = useState(90)
  const today = istToday()
  const limit = istAddDays(today, within)

  const rows = useMemo(() => stock.flatMap((d) => d.batches
    .filter((b) => b.qty_available > 0 && b.expiry <= limit)
    .map((b) => ({
      name: b.brand_name ?? d.name, generic: b.brand_name ? d.name : null, batch: b.batch_no, expiry: b.expiry,
      days: Math.round((Date.parse(`${b.expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000),
      qty: b.qty_available, cost: b.purchase_price != null ? r2(b.qty_available * b.purchase_price) : null, mrp: r2(b.qty_available * b.mrp),
    })))
    .sort((a, b) => a.expiry.localeCompare(b.expiry)), [stock, limit, today])

  const totCost = r2(rows.reduce((s, r) => s + (r.cost ?? 0), 0))
  const totMrp = r2(rows.reduce((s, r) => s + r.mrp, 0))
  const expired = rows.filter((r) => r.days < 0).length
  const head = ['Medicine', 'Generic', 'Batch', 'Expiry', 'Days left', 'Qty', 'Value at cost', 'Value at MRP']

  return (
    <div className="space-y-3">
      <Header title="Expiry" about={`Batches still on the shelf that have expired or expire within ${within} days. ${expired} already expired.`}>
        <label className="block">
          <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Expiring within</span>
          <select value={within} onChange={(e) => setWithin(Number(e.target.value))} style={inp}>
            {[30, 60, 90, 180].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>
        <ExportButton disabled={!rows.length} onClick={() => downloadCsv(`expiry_within-${within}-days_${today}.csv`, head,
          rows.map((r) => [r.name, r.generic, r.batch, r.expiry, r.days, r.qty, r.cost, r.mrp]))} />
      </Header>
      {rows.length === 0 ? (
        <GlassCard className="p-6"><EmptyState title="Nothing expiring" description={`No batch on the shelf expires within ${within} days.`} /></GlassCard>
      ) : (
        <Table head={['Medicine', 'Batch', 'Expiry', 'Days left', 'Qty', 'At cost', 'At MRP']}
          foot={<tr style={{ borderTop: '2px solid #E2E8F0', color: '#0F172A' }}>
            <td className={`${td} font-semibold`} colSpan={5}>Total</td>
            <td className={`${td} font-semibold`}><Money amount={totCost} /></td>
            <td className={`${td} font-semibold`}><Money amount={totMrp} /></td>
          </tr>}>
          {rows.map((r, i) => (
            <tr key={i} style={rowStyle}>
              <td className={td}><span className="font-medium">{r.name}</span>{r.generic && <span className="block" style={{ color: '#94A3B8' }}>{r.generic}</span>}</td>
              <td className={`${td} font-mono`}>{r.batch}</td>
              <td className={`${td} whitespace-nowrap`}><DateText date={r.expiry} /></td>
              <td className={`${td} font-semibold`} style={{ color: r.days < 0 ? '#DC2626' : r.days <= 30 ? '#B45309' : '#0F172A' }}>
                {r.days < 0 ? `expired ${-r.days}d ago` : `${r.days}d`}
              </td>
              <td className={td}>{r.qty}</td>
              <td className={td}>{r.cost == null ? <span style={{ color: '#94A3B8' }}>no cost</span> : <Money amount={r.cost} />}</td>
              <td className={td}><Money amount={r.mrp} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ── Stock & value ───────────────────────────────────────────────────────────

function StockValueReport({ stock }: { stock: DrugWithStock[] }) {
  const today = istToday()
  const rows = useMemo(() => stock.map((d) => {
    const onHand = d.batches.filter((b) => b.qty_available > 0)
    return {
      name: d.name, schedule: d.schedule ?? null,
      qty: onHand.reduce((s, b) => s + b.qty_available, 0),
      expiredQty: onHand.filter((b) => b.expiry < today).reduce((s, b) => s + b.qty_available, 0),
      cost: r2(onHand.reduce((s, b) => s + (b.purchase_price != null ? b.qty_available * b.purchase_price : 0), 0)),
      noCost: onHand.filter((b) => b.purchase_price == null).length,
      mrp: r2(onHand.reduce((s, b) => s + b.qty_available * b.mrp, 0)),
    }
  }).filter((r) => r.qty > 0).sort((a, b) => b.mrp - a.mrp), [stock, today])

  const totCost = r2(rows.reduce((s, r) => s + r.cost, 0))
  const totMrp = r2(rows.reduce((s, r) => s + r.mrp, 0))
  const noCost = rows.reduce((s, r) => s + r.noCost, 0)
  const head = ['Medicine', 'Schedule', 'Qty on hand', 'Of which expired', 'Value at cost', 'Value at MRP', 'Batches without a cost']

  return (
    <div className="space-y-3">
      <Header title="Stock on hand and its value"
        about={`What is on the shelf today, valued at purchase price and at MRP.${noCost ? ` ${noCost} batch${noCost === 1 ? ' has' : 'es have'} no purchase price recorded, so the value at cost is understated by those.` : ''}`}>
        <ExportButton disabled={!rows.length} onClick={() => downloadCsv(`stock-value_${today}.csv`, head,
          rows.map((r) => [r.name, r.schedule, r.qty, r.expiredQty, r.cost, r.mrp, r.noCost]))} />
      </Header>
      {rows.length === 0 ? (
        <GlassCard className="p-6"><EmptyState title="No stock" description="Nothing is on the shelf." /></GlassCard>
      ) : (
        <Table head={['Medicine', 'Qty', 'Expired', 'At cost', 'At MRP']} minWidth={620}
          foot={<tr style={{ borderTop: '2px solid #E2E8F0', color: '#0F172A' }}>
            <td className={`${td} font-semibold`} colSpan={3}>Total</td>
            <td className={`${td} font-semibold`}><Money amount={totCost} /></td>
            <td className={`${td} font-semibold`}><Money amount={totMrp} /></td>
          </tr>}>
          {rows.map((r, i) => (
            <tr key={i} style={rowStyle}>
              <td className={td}>
                <span className="font-medium">{r.name}</span>
                {r.schedule && ['H', 'H1', 'X'].includes(r.schedule) && <span className="ml-1 px-1.5 py-0.5 rounded-md font-semibold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{r.schedule}</span>}
              </td>
              <td className={td}>{r.qty}</td>
              <td className={td} style={{ color: r.expiredQty ? '#DC2626' : '#94A3B8' }}>{r.expiredQty || '—'}</td>
              <td className={td}><Money amount={r.cost} />{r.noCost > 0 && <span className="block" style={{ color: '#94A3B8' }}>{r.noCost} without cost</span>}</td>
              <td className={td}><Money amount={r.mrp} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ── Purchases ───────────────────────────────────────────────────────────────

function PurchaseReport() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(istToday())
  const [all, setRows] = useState<PurchaseLine[] | null>(null)
  const [withOpening, setWithOpening] = useState(false)
  const openingCount = (all ?? []).filter((r) => r.opening_stock).length
  const rows = all && (withOpening ? all : all.filter((r) => !r.opening_stock))

  useEffect(() => {
    let live = true
    listPurchaseRegister(from, to)
      .then((r) => { if (live) setRows(r) })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [from, to])

  const lineValue = (r: PurchaseLine) => (r.purchase_price != null ? r2(r.qty_received * r.purchase_price) : null)
  const total = r2((rows ?? []).reduce((s, r) => s + (lineValue(r) ?? 0), 0))
  const head = ['Date', 'Supplier', 'Invoice', 'Medicine', 'Brand', 'Batch', 'Expiry', 'Qty received', 'Free', 'Purchase price', 'MRP', 'GST %', 'HSN', 'Line value', 'Opening stock']

  return (
    <div className="space-y-3">
      <Header title="Purchase register" about={`Every batch received in the period, as it arrived — supplier, invoice, quantity received, price and GST.${openingCount && !withOpening ? ` ${openingCount} opening-stock batch${openingCount === 1 ? ' is' : 'es are'} left out — stock entered when you started, not bought in this period.` : ''}`}>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        {openingCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs pb-2" style={{ color: '#475569' }}>
            <input type="checkbox" checked={withOpening} onChange={(e) => setWithOpening(e.target.checked)} /> Include opening stock
          </label>
        )}
        <ExportButton disabled={!rows?.length} onClick={() => downloadCsv(`purchases_${from}_to_${to}.csv`, head,
          (rows ?? []).map((r) => [r.purchase_date, r.supplier_name, r.supplier_invoice_no, r.drug_name, r.brand_name, r.batch_no, r.expiry,
            r.qty_received, r.free_qty, r.purchase_price, r.mrp, r.gst_rate, r.hsn_code, lineValue(r), r.opening_stock ? 'yes' : '']))} />
      </Header>
      {rows === null ? <Loading what="Reading purchases…" /> : rows.length === 0 ? (
        <GlassCard className="p-6"><EmptyState title="No purchases"
          description={openingCount ? 'Only opening stock was entered between these dates — tick "Include opening stock" to see it.' : 'Nothing was received between these dates.'} /></GlassCard>
      ) : (
        <Table head={['Date', 'Supplier / invoice', 'Medicine', 'Batch', 'Qty', 'Price', 'GST', 'Value']} minWidth={820}
          foot={<tr style={{ borderTop: '2px solid #E2E8F0', color: '#0F172A' }}>
            <td className={`${td} font-semibold`} colSpan={7}>Total</td>
            <td className={`${td} font-semibold`}><Money amount={total} /></td>
          </tr>}>
          {rows.map((r, i) => {
            const v = lineValue(r)
            return (
              <tr key={i} style={rowStyle}>
                <td className={`${td} whitespace-nowrap`}>{r.purchase_date ? <DateText date={r.purchase_date} /> : '—'}</td>
                <td className={td}>{r.opening_stock ? <span style={{ color: '#94A3B8' }}>Opening stock</span> : (r.supplier_name ?? '—')}{r.supplier_invoice_no && <span className="block" style={{ color: '#94A3B8' }}>{r.supplier_invoice_no}</span>}</td>
                <td className={td}><span className="font-medium">{r.brand_name ?? r.drug_name}</span>{r.brand_name && <span className="block" style={{ color: '#94A3B8' }}>{r.drug_name}</span>}</td>
                <td className={`${td} font-mono`}>{r.batch_no}</td>
                <td className={td}>{r.qty_received}{r.free_qty > 0 && <span style={{ color: '#94A3B8' }}> +{r.free_qty}</span>}</td>
                <td className={td}>{r.purchase_price == null ? <span style={{ color: '#94A3B8' }}>—</span> : <Money amount={r.purchase_price} />}</td>
                <td className={td}>{r.gst_rate == null ? '—' : `${r.gst_rate}%`}</td>
                <td className={td}>{v == null ? <span style={{ color: '#94A3B8' }}>no price</span> : <Money amount={v} />}</td>
              </tr>
            )
          })}
        </Table>
      )}
    </div>
  )
}

// ── Report V ────────────────────────────────────────────────────────────────

function ReportVCard() {
  return (
    <GlassCard className="p-5">
      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Report V — abortion drug stock account</p>
      <p className="text-xs mt-1 mb-3" style={{ color: '#64748B' }}>
        The monthly opening, purchased, used and closing stock of the drugs on your MTP return, counted
        automatically from what the pharmacy hands over. It is filed with the MTP returns, so it lives there.
      </p>
      <Link href="/pcpndt/returns" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#0D9488' }}>
        Open the monthly returns <ExternalLink className="w-3.5 h-3.5" />
      </Link>
    </GlassCard>
  )
}
