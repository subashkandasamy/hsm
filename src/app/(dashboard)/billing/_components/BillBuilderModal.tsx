'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Money from '@/components/ui/Money'
import { getUnbilledCharges, generateBill } from '@/app/actions/billing'
import { searchPatients } from '@/app/actions/patients'
import type { Patient, ChargePreviewLine } from '@/lib/types'

const SOURCE_LABELS: Record<string, string> = {
  consultation:      'Consultation',
  bed:               'Bed Charges',
  lab:               'Laboratory',
  radiology:         'Radiology',
  pharmacy:          'Pharmacy',
  ipd_pharmacy:      'Pharmacy (Ward)',
  ot:                'Operation Theatre',
  ot_consumable:     'OT Consumables',
  blood:             'Blood Bank',
  dental:            'Dental Treatment',
  pharmacy_sale_item:'Pharmacy (POS)',
  manual:            'Manual',
}

interface ManualItem { description: string; qty: number; unit_price: number }

interface Props {
  onClose: () => void
  onGenerated: (billId: string) => void
  preselectedPatient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>
  admissionId?: string
}

export default function BillBuilderModal({ onClose, onGenerated, preselectedPatient, admissionId }: Props) {
  const [step, setStep] = useState<'patient' | 'charges'>(preselectedPatient ? 'charges' : 'patient')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(preselectedPatient as Patient ?? null)
  const [searching, setSearching] = useState(false)

  const [charges, setCharges] = useState<ChargePreviewLine[]>([])
  const [loadingCharges, setLoadingCharges] = useState(false)
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set())

  const [manualItems, setManualItems] = useState<ManualItem[]>([])
  const [newManual, setNewManual] = useState<ManualItem>({ description: '', qty: 1, unit_price: 0 })

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-load charges when patient is preselected
  useEffect(() => {
    if (!preselectedPatient) return
    setLoadingCharges(true)
    getUnbilledCharges({ patientId: preselectedPatient.id, admissionId: admissionId ?? null }).then((lines) => {
      setCharges(lines)
      setSelectedRefs(new Set(lines.map((l) => l.ref_id)))
      setLoadingCharges(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedPatient?.id, admissionId])

  // Search patients with debounce
  useEffect(() => {
    if (!patientSearch.trim()) { setPatients([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const data = await searchPatients(patientSearch)
      setPatients(data)
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [patientSearch])

  async function selectPatient(p: Patient) {
    setSelectedPatient(p)
    setStep('charges')
    setLoadingCharges(true)
    const lines = await getUnbilledCharges({ patientId: p.id })
    setCharges(lines)
    setSelectedRefs(new Set(lines.map((l) => l.ref_id)))
    setLoadingCharges(false)
  }

  function toggleRef(ref_id: string) {
    setSelectedRefs((prev) => {
      const next = new Set(prev)
      if (next.has(ref_id)) next.delete(ref_id)
      else next.add(ref_id)
      return next
    })
  }

  function addManualItem() {
    if (!newManual.description.trim() || newManual.unit_price <= 0) return
    setManualItems((prev) => [...prev, { ...newManual }])
    setNewManual({ description: '', qty: 1, unit_price: 0 })
  }

  function removeManualItem(i: number) {
    setManualItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Live totals
  const selectedLines = charges.filter((c) => selectedRefs.has(c.ref_id))
  const manualSubtotal = manualItems.reduce((s, m) => s + m.qty * m.unit_price, 0)
  const chargesSubtotal = selectedLines.reduce((s, c) => s + c.amount, 0)
  const subtotal = chargesSubtotal + manualSubtotal

  // Group charges by source
  const grouped = charges.reduce<Record<string, ChargePreviewLine[]>>((acc, c) => {
    ;(acc[c.source] ??= []).push(c)
    return acc
  }, {})

  async function handleGenerate() {
    if (!selectedPatient) return
    setGenerating(true)
    setError(null)
    const res = await generateBill({
      patient_id:    selectedPatient.id,
      admission_id:  admissionId ?? null,
      selected_refs: Array.from(selectedRefs),
      manual_items:  manualItems,
    })
    setGenerating(false)
    if (!res.success) { setError(res.error); return }
    onGenerated(res.billId)
  }

  const footer = step === 'charges' ? (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm" style={{ color: '#64748B' }}>
        Subtotal: <span className="font-semibold" style={{ color: '#0F172A' }}>
          <Money amount={subtotal} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
        >
          Cancel
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || (selectedRefs.size === 0 && manualItems.length === 0)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{
            background: generating || (selectedRefs.size === 0 && manualItems.length === 0)
              ? '#94A3B8' : '#0D9488',
            minHeight: '44px',
          }}
        >
          {generating && <Loader2 className="w-4 h-4 animate-spin" />}
          Generate Bill
        </button>
      </div>
    </div>
  ) : null

  return (
    <Modal
      open
      onClose={onClose}
      title={step === 'patient' ? 'New Bill — Select Patient' : `New Bill — ${selectedPatient?.full_name}`}
      maxWidth="42rem"
      footer={footer ?? undefined}
    >
      {step === 'patient' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input
              type="search"
              autoFocus
              placeholder="Search patient by name, UHID or phone…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                outline: 'none',
                minHeight: '44px',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>

          {searching && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm" style={{ color: '#94A3B8' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </div>
          )}

          {patients.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              {patients.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => selectPatient(p)}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{
                    borderBottom: i < patients.length - 1 ? '1px solid #F1F5F9' : 'none',
                    minHeight: '44px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{p.full_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                    {p.uhid} &middot; {p.phone}
                  </p>
                </button>
              ))}
            </div>
          )}

          {patientSearch && !searching && patients.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No patients found</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          {loadingCharges ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: '#94A3B8' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading unbilled charges…</span>
            </div>
          ) : (
            <>
              {/* Grouped charge sections */}
              {Object.keys(grouped).length === 0 && manualItems.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>
                  No unbilled charges found for this patient.
                </p>
              ) : (
                Object.entries(grouped).map(([source, lines]) => (
                  <div key={source}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>
                      {SOURCE_LABELS[source] ?? source}
                    </p>
                    <div className="space-y-1">
                      {lines.map((line, lineIdx) => (
                        <label
                          key={`${line.ref_id}-${lineIdx}`}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                          style={{
                            background: selectedRefs.has(line.ref_id) ? 'rgba(13,148,136,0.06)' : 'rgba(248,250,252,0.6)',
                            border: selectedRefs.has(line.ref_id) ? '1px solid rgba(13,148,136,0.2)' : '1px solid #F1F5F9',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRefs.has(line.ref_id)}
                            onChange={() => toggleRef(line.ref_id)}
                            className="mt-0.5 flex-shrink-0"
                            style={{ accentColor: '#0D9488', width: '16px', height: '16px' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm" style={{ color: '#0F172A' }}>{line.description}</p>
                            {line.qty !== 1 && (
                              <p className="text-xs" style={{ color: '#94A3B8' }}>
                                {line.qty} × <Money amount={line.unit_price} />
                              </p>
                            )}
                          </div>
                          <Money amount={line.amount} className="text-sm font-semibold flex-shrink-0" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {/* Manual items */}
              {manualItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Manual Items</p>
                  <div className="space-y-1">
                    {manualItems.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: 'rgba(248,250,252,0.6)', border: '1px solid #F1F5F9' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: '#0F172A' }}>{m.description}</p>
                          {m.qty !== 1 && (
                            <p className="text-xs" style={{ color: '#94A3B8' }}>
                              {m.qty} × <Money amount={m.unit_price} />
                            </p>
                          )}
                        </div>
                        <Money amount={m.qty * m.unit_price} className="text-sm font-semibold" />
                        <button
                          onClick={() => removeManualItem(i)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg"
                          style={{ color: '#EF4444' }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add manual item */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>
                  Add Manual Item
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Description"
                    value={newManual.description}
                    onChange={(e) => setNewManual((p) => ({ ...p, description: e.target.value }))}
                    className="flex-1 px-3 py-2.5 rounded-xl text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.8)',
                      border: '1px solid #E2E8F0',
                      color: '#0F172A',
                      minHeight: '44px',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    min={1}
                    value={newManual.qty}
                    onChange={(e) => setNewManual((p) => ({ ...p, qty: Number(e.target.value) || 1 }))}
                    className="w-20 px-3 py-2.5 rounded-xl text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.8)',
                      border: '1px solid #E2E8F0',
                      color: '#0F172A',
                      minHeight: '44px',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    min={0}
                    value={newManual.unit_price || ''}
                    onChange={(e) => setNewManual((p) => ({ ...p, unit_price: Number(e.target.value) || 0 }))}
                    className="w-28 px-3 py-2.5 rounded-xl text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.8)',
                      border: '1px solid #E2E8F0',
                      color: '#0F172A',
                      minHeight: '44px',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                  />
                  <button
                    onClick={addManualItem}
                    disabled={!newManual.description.trim() || newManual.unit_price <= 0}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-medium text-white"
                    style={{
                      background: !newManual.description.trim() || newManual.unit_price <= 0 ? '#94A3B8' : '#0D9488',
                      minHeight: '44px',
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
