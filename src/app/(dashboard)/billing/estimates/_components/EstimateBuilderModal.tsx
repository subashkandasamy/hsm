'use client'

import { useState } from 'react'
import { Trash2, Plus, Search, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createEstimate } from '@/app/actions/costEstimates'
import { searchPatients } from '@/app/actions/patients'
import type { WardRoomType, ProcedureTariff, CostEstimateCategory, Patient } from '@/lib/types'

interface Line { category: CostEstimateCategory; description: string; qty: number; unit_price: number }

const CATEGORIES: { value: CostEstimateCategory; label: string }[] = [
  { value: 'room', label: 'Room / Bed' },
  { value: 'surgery', label: 'Surgery / Package' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'lab', label: 'Laboratory' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'pharmacy', label: 'Pharmacy / Medicines' },
  { value: 'consumables', label: 'Consumables' },
  { value: 'other', label: 'Other' },
]

interface Props {
  roomTypes: WardRoomType[]
  procedures: ProcedureTariff[]
  onClose: () => void
  onSaved: (id: string) => void
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function EstimateBuilderModal({ roomTypes, procedures, onClose, onSaved }: Props) {
  const [patientId, setPatientId] = useState<string | null>(null)
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)

  const [validity, setValidity] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  // Room-charge helper
  const [roomTypeId, setRoomTypeId] = useState('')
  const [days, setDays] = useState('1')
  // Procedure helper
  const [procId, setProcId] = useState('')
  // Manual line
  const [mCat, setMCat] = useState<CostEstimateCategory>('lab')
  const [mDesc, setMDesc] = useState('')
  const [mQty, setMQty] = useState('1')
  const [mPrice, setMPrice] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

  async function runSearch() {
    if (!searchQ.trim()) return
    setSearching(true)
    const r = await searchPatients(searchQ.trim())
    setResults(r.slice(0, 8))
    setSearching(false)
  }

  function pickPatient(p: Patient) {
    setPatientId(p.id)
    setPatientName(p.full_name)
    setPatientPhone(p.phone ?? '')
    setResults([])
    setSearchQ('')
  }

  function addRoom() {
    const rt = roomTypes.find((r) => r.id === roomTypeId)
    const n = parseInt(days, 10) || 1
    if (!rt) return
    setLines((l) => [...l, { category: 'room', description: `Room rent — ${rt.name}`, qty: n, unit_price: rt.daily_rate }])
    setRoomTypeId(''); setDays('1')
  }

  function addProcedure() {
    const p = procedures.find((x) => x.id === procId)
    if (!p) return
    setLines((l) => [...l, { category: 'surgery', description: p.name, qty: 1, unit_price: p.default_price }])
    setProcId('')
  }

  function addManual() {
    if (!mDesc.trim()) { setError('Enter a description for the line'); return }
    const q = parseFloat(mQty) || 1
    const pr = parseFloat(mPrice) || 0
    setLines((l) => [...l, { category: mCat, description: mDesc.trim(), qty: q, unit_price: pr }])
    setMDesc(''); setMQty('1'); setMPrice(''); setError(null)
  }

  function removeLine(i: number) {
    setLines((l) => l.filter((_, idx) => idx !== i))
  }

  async function save() {
    setError(null)
    if (!patientId && !patientName.trim()) { setError('Select a patient or enter a name'); return }
    if (lines.length === 0) { setError('Add at least one line item'); return }
    setSaving(true)
    const res = await createEstimate({
      patient_id: patientId,
      patient_name: patientName.trim() || null,
      patient_phone: patientPhone.trim() || null,
      validity_date: validity || null,
      notes: notes.trim() || null,
      estimated_days: null,
      items: lines,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSaved(res.id)
  }

  return (
    <Modal open onClose={onClose} title="New Cost Estimate" maxWidth="44rem"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>Total: {fmt(total)}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm" style={{ border: '1px solid #E2E8F0', color: '#475569' }}>Cancel</button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: saving ? '#94A3B8' : '#0D9488', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create Estimate
            </button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>}

        {/* Patient */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Patient</p>
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                placeholder="Search existing patient by name / phone / UHID…" />
            </div>
            <button onClick={runSearch} type="button" className="px-3 py-2.5 rounded-xl text-sm flex items-center gap-1.5"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer' }}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
            </button>
          </div>
          {results.length > 0 && (
            <div className="mb-2 rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              {results.map((p) => (
                <button key={p.id} type="button" onClick={() => pickPatient(p)}
                  className="w-full text-left px-3 py-2 text-sm flex justify-between"
                  style={{ borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer' }}>
                  <span style={{ color: '#0F172A' }}>{p.full_name}</span>
                  <span style={{ color: '#94A3B8' }}>{p.uhid} · {p.phone}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Name">
              <Input value={patientName} onChange={(e) => { setPatientName(e.target.value); setPatientId(null) }} placeholder="Patient / enquiry name" />
            </FormField>
            <FormField label="Phone">
              <Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="Mobile (optional)" />
            </FormField>
          </div>
        </div>

        {/* Quick-add builders */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Add charges</p>

          {roomTypes.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Room type</label>
                <Select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
                  <option value="">Select room…</option>
                  {roomTypes.map((r) => <option key={r.id} value={r.id}>{r.name} — {fmt(r.daily_rate)}/day</option>)}
                </Select>
              </div>
              <div style={{ width: '90px' }}>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Days</label>
                <Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
              <button type="button" onClick={addRoom} disabled={!roomTypeId}
                className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: roomTypeId ? 'pointer' : 'not-allowed' }}>
                Add
              </button>
            </div>
          )}

          {procedures.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Surgery / package</label>
                <Select value={procId} onChange={(e) => setProcId(e.target.value)}>
                  <option value="">Select procedure…</option>
                  {procedures.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.default_price)}</option>)}
                </Select>
              </div>
              <button type="button" onClick={addProcedure} disabled={!procId}
                className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: procId ? 'pointer' : 'not-allowed' }}>
                Add
              </button>
            </div>
          )}

          {/* Manual line */}
          <div className="flex flex-wrap items-end gap-2">
            <div style={{ width: '150px' }}>
              <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Category</label>
              <Select value={mCat} onChange={(e) => setMCat(e.target.value as CostEstimateCategory)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Description</label>
              <Input value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="e.g. Routine blood tests" />
            </div>
            <div style={{ width: '70px' }}>
              <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Qty</label>
              <Input type="number" min="1" value={mQty} onChange={(e) => setMQty(e.target.value)} />
            </div>
            <div style={{ width: '110px' }}>
              <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Unit ₹</label>
              <Input type="number" min="0" value={mPrice} onChange={(e) => setMPrice(e.target.value)} placeholder="0" />
            </div>
            <button type="button" onClick={addManual}
              className="px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* Line items */}
        {lines.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Description', 'Qty', 'Unit', 'Amount', ''].map((h, i) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: i >= 1 && i <= 3 ? 'right' : 'left', color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>{l.description}
                      <span style={{ color: '#CBD5E1', marginLeft: 6, fontSize: 11 }}>{CATEGORIES.find(c => c.value === l.category)?.label}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>{l.qty}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>{fmt(l.unit_price)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#0F172A' }}>{fmt(l.qty * l.unit_price)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Valid Until">
            <Input type="date" value={validity} onChange={(e) => setValidity(e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any conditions / remarks" />
          </FormField>
        </div>
      </div>
    </Modal>
  )
}
