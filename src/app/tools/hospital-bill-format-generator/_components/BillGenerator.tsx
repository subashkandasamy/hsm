'use client'

import { useState } from 'react'
import { Plus, Trash2, Printer } from 'lucide-react'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

type Item = { desc: string; qty: string; rate: string }
type Mode = 'opd' | 'ipd'

const OPD_ITEMS: Item[] = [
  { desc: 'Consultation — General Medicine', qty: '1', rate: '500' },
  { desc: 'CBC (Complete Blood Count)', qty: '1', rate: '350' },
  { desc: 'Pharmacy — dispensed medicines', qty: '1', rate: '420' },
]
const IPD_ITEMS: Item[] = [
  { desc: 'Room rent — Semi-private / day', qty: '3', rate: '2000' },
  { desc: 'Nursing charges / day', qty: '3', rate: '500' },
  { desc: 'Consultation — visits', qty: '4', rate: '500' },
  { desc: 'Lab — CBC, LFT, RFT', qty: '1', rate: '1650' },
  { desc: 'Pharmacy — medicines', qty: '1', rate: '3200' },
]

const num = (s: string) => { const n = parseFloat(s); return isFinite(n) ? n : 0 }
const fmt = (n: number) => '₹' + (isFinite(n) ? n : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm'
const inputStyle = { background: 'rgba(255,255,255,0.9)', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' } as const
const label = 'block text-xs font-medium mb-1'

export default function BillGenerator() {
  const [mode, setMode] = useState<Mode>('opd')
  const [hosp, setHosp] = useState({ name: 'City General Hospital', address: '99, Avinashi Road, Coimbatore, Tamil Nadu', gstin: '', phone: '' })
  const [pat, setPat] = useState({ name: 'Rajesh Kumar', id: 'UH-2026-00042', date: new Date().toISOString().slice(0, 10) })
  const [billNo, setBillNo] = useState('INV-0001')
  const [items, setItems] = useState<Item[]>(OPD_ITEMS)
  const [gstRate, setGstRate] = useState('0')
  const [discount, setDiscount] = useState('0')

  function switchMode(m: Mode) {
    setMode(m)
    setItems(m === 'opd' ? OPD_ITEMS : IPD_ITEMS)
  }
  function setItem(i: number, k: keyof Item, v: string) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, [k]: v } : it)))
  }
  const addItem = () => setItems((prev) => [...prev, { desc: '', qty: '1', rate: '' }])
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i))

  const subtotal = items.reduce((s, it) => s + num(it.qty) * num(it.rate), 0)
  const disc = num(discount)
  const taxable = Math.max(0, subtotal - disc)
  const gst = taxable * (num(gstRate) / 100)
  const total = taxable + gst

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #bill-print, #bill-print * { visibility: visible !important; }
          #bill-print { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; border-radius: 0 !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Editor ── */}
        <div className="no-print rounded-2xl p-5" style={{ background: '#F8FAFC', border: `1px solid ${BORDER}` }}>
          {/* Mode */}
          <div className="flex gap-1 p-1 rounded-xl mb-4 w-fit" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
            {(['opd', 'ipd'] as Mode[]).map((m) => (
              <button key={m} onClick={() => switchMode(m)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold"
                style={mode === m ? { background: TEAL, color: '#fff', border: 'none' } : { background: 'transparent', color: SLATE6, border: 'none', cursor: 'pointer' }}>
                {m.toUpperCase()} bill
              </button>
            ))}
          </div>

          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: SLATE4 }}>Hospital</p>
          <div className="grid grid-cols-1 gap-2 mb-4">
            <input className={inputCls} style={inputStyle} placeholder="Hospital / clinic name" value={hosp.name} onChange={(e) => setHosp({ ...hosp, name: e.target.value })} />
            <input className={inputCls} style={inputStyle} placeholder="Address" value={hosp.address} onChange={(e) => setHosp({ ...hosp, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} style={inputStyle} placeholder="GSTIN (optional)" value={hosp.gstin} onChange={(e) => setHosp({ ...hosp, gstin: e.target.value })} />
              <input className={inputCls} style={inputStyle} placeholder="Phone (optional)" value={hosp.phone} onChange={(e) => setHosp({ ...hosp, phone: e.target.value })} />
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: SLATE4 }}>Patient &amp; bill</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div><span className={label} style={{ color: SLATE6 }}>Patient name</span><input className={inputCls} style={inputStyle} value={pat.name} onChange={(e) => setPat({ ...pat, name: e.target.value })} /></div>
            <div><span className={label} style={{ color: SLATE6 }}>Patient ID / UHID</span><input className={inputCls} style={inputStyle} value={pat.id} onChange={(e) => setPat({ ...pat, id: e.target.value })} /></div>
            <div><span className={label} style={{ color: SLATE6 }}>Bill no.</span><input className={inputCls} style={inputStyle} value={billNo} onChange={(e) => setBillNo(e.target.value)} /></div>
            <div><span className={label} style={{ color: SLATE6 }}>Date</span><input type="date" className={inputCls} style={inputStyle} value={pat.date} onChange={(e) => setPat({ ...pat, date: e.target.value })} /></div>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: SLATE4 }}>Line items</p>
          <div className="space-y-2 mb-3">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className="flex-1 px-2.5 py-2 rounded-lg text-sm" style={inputStyle} placeholder="Description" value={it.desc} onChange={(e) => setItem(i, 'desc', e.target.value)} />
                <input className="w-14 px-2 py-2 rounded-lg text-sm text-center" style={inputStyle} placeholder="Qty" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                <input className="w-24 px-2 py-2 rounded-lg text-sm text-right" style={inputStyle} placeholder="Rate" inputMode="decimal" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
                <button onClick={() => removeItem(i)} aria-label="Remove" className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color: '#DC2626', background: '#FEF2F2', border: 'none', cursor: 'pointer' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm font-medium mb-4" style={{ color: TEAL, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Plus className="w-4 h-4" /> Add line item
          </button>

          <div className="grid grid-cols-2 gap-2">
            <div><span className={label} style={{ color: SLATE6 }}>Discount (₹)</span><input className={inputCls} style={inputStyle} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            <div>
              <span className={label} style={{ color: SLATE6 }}>GST rate</span>
              <select className={inputCls} style={inputStyle} value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
                <option value="0">No GST (exempt)</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
              </select>
            </div>
          </div>

          <button onClick={() => window.print()} className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: TEAL, color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
          <p className="text-xs mt-2 text-center" style={{ color: SLATE4 }}>In the print dialog, choose “Save as PDF” to download.</p>
        </div>

        {/* ── Live bill preview (the printable part) ── */}
        <div id="bill-print" className="rounded-2xl p-6 sm:p-8" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          <div className="flex items-start justify-between gap-4 pb-4 mb-4" style={{ borderBottom: `2px solid ${SLATE9}` }}>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight" style={{ color: SLATE9 }}>{hosp.name || 'Hospital name'}</p>
              {hosp.address && <p className="text-xs mt-1" style={{ color: SLATE6 }}>{hosp.address}</p>}
              <p className="text-xs mt-0.5" style={{ color: SLATE6 }}>
                {hosp.phone && <span>Ph: {hosp.phone}</span>}
                {hosp.phone && hosp.gstin && <span> · </span>}
                {hosp.gstin && <span>GSTIN: {hosp.gstin}</span>}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold px-2.5 py-1 rounded-md" style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>{mode.toUpperCase()} BILL</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 text-xs mb-4" style={{ color: SLATE6 }}>
            <div>
              <p><span style={{ color: SLATE4 }}>Patient:</span> <strong style={{ color: SLATE9 }}>{pat.name || '—'}</strong></p>
              <p><span style={{ color: SLATE4 }}>ID:</span> {pat.id || '—'}</p>
            </div>
            <div className="text-right">
              <p><span style={{ color: SLATE4 }}>Bill no:</span> {billNo || '—'}</p>
              <p><span style={{ color: SLATE4 }}>Date:</span> {pat.date}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th className="text-left px-2 py-2 font-semibold" style={{ color: SLATE6, borderBottom: `1px solid ${BORDER}` }}>#</th>
                  <th className="text-left px-2 py-2 font-semibold" style={{ color: SLATE6, borderBottom: `1px solid ${BORDER}` }}>Description</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: SLATE6, borderBottom: `1px solid ${BORDER}` }}>Qty</th>
                  <th className="text-right px-2 py-2 font-semibold" style={{ color: SLATE6, borderBottom: `1px solid ${BORDER}` }}>Rate</th>
                  <th className="text-right px-2 py-2 font-semibold" style={{ color: SLATE6, borderBottom: `1px solid ${BORDER}` }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2 align-top" style={{ color: SLATE6, borderBottom: `1px solid #F1F5F9` }}>{i + 1}</td>
                    <td className="px-2 py-2 align-top" style={{ color: SLATE9, borderBottom: `1px solid #F1F5F9` }}>{it.desc || '—'}</td>
                    <td className="px-2 py-2 align-top text-center" style={{ color: SLATE6, borderBottom: `1px solid #F1F5F9` }}>{it.qty || '0'}</td>
                    <td className="px-2 py-2 align-top text-right tabular-nums" style={{ color: SLATE6, borderBottom: `1px solid #F1F5F9` }}>{fmt(num(it.rate))}</td>
                    <td className="px-2 py-2 align-top text-right tabular-nums font-medium" style={{ color: SLATE9, borderBottom: `1px solid #F1F5F9` }}>{fmt(num(it.qty) * num(it.rate))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-4">
            <div className="w-full sm:w-64 text-xs space-y-1.5">
              <div className="flex justify-between" style={{ color: SLATE6 }}><span>Subtotal</span><span className="tabular-nums">{fmt(subtotal)}</span></div>
              {disc > 0 && <div className="flex justify-between" style={{ color: SLATE6 }}><span>Discount</span><span className="tabular-nums">− {fmt(disc)}</span></div>}
              {gst > 0 && <div className="flex justify-between" style={{ color: SLATE6 }}><span>GST ({gstRate}%)</span><span className="tabular-nums">{fmt(gst)}</span></div>}
              <div className="flex justify-between pt-2 text-sm font-bold" style={{ color: SLATE9, borderTop: `1px solid ${BORDER}` }}><span>Total</span><span className="tabular-nums" style={{ color: TEAL }}>{fmt(total)}</span></div>
            </div>
          </div>

          <div className="mt-6 pt-3 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
            <p className="text-[10px]" style={{ color: SLATE4 }}>This is a computer-generated bill.</p>
            <p className="text-[10px] mt-0.5" style={{ color: SLATE4 }}>Generated free at uyirly.com</p>
          </div>
        </div>
      </div>
    </div>
  )
}
