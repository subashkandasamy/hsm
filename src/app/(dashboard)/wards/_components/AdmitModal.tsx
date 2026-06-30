'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { admitPatient } from '@/app/actions/ipd'
import { listAvailableBeds } from '@/app/actions/wards'
import { searchPatients } from '@/app/actions/patients'
import type { Patient, Bed, ProcedureTariff } from '@/lib/types'

interface WardOption {
  id: string
  name: string
  availableBeds: Pick<Bed, 'id' | 'bed_no'>[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (admissionId: string) => void
  doctors: { id: string; full_name: string }[]
  wards: WardOption[]
  procedureTariffs?: ProcedureTariff[]
  preselectedBed?: { id: string; bed_no: string; ward_name: string }
  preselectedPatient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  generalTariffPrice?: number
  advancePercentage?: number
}

export default function AdmitModal({
  open, onClose, onSuccess, doctors, wards, procedureTariffs = [], generalTariffPrice,
  advancePercentage = 50, preselectedBed, preselectedPatient,
}: Props) {
  const [patientQuery, setPatientQuery] = useState(preselectedPatient?.full_name ?? '')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Pick<Patient, 'id' | 'full_name' | 'uhid'> | null>(
    preselectedPatient ?? null
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [wardId, setWardId] = useState('')
  const [bedId, setBedId] = useState(preselectedBed?.id ?? '')
  const [wardBeds, setWardBeds] = useState<Pick<Bed, 'id' | 'bed_no'>[]>(
    preselectedBed ? [{ id: preselectedBed.id, bed_no: preselectedBed.bed_no }] : []
  )
  const [tariffId, setTariffId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Compute advance preview (25% of selected tariff, or general tariff if none selected)
  const selectedTariff = procedureTariffs.find((t) => t.id === tariffId)
  const basePrice = selectedTariff?.default_price ?? (!tariffId ? (generalTariffPrice ?? 0) : 0)
  const advancePreview = basePrice > 0 ? Math.round(basePrice * advancePercentage / 100) : 0

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setPatientResults([]); return }
    const r = await searchPatients(q)
    setPatientResults(r.slice(0, 8))
    setShowDropdown(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(patientQuery), 300)
    return () => clearTimeout(t)
  }, [patientQuery, doSearch])

  useEffect(() => {
    if (!wardId || preselectedBed) return
    setBedId('')
    listAvailableBeds(wardId).then((beds) => setWardBeds(beds))
  }, [wardId, preselectedBed])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient) { setError('Please select a patient'); return }
    if (!doctorId) { setError('Please select an admitting doctor'); return }
    if (!bedId) { setError('Please select a bed'); return }

    setLoading(true)
    setError(null)
    const result = await admitPatient({
      patient_id: selectedPatient.id,
      admitting_doctor_id: doctorId,
      bed_id: bedId,
      reason: reason || null,
      procedure_tariff_id: tariffId || null,
    })
    setLoading(false)

    if (!result.success) { setError(result.error); return }
    onSuccess(result.admissionId)
  }

  const wardLabel = preselectedBed
    ? `${preselectedBed.ward_name} — Bed ${preselectedBed.bed_no}`
    : undefined

  return (
    <Modal open={open} onClose={onClose} title="Admit Patient" maxWidth="36rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient search */}
        <FormField label="Patient" required>
          {preselectedPatient ? (
            <div className="px-3.5 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.2)', color: '#0D9488' }}>
              {preselectedPatient.full_name} · {preselectedPatient.uhid}
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: '#94A3B8' }} />
              <input
                type="text" value={patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setSelectedPatient(null) }}
                placeholder="Search patient by name or phone…"
                style={{
                  width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem',
                  borderRadius: '0.75rem', fontSize: '0.875rem',
                  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0',
                  color: '#0F172A', outline: 'none',
                }}
                onFocus={() => setShowDropdown(patientResults.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {showDropdown && patientResults.length > 0 && (
                <ul className="mt-1 md:absolute md:z-50 md:left-0 md:right-0 md:top-full rounded-xl overflow-hidden shadow-lg"
                  style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '12rem', overflowY: 'auto' }}>
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button type="button"
                        onMouseDown={() => { setSelectedPatient(p); setPatientQuery(p.full_name); setShowDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <span className="font-medium">{p.full_name}</span>
                        <span className="ml-2 font-mono text-xs" style={{ color: '#94A3B8' }}>{p.uhid}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {selectedPatient && !preselectedPatient && (
            <div className="mt-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
              ✓ {selectedPatient.full_name} · {selectedPatient.uhid}
            </div>
          )}
        </FormField>

        <FormField label="Admitting Doctor" required>
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
            <option value="">Select doctor…</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </Select>
        </FormField>

        {preselectedBed ? (
          <FormField label="Ward / Bed">
            <div className="px-3.5 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.2)', color: '#0D9488' }}>
              {wardLabel}
            </div>
          </FormField>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Ward" required>
              <Select value={wardId} onChange={(e) => setWardId(e.target.value)}>
                <option value="">Select ward…</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.availableBeds.length} avail.)
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Bed" required>
              <Select value={bedId} onChange={(e) => setBedId(e.target.value)} disabled={!wardId}>
                <option value="">Select bed…</option>
                {wardBeds.map((b) => <option key={b.id} value={b.id}>{b.bed_no}</option>)}
              </Select>
            </FormField>
          </div>
        )}

        <FormField label="Treatment / Procedure">
          <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
            <option value="">
              {generalTariffPrice
                ? `General (₹${generalTariffPrice.toLocaleString('en-IN')})`
                : 'Select treatment (optional)…'}
            </option>
            {procedureTariffs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — ₹{t.default_price.toLocaleString('en-IN')}
                {t.category ? ` (${t.category})` : ''}
              </option>
            ))}
          </Select>
        </FormField>

        {advancePreview > 0 && (
          <div className="px-3.5 py-3 rounded-xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="text-xs font-medium" style={{ color: '#92400E' }}>
              Advance due on admission:{' '}
              <strong>₹{advancePreview.toLocaleString('en-IN')}</strong>{' '}
              ({advancePercentage}% of ₹{basePrice.toLocaleString('en-IN')})
            </p>
            <p className="text-xs mt-1" style={{ color: '#B45309' }}>
              A pending advance notice will appear at the billing counter for collection.
            </p>
          </div>
        )}

        <FormField label="Reason for Admission">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Chief complaint or reason for admission…" style={{ minHeight: '4rem' }} />
        </FormField>

        {error && <div className="text-sm rounded-xl px-3 py-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Admitting…' : 'Admit Patient'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
