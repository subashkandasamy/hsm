'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Calculator } from 'lucide-react'
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
  onSuccess: (dispenseId: string) => void
}

// Parse "1-1-1", "BD", "TDS", "OD", "1-0-1" etc. → doses per day
function parseFreqPerDay(frequency: string | null): number {
  if (!frequency) return 1
  const f = frequency.trim()

  // "1-1-1", "1-0-1", "0-0-1-0" style (sum of non-zero positions)
  const dashMatch = f.match(/^[\d][-–][\d][-–][\d]([-–][\d])?$/)
  if (dashMatch) {
    return f.split(/[-–]/).reduce((sum, n) => sum + (parseInt(n, 10) > 0 ? 1 : 0), 0)
  }
  // Named abbreviations
  const low = f.toLowerCase()
  if (/\bqid\b|four times/i.test(low)) return 4
  if (/\btds\b|t\.d\.s|three times|tid\b/i.test(low)) return 3
  if (/\bbd\b|b\.d\.|b\.i\.d|twice|two times/i.test(low)) return 2
  if (/\bod\b|o\.d\.|once daily|once a day/i.test(low)) return 1
  // Bare number
  const n = parseInt(f, 10)
  if (!isNaN(n) && n > 0) return n
  return 1
}

// Parse "5", "5 days", "5d", "1 week", "2 weeks" → days
function parseDurationDays(duration: string | null): number {
  if (!duration) return 1
  const d = duration.trim().toLowerCase()
  const weekMatch = d.match(/(\d+)\s*w/)
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7
  const dayMatch = d.match(/(\d+)/)
  if (dayMatch) return Math.max(1, parseInt(dayMatch[1], 10))
  return 1
}

// Try to find a drug + matching brand label for a prescription drug name (brand or generic)
function findAutoMatch(drugName: string, drugs: Drug[]): { drug: Drug; label: string } | null {
  const name = drugName.toLowerCase().trim()
  // Exact brand alias match
  for (const d of drugs) {
    const brand = (d.brand_aliases ?? []).find(b => b.toLowerCase() === name)
    if (brand) return { drug: d, label: brand }
  }
  // Exact generic name match
  const exact = drugs.find(d => d.name.toLowerCase() === name)
  if (exact) return { drug: exact, label: exact.name }
  // Partial brand match
  for (const d of drugs) {
    const brand = (d.brand_aliases ?? []).find(b => b.toLowerCase().includes(name) || name.includes(b.toLowerCase()))
    if (brand) return { drug: d, label: brand }
  }
  // Partial generic match
  const partial = drugs.find(d => d.name.toLowerCase().includes(name) || name.includes(d.name.toLowerCase()))
  if (partial) return { drug: partial, label: partial.name }
  return null
}

