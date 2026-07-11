'use client'

import { useState, useMemo } from 'react'
import { Globe, Building2, ChevronDown, Search, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { addBatch, createDrug } from '@/app/actions/pharmacy'
import type { Drug } from '@/lib/types'

interface Props {
  open: boolean
  drugs: Drug[]
  canManage: boolean
  onClose: () => void
  onSuccess: () => void
}

interface BatchState {
  batch_no: string; expiry: string; qty_available: string
  purchase_price: string; mrp: string; reorder_level: string
  storage_location: string
  brand_name: string; manufacturer: string; pack_size: string; pack_unit: string
  mfg_date: string; hsn_code: string; gst_rate: string
  supplier_name: string; supplier_invoice_no: string; purchase_date: string
}

const PACK_UNITS = ['strip', 'vial', 'bottle', 'ampoule', 'tube', 'sachet', 'inhaler', 'tablet', 'unit']
const GST_RATES  = ['0', '5', '12', '18']

function drugLabel(d: Drug) {
  return `${d.name}${d.strength ? ' ' + d.strength : ''}${d.form ? ' (' + d.form + ')' : ''}`
}

export default function AddBatchModal({ open, drugs, canManage, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [selectedDrugId, setSelectedDrugId] = useState('')
  const [drugSearch, setDrugSearch] = useState('')
  const [showDrugList, setShowDrugList] = useState(false)
  const [showGrn, setShowGrn] = useState(false)
  const [newDrug, setNewDrug] = useState({ name: '', generic_name: '', form: '', strength: '', unit: '', reorder_level: '10' })
  const [batch, setBatch] = useState<BatchState>({
    batch_no: '', expiry: '', qty_available: '', purchase_price: '', mrp: '', reorder_level: '0',
    storage_location: '',
    brand_name: '', manufacturer: '', pack_size: '', pack_unit: 'strip',
    mfg_date: '', hsn_code: '30049099', gst_rate: '12',
    supplier_name: '', supplier_invoice_no: '', purchase_date: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredDrugs = useMemo(() => {
    const q = drugSearch.trim().toLowerCase()
    if (!q) return drugs.slice(0, 20)
    return drugs.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.generic_name?.toLowerCase().includes(q)) ||
      (d.brand_aliases ?? []).some(b => b.toLowerCase().includes(q))
    ).slice(0, 15)
  }, [drugs, drugSearch])

  function selectDrug(d: Drug, label?: string) {
    setSelectedDrugId(d.id)
    setDrugSearch(label ?? drugLabel(d))
    setShowDrugList(false)

    // Match brand data to whichever brand was displayed — fall back to first brand
    const brand = (label ? d.brand_data?.find(b => b.brand_name === label) : null)
      ?? d.brand_data?.[0]
    if (brand) {
      setBatch(b => ({
        ...b,
        brand_name:   brand.brand_name   || b.brand_name,
        manufacturer: brand.manufacturer || b.manufacturer,
        hsn_code:     brand.hsn_code     || b.hsn_code,
        gst_rate:     brand.gst_rate     != null ? String(brand.gst_rate) : b.gst_rate,
        pack_size:    brand.pack_size    != null ? String(brand.pack_size) : b.pack_size,
        pack_unit:    brand.pack_unit    || b.pack_unit,
      }))
      setShowGrn(true)
    }
  }

  function clearDrug() {
    setSelectedDrugId('')
    setDrugSearch('')
    setShowDrugList(false)
  }

  function setF(field: keyof BatchState, value: string) {
    setBatch(b => ({ ...b, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    if (!batch.batch_no || !batch.expiry || !batch.qty_available || !batch.mrp) {
      setError('Batch No, Expiry, Qty, and MRP are required')
      setLoading(false); return
    }

    const batchPayload: Record<string, unknown> = {
      batch_no:            batch.batch_no,
      expiry:              batch.expiry,
      qty_available:       parseInt(batch.qty_available, 10),
      purchase_price:      batch.purchase_price ? parseFloat(batch.purchase_price) : null,
      mrp:                 parseFloat(batch.mrp),
      reorder_level:       parseInt(batch.reorder_level, 10) || 0,
      brand_name:          batch.brand_name   || null,
      manufacturer:        batch.manufacturer  || null,
      pack_size:           batch.pack_size     ? parseInt(batch.pack_size, 10) : null,
      pack_unit:           batch.pack_unit     || null,
      mfg_date:            batch.mfg_date      || null,
      hsn_code:            batch.hsn_code      || null,
      gst_rate:            batch.gst_rate      ? parseFloat(batch.gst_rate) : null,
      supplier_name:       batch.supplier_name || null,
      supplier_invoice_no: batch.supplier_invoice_no || null,
      purchase_date:       batch.purchase_date || null,
      storage_location:    batch.storage_location.trim() || null,
    }

    if (mode === 'new') {
      if (!newDrug.name.trim()) { setError('Drug name is required'); setLoading(false); return }
      const drugResult = await createDrug({
        name:          newDrug.name,
        generic_name:  newDrug.generic_name || null,
        form:          newDrug.form || null,
        strength:      newDrug.strength || null,
        unit:          newDrug.unit || null,
        reorder_level: parseInt(newDrug.reorder_level, 10) || 0,
      })
      if (!drugResult.success) { setError(drugResult.error); setLoading(false); return }
      batchPayload.drug_id = drugResult.drug.id
    } else {
      if (!selectedDrugId) { setError('Please select a drug'); setLoading(false); return }
      const selected = drugs.find(d => d.id === selectedDrugId)
      if (selected?.is_global) {
        batchPayload.drug_master_id = selectedDrugId
      } else {
        batchPayload.drug_id = selectedDrugId
      }
    }

    const result = await addBatch(batchPayload)
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  const selectedDrug = drugs.find(d => d.id === selectedDrugId)
  const isGlobalSelected = mode === 'existing' && !!selectedDrugId && selectedDrug?.is_global

  return (
    <Modal open={open} onClose={onClose} title="Add Drug Batch (Goods Receipt)" maxWidth="38rem">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Mode tabs */}
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setMode('existing')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={mode === 'existing' ? { background: '#0D9488', color: '#fff' } : { background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
            Select Drug
          </button>
          {canManage && (
            <button type="button" onClick={() => setMode('new')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={mode === 'new' ? { background: '#0D9488', color: '#fff' } : { background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
              New Custom Drug
            </button>
          )}
        </div>

        {mode === 'existing' ? (
          <FormField label="Drug" required>
            <div className="space-y-1">
              {/* Search input — inline list below avoids overflow-y-auto clipping */}
              <div className="relative flex items-center">
                <Search className="absolute left-3 w-3.5 h-3.5 pointer-events-none" style={{ color: '#94A3B8' }} />
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={drugSearch}
                  onChange={e => {
                    setDrugSearch(e.target.value)
                    setSelectedDrugId('')
                    setShowDrugList(true)
                  }}
                  onFocus={() => setShowDrugList(true)}
                  onBlur={() => setTimeout(() => setShowDrugList(false), 150)}
                  placeholder="Type drug name, brand, or generic…"
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    paddingLeft: '2rem',
                    paddingRight: drugSearch ? '2rem' : '0.875rem',
                    paddingTop: '0.625rem',
                    paddingBottom: '0.625rem',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    background: 'rgba(255,255,255,0.85)',
                    border: selectedDrugId ? '1.5px solid #0D9488' : '1px solid #E2E8F0',
                    color: '#0F172A',
                    outline: 'none',
                  }}
                />
                {drugSearch && (
                  <button type="button" onMouseDown={clearDrug}
                    className="absolute right-2.5 p-0.5 rounded"
                    style={{ color: '#94A3B8' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Inline drug list — not absolute, so modal overflow-y-auto won't clip it */}
              {showDrugList && (
                <div className="rounded-xl overflow-y-auto"
                  style={{ border: '1px solid #E2E8F0', background: '#fff', maxHeight: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {filteredDrugs.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>No drugs found</div>
                  ) : filteredDrugs.map(d => {
                    const q = drugSearch.trim().toLowerCase()
                    const matchBrand = q ? (d.brand_aliases ?? []).find(b => b.toLowerCase().includes(q)) : null
                    return (
                      <div key={d.id}
                        onMouseDown={() => selectDrug(d, matchBrand ?? undefined)}
                        className="flex items-start justify-between px-3 py-2.5 cursor-pointer"
                        style={{ borderBottom: '1px solid #F1F5F9' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F0FDFA')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: '#1E293B' }}>
                            {matchBrand ?? drugLabel(d)}
                          </div>
                          {matchBrand && (
                            <div className="text-xs truncate" style={{ color: '#64748B' }}>
                              {drugLabel(d)}
                            </div>
                          )}
                        </div>
                        <span className="ml-2 flex-shrink-0 text-xs px-1.5 py-0.5 rounded"
                          style={d.is_global
                            ? { background: 'rgba(13,148,136,0.08)', color: '#0F766E' }
                            : { background: 'rgba(100,116,139,0.08)', color: '#475569' }}>
                          {d.is_global ? 'Global' : 'Custom'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </FormField>
        ) : (
          <div className="p-3 rounded-xl space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" style={{ color: '#0D9488' }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>New Custom Drug</p>
            </div>
            <p className="text-xs" style={{ color: '#64748B' }}>
              Only add a custom drug if it&apos;s not in the global catalog above.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Name *"><Input value={newDrug.name} onChange={(e) => setNewDrug(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Paracetamol" /></FormField>
              <FormField label="Generic Name"><Input value={newDrug.generic_name} onChange={(e) => setNewDrug(d => ({ ...d, generic_name: e.target.value }))} placeholder="e.g. Acetaminophen" /></FormField>
              <FormField label="Form">
                <Select value={newDrug.form} onChange={(e) => setNewDrug(d => ({ ...d, form: e.target.value }))}>
                  <option value="">—</option>
                  {['Tablet','Capsule','Syrup','Injection','Cream','Eye Drops','Inhaler','Ointment','Solution'].map(f => <option key={f}>{f}</option>)}
                </Select>
              </FormField>
              <FormField label="Strength"><Input value={newDrug.strength} onChange={(e) => setNewDrug(d => ({ ...d, strength: e.target.value }))} placeholder="e.g. 500mg" /></FormField>
              <FormField label="Unit"><Input value={newDrug.unit} onChange={(e) => setNewDrug(d => ({ ...d, unit: e.target.value }))} placeholder="tablet / ml / strip" /></FormField>
              <FormField label="Reorder Level"><Input type="number" min={0} value={newDrug.reorder_level} onChange={(e) => setNewDrug(d => ({ ...d, reorder_level: e.target.value }))} /></FormField>
            </div>
          </div>
        )}

        {/* Global drug info note */}
        {isGlobalSelected && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)', color: '#0F766E' }}>
            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
            Global catalog drug — enter the brand name below so it appears correctly on bills.
          </div>
        )}

        {/* Batch details */}
        <div className="p-3 rounded-xl space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Batch Details</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Batch No *"><Input value={batch.batch_no} onChange={e => setF('batch_no', e.target.value)} placeholder="e.g. B2024-001" required /></FormField>
            <FormField label="Expiry Date *"><Input type="date" value={batch.expiry} onChange={e => setF('expiry', e.target.value)} required /></FormField>
            <FormField label="Qty Received *"><Input type="number" min={1} value={batch.qty_available} onChange={e => setF('qty_available', e.target.value)} placeholder="100" required /></FormField>
            <FormField label="MRP (₹) *"><Input type="number" min={0} step="0.01" value={batch.mrp} onChange={e => setF('mrp', e.target.value)} placeholder="10.50" required /></FormField>
            <FormField label="Purchase Price (₹)"><Input type="number" min={0} step="0.01" value={batch.purchase_price} onChange={e => setF('purchase_price', e.target.value)} placeholder="8.00" /></FormField>
            <FormField label="Reorder Level"><Input type="number" min={0} value={batch.reorder_level} onChange={e => setF('reorder_level', e.target.value)} placeholder="0" /></FormField>
          </div>
          <FormField label="Storage Location" hint="e.g. Rack A / Shelf 2 / Bin 3">
            <Input value={batch.storage_location} onChange={e => setF('storage_location', e.target.value)} placeholder="Rack A / Shelf 2 / Bin 3" />
          </FormField>
        </div>

        {/* Brand / GRN section — collapsible */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <button type="button" onClick={() => setShowGrn(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{ background: showGrn ? 'rgba(13,148,136,0.06)' : '#F8FAFC', color: '#94A3B8', borderBottom: showGrn ? '1px solid #E2E8F0' : 'none' }}>
            <span>Brand &amp; Supplier Details <span style={{ color: '#CBD5E1', fontWeight: 400 }}>(for GST invoice &amp; bills)</span></span>
            <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: showGrn ? 'rotate(180deg)' : 'none' }} />
          </button>

          {showGrn && (
            <div className="p-3 space-y-3" style={{ background: 'rgba(248,250,252,0.8)' }}>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Brand Name">
                  <Input value={batch.brand_name} onChange={e => setF('brand_name', e.target.value)} placeholder="e.g. Dolo 650" />
                </FormField>
                <FormField label="Manufacturer">
                  <Input value={batch.manufacturer} onChange={e => setF('manufacturer', e.target.value)} placeholder="e.g. Micro Labs Ltd" />
                </FormField>
                <FormField label="Pack Size">
                  <Input type="number" min={1} value={batch.pack_size} onChange={e => setF('pack_size', e.target.value)} placeholder="10" />
                </FormField>
                <FormField label="Pack Unit">
                  <Select value={batch.pack_unit} onChange={e => setF('pack_unit', e.target.value)}>
                    {PACK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </FormField>
                <FormField label="Mfg. Date">
                  <Input type="date" value={batch.mfg_date} onChange={e => setF('mfg_date', e.target.value)} />
                </FormField>
                <FormField label="Purchase Date">
                  <Input type="date" value={batch.purchase_date} onChange={e => setF('purchase_date', e.target.value)} />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="HSN Code">
                  <Input value={batch.hsn_code} onChange={e => setF('hsn_code', e.target.value)} placeholder="30049099" />
                </FormField>
                <FormField label="GST Rate (%)">
                  <Select value={batch.gst_rate} onChange={e => setF('gst_rate', e.target.value)}>
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </Select>
                </FormField>
                <FormField label="Supplier Name">
                  <Input value={batch.supplier_name} onChange={e => setF('supplier_name', e.target.value)} placeholder="e.g. Apex Pharma Distributors" />
                </FormField>
                <FormField label="Supplier Invoice No">
                  <Input value={batch.supplier_invoice_no} onChange={e => setF('supplier_invoice_no', e.target.value)} placeholder="e.g. INV-2024-9901" />
                </FormField>
              </div>

              {batch.gst_rate && parseFloat(batch.mrp) > 0 && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.15)', color: '#0F766E' }}>
                  GST: {batch.gst_rate}% → CGST {(parseFloat(batch.gst_rate) / 2).toFixed(1)}% + SGST {(parseFloat(batch.gst_rate) / 2).toFixed(1)}%
                  &nbsp;|&nbsp; Taxable value: ₹{(parseFloat(batch.mrp) / (1 + parseFloat(batch.gst_rate) / 100)).toFixed(2)} on MRP ₹{batch.mrp}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Saving…' : 'Add Batch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
