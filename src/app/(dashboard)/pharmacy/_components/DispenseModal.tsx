'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { dispense, getFefoPreview } from '@/app/actions/pharmacy'
import type { Drug, DrugBatch, PrescriptionWithVisit } from '@/lib/types'

interface Props {
  open: boolean
  prescription: PrescriptionWithVisit
  drugs: Drug[]
  onClose: () => void
  onSuccess: () => void
}

export default function DispenseModal({ open, prescription, drugs, onClose, onSuccess }: Props) {
  const [drugSearch, setDrugSearch] = useState(prescription.drug_name)
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null)
  const [showDrugDropdown, setShowDrugDropdown] = useState(false)
  const [qty, setQty] = useState('1')
  const [fefo, setFefo] = useState<{ batch: DrugBatch; price: number } | null>(null)
  const [fefoLoading, setFefoLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredDrugs = drugs.filter((d) =>
    d.name.toLowerCase().includes(drugSearch.toLowerCase()) ||
    d.generic_name?.toLowerCase().includes(drugSearch.toLowerCase())
  ).slice(0, 10)

  const loadFefo = useCallback(async (drugId: string, q: number) => {
    if (!drugId || q < 1) { setFefo(null); return }
    setFefoLoading(true)
    const result = await getFefoPreview(drugId, q)
    setFefo(result)
    setFefoLoading(false)
  }, [])

  useEffect(() => {
    if (selectedDrug) loadFefo(selectedDrug.id, parseInt(qty, 10) || 1)
  }, [selectedDrug, qty, loadFefo])

  async function handleDispense(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDrug) { setError('Please select a drug from the catalog'); return }
    const qtyNum = parseInt(qty, 10)
    if (!qtyNum || qtyNum < 1) { setError('Enter a valid quantity'); return }

    setLoading(true); setError(null)
    const result = await dispense({
      patient_id: prescription.patient_id,
      prescription_id: prescription.id,
      drug_id: selectedDrug.id,
      qty: qtyNum,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose}
      title={`Dispense — ${prescription.patient_name}`}
      maxWidth="32rem">
      <form onSubmit={handleDispense} className="space-y-4">
        {/* Prescription summary */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>Prescription</p>
          <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{prescription.drug_name}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            {prescription.dosage && <span className="text-xs" style={{ color: '#475569' }}>{prescription.dosage}</span>}
            {prescription.frequency && <span className="text-xs" style={{ color: '#475569' }}>· {prescription.frequency}</span>}
            {prescription.duration && <span className="text-xs" style={{ color: '#475569' }}>· {prescription.duration}</span>}
          </div>
          {prescription.instructions && (
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{prescription.instructions}</p>
          )}
        </div>

        {/* Drug catalog search */}
        <FormField label="Drug (from catalog)" required>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
            <input type="text" value={drugSearch}
              onChange={(e) => { setDrugSearch(e.target.value); setSelectedDrug(null); setFefo(null) }}
              placeholder="Search drug catalog…"
              style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
              onFocus={() => setShowDrugDropdown(true)}
              onBlur={() => setTimeout(() => setShowDrugDropdown(false), 150)} />
            {showDrugDropdown && filteredDrugs.length > 0 && (
              <ul className="mt-1 md:absolute md:z-50 md:left-0 md:right-0 md:top-full rounded-xl overflow-hidden shadow-lg"
                style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '12rem', overflowY: 'auto' }}>
                {filteredDrugs.map((d) => (
                  <li key={d.id}>
                    <button type="button"
                      onMouseDown={() => { setSelectedDrug(d); setDrugSearch(d.name); setShowDrugDropdown(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                      <span className="font-medium">{d.name}</span>
                      {d.generic_name && <span className="ml-1 text-xs" style={{ color: '#94A3B8' }}>({d.generic_name})</span>}
                      {d.form && <span className="ml-1 text-xs capitalize" style={{ color: '#64748B' }}>· {d.form}</span>}
                      {d.strength && <span className="ml-1 text-xs" style={{ color: '#64748B' }}>{d.strength}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FormField>

        <FormField label="Quantity" required>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </FormField>

        {/* FEFO batch preview */}
        {selectedDrug && (
          <div className="rounded-xl p-3"
            style={{ background: fefo ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${fefo ? '#BBF7D0' : '#FED7AA'}` }}>
            <p className="text-xs font-semibold mb-1.5" style={{ color: fefo ? '#15803D' : '#C2410C' }}>
              {fefoLoading ? 'Checking stock…' : fefo ? 'FEFO Batch Selected' : 'Insufficient Stock'}
            </p>
            {fefo && !fefoLoading && (
              <div className="space-y-1 text-xs" style={{ color: '#15803D' }}>
                <div className="flex justify-between">
                  <span>Batch: <strong>{fefo.batch.batch_no}</strong></span>
                  <span>Avail: <strong>{fefo.batch.qty_available}</strong></span>
                </div>
                <div className="flex justify-between">
                  <span>Expires: <DateText date={fefo.batch.expiry} /></span>
                  <span>Total: <Money amount={fefo.price} /></span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading || !fefo}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (loading || !fefo) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (loading || !fefo) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Dispensing…' : 'Dispense'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