export default function DispenseModal({ open, prescription, drugs, onClose, onSuccess }: Props) {
  const freqPerDay  = parseFreqPerDay(prescription.frequency)
  const durationDay = parseDurationDays(prescription.duration)
  const autoQty     = freqPerDay * durationDay

  const autoMatch = findAutoMatch(prescription.drug_name, drugs)
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(autoMatch?.drug ?? null)
  const [drugSearch, setDrugSearch]     = useState(autoMatch?.label ?? prescription.drug_name)
  const [showDrugDropdown, setShowDrugDropdown] = useState(false)
  const [qty, setQty]         = useState(String(autoQty))
  const [fefo, setFefo]       = useState<{ batch: DrugBatch; price: number } | null>(null)
  const [fefoLoading, setFefoLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const filteredDrugs = drugs.filter((d) => {
    const q = drugSearch.toLowerCase()
    return (
      d.name.toLowerCase().includes(q) ||
      (d.generic_name?.toLowerCase().includes(q)) ||
      (d.brand_aliases ?? []).some(b => b.toLowerCase().includes(q))
    )
  }).slice(0, 10)

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
    onSuccess(result.dispenseId)
  }

  const rxHasCalc = prescription.frequency && prescription.duration
  const calcLabel = rxHasCalc
    ? `${freqPerDay} dose${freqPerDay > 1 ? 's' : ''}/day × ${durationDay} day${durationDay > 1 ? 's' : ''} = ${autoQty} units`
    : null

  return (
    <Modal open={open} onClose={onClose}
      title={`Dispense — ${prescription.patient_name}`}
      maxWidth="34rem">
      <form onSubmit={handleDispense} className="space-y-4">

        {/* ── Prescription details ── */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(13,148,136,0.2)', background: 'rgba(13,148,136,0.04)' }}>
          {/* Drug name header */}
          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(13,148,136,0.12)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#0D9488' }}>Prescription</p>
            <p className="font-bold text-base" style={{ color: '#0F172A' }}>{prescription.drug_name}</p>
          </div>

          {/* Detail cells */}
          <div className="grid grid-cols-3 divide-x" style={{ borderBottom: prescription.instructions ? '1px solid rgba(13,148,136,0.12)' : undefined, borderColor: 'rgba(13,148,136,0.12)' }}>
            <div className="px-3 py-2.5">
              <p className="text-xs font-medium mb-0.5" style={{ color: '#94A3B8' }}>Dosage</p>
              <p className="text-sm font-semibold" style={{ color: prescription.dosage ? '#0F172A' : '#CBD5E1' }}>
                {prescription.dosage ?? '—'}
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-xs font-medium mb-0.5" style={{ color: '#94A3B8' }}>Frequency</p>
              <p className="text-sm font-semibold" style={{ color: prescription.frequency ? '#0F172A' : '#CBD5E1' }}>
                {prescription.frequency ?? '—'}
              </p>
              {prescription.frequency && (
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  {freqPerDay}×/day
                </p>
              )}
            </div>
            <div className="px-3 py-2.5">
              <p className="text-xs font-medium mb-0.5" style={{ color: '#94A3B8' }}>Duration</p>
              <p className="text-sm font-semibold" style={{ color: prescription.duration ? '#0F172A' : '#CBD5E1' }}>
                {prescription.duration ?? '—'}
              </p>
              {prescription.duration && (
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  {durationDay} day{durationDay > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {prescription.instructions && (
            <div className="px-4 py-2 flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>Instructions</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                {prescription.instructions}
              </span>
            </div>
          )}
        </div>

        {/* ── Drug catalog search ── */}
        <FormField label="Drug (from catalog)" required>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
            <input type="text" value={drugSearch}
              onChange={(e) => { setDrugSearch(e.target.value); setSelectedDrug(null); setFefo(null) }}
              placeholder="Search drug catalog…"
              style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.85)', border: `1px solid ${selectedDrug ? '#0D9488' : '#E2E8F0'}`, color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
              onFocus={() => setShowDrugDropdown(true)}
              onBlur={() => setTimeout(() => setShowDrugDropdown(false), 150)} />
            {selectedDrug && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                matched
              </span>
            )}
            {showDrugDropdown && filteredDrugs.length > 0 && (
              <ul className="mt-1 absolute z-50 left-0 right-0 top-full rounded-xl overflow-hidden shadow-lg"
                style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '12rem', overflowY: 'auto' }}>
                {filteredDrugs.map((d) => {
                  const q = drugSearch.trim().toLowerCase()
                  const matchBrand = q ? (d.brand_aliases ?? []).find(b => b.toLowerCase().includes(q)) : null
                  const label = matchBrand ?? (d.strength ? `${d.name} ${d.strength}` : d.name)
                  const subtitle = matchBrand ? d.name : d.generic_name
                  return (
                    <li key={d.id}>
                      <button type="button"
                        onMouseDown={() => { setSelectedDrug(d); setDrugSearch(label); setShowDrugDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <span className="font-medium">{label}</span>
                        {subtitle && <span className="ml-1 text-xs" style={{ color: '#94A3B8' }}>({subtitle})</span>}
                        {d.form && <span className="ml-1 text-xs capitalize" style={{ color: '#64748B' }}>· {d.form}</span>}
                        {!matchBrand && d.strength && <span className="ml-1 text-xs" style={{ color: '#64748B' }}>{d.strength}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </FormField>

        {/* ── Quantity with auto-calc ── */}
        <FormField label="Quantity" required>
          <div className="space-y-1.5">
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            {calcLabel && (
              <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)' }}>
                <Calculator className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0D9488' }} />
                <span style={{ color: '#0D9488' }}>Auto-calculated: {calcLabel}</span>
              </div>
            )}
          </div>
        </FormField>

        {/* ── FEFO batch preview ── */}
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
                  <span>Available: <strong>{fefo.batch.qty_available}</strong></span>
                </div>
                <div className="flex justify-between">
                  <span>Expires: <DateText date={fefo.batch.expiry} /></span>
                  <span>Total: <strong><Money amount={fefo.price} /></strong></span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading || !fefo}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: (loading || !fefo) ? '#94A3B8' : '#0D9488',
              color: '#fff', border: 'none',
              cursor: (loading || !fefo) ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Dispensing…' : 'Dispense & Pack'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
