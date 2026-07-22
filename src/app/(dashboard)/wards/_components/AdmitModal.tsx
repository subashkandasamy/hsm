'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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

export interface WardOption {
  id: string
  name: string           // individual room/ward name, e.g. "101"
  is_temp: boolean
  is_multi_bed: boolean  // true = general-ward style, shows bed dropdown
  room_type_id: string | null
  room_type_name: string | null  // e.g. "Non AC Deluxe"
  availableBeds: Pick<Bed, 'id' | 'bed_no'>[]
}

interface RoomTypeGroup {
  id: string       // room_type_id or 'temp-{id}' for temp wards
  name: string     // room type display name
  is_multi_bed: boolean
  is_temp: boolean
  wards: WardOption[]
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
  /** OPD visit this admission is being launched from, if any — links IPD back to OPD. */
  sourceVisitId?: string | null
}

export default function AdmitModal({
  open, onClose, onSuccess, doctors, wards, procedureTariffs = [], generalTariffPrice,
  advancePercentage = 50, preselectedBed, preselectedPatient, sourceVisitId = null,
}: Props) {
  const [patientQuery, setPatientQuery] = useState(preselectedPatient?.full_name ?? '')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Pick<Patient, 'id' | 'full_name' | 'uhid'> | null>(
    preselectedPatient ?? null
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [roomTypeId, setRoomTypeId] = useState('')   // selected room type group id
  const [wardId, setWardId] = useState('')           // selected individual room/ward
  const [bedId, setBedId] = useState(preselectedBed?.id ?? '')
  const [tariffId, setTariffId] = useState('')
  const [reason, setReason] = useState('')
  const [directOt, setDirectOt] = useState(false)
  const [tempSlot, setTempSlot] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Group wards by room type
  const roomTypeGroups = useMemo<RoomTypeGroup[]>(() => {
    const map = new Map<string, RoomTypeGroup>()
    for (const w of wards) {
      if (w.is_temp) {
        map.set(`temp-${w.id}`, { id: `temp-${w.id}`, name: w.name, is_multi_bed: false, is_temp: true, wards: [w] })
        continue
      }
      const key = w.room_type_id ?? 'uncategorized'
      const label = w.room_type_name ?? w.name
      if (!map.has(key)) map.set(key, { id: key, name: label, is_multi_bed: w.is_multi_bed, is_temp: false, wards: [] })
      map.get(key)!.wards.push(w)
    }
    return Array.from(map.values())
  }, [wards])

  const selectedGroup = roomTypeGroups.find(g => g.id === roomTypeId)
  const isTempWard  = selectedGroup?.is_temp ?? false
  const isMultiBed  = selectedGroup?.is_multi_bed ?? false

  // Rooms available within the selected group (only those with at least one available bed or temp)
  const availableRooms = selectedGroup?.wards.filter(w => isTempWard || w.availableBeds.length > 0) ?? []

  // Beds for multi-bed ward (load dynamically when room selected)
  const [loadedBeds, setLoadedBeds] = useState<Pick<Bed, 'id' | 'bed_no'>[]>(
    preselectedBed ? [{ id: preselectedBed.id, bed_no: preselectedBed.bed_no }] : []
  )

  useEffect(() => {
    if (!wardId || !isMultiBed || preselectedBed) return
    setBedId('')
    listAvailableBeds(wardId).then(setLoadedBeds)
  }, [wardId, isMultiBed, preselectedBed])

  // For single-bed rooms: auto-select the only available bed
  useEffect(() => {
    if (!wardId || isMultiBed || isTempWard) return
    const room = selectedGroup?.wards.find(w => w.id === wardId)
    const onlyBed = room?.availableBeds[0]
    setBedId(onlyBed?.id ?? '')
  }, [wardId, isMultiBed, isTempWard, selectedGroup])

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


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient) { setError('Please select a patient'); return }
    if (!doctorId) { setError('Please select an admitting doctor'); return }
    if (!directOt && !roomTypeId) { setError('Please select a ward type'); return }
    if (!directOt && !isTempWard && !wardId) { setError('Please select a room'); return }
    if (!directOt && !isTempWard && isMultiBed && !bedId) { setError('Please select a bed'); return }

    setLoading(true)
    setError(null)
    const result = await admitPatient({
      patient_id: selectedPatient.id,
      visit_id: sourceVisitId ?? null,
      admitting_doctor_id: doctorId,
      bed_id: (directOt || isTempWard) ? null : bedId,
      ward_id: isTempWard ? wardId : null,
      reason: reason || null,
      procedure_tariff_id: tariffId || null,
      direct_ot: directOt,
      is_temp_ward: isTempWard || undefined,
      temp_slot: isTempWard ? (tempSlot || null) : undefined,
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

        {/* Direct OT checkbox */}
        {!preselectedBed && (
          <label className="flex items-center gap-3 cursor-pointer select-none"
            style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: directOt ? '1px solid rgba(13,148,136,0.35)' : '1px solid #E2E8F0', background: directOt ? 'rgba(13,148,136,0.06)' : 'rgba(248,250,252,0.8)' }}>
            <input
              type="checkbox"
              checked={directOt}
              onChange={e => { setDirectOt(e.target.checked); setWardId(''); setBedId('') }}
              style={{ width: '1.1rem', height: '1.1rem', accentColor: '#0D9488', cursor: 'pointer' }}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Patient coming directly for OT</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Ward / bed will be assigned after surgery</p>
            </div>
          </label>
        )}

        {/* Ward / Room / Bed — hidden for direct OT */}
        {preselectedBed ? (
          <FormField label="Ward / Bed">
            <div className="px-3.5 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.2)', color: '#0D9488' }}>
              {wardLabel}
            </div>
          </FormField>
        ) : !directOt ? (
          <div className="space-y-3">
            {/* Step 1: Ward type */}
            <FormField label="Ward" required>
              <Select value={roomTypeId} onChange={(e) => {
                const grp = roomTypeGroups.find(g => g.id === e.target.value)
                setRoomTypeId(e.target.value)
                // For temp wards there's only one room in the group — auto-set it so submit works
                setWardId(grp?.is_temp ? (grp.wards[0]?.id ?? '') : '')
                setBedId('')
                setTempSlot('')
              }}>
                <option value="">Select ward…</option>
                {roomTypeGroups.map((g) => {
                  const availCount = g.is_temp ? '—' : `${g.wards.filter(w => w.availableBeds.length > 0).length} avail.`
                  return (
                    <option key={g.id} value={g.id}>
                      {g.is_temp ? `⚠ ${g.name} (overflow)` : `${g.name} (${availCount})`}
                    </option>
                  )
                })}
              </Select>
            </FormField>

            {/* Step 2: Room (hidden for temp ward) */}
            {roomTypeId && !isTempWard && (
              <FormField label="Room" required>
                <Select value={wardId} onChange={(e) => { setWardId(e.target.value); setBedId('') }} disabled={!roomTypeId}>
                  <option value="">Select room…</option>
                  {availableRooms.map((w) => (
                    <option key={w.id} value={w.id}>
                      {isMultiBed ? `${w.name} (${w.availableBeds.length} beds avail.)` : w.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            {/* Step 3: Bed — only for multi-bed / general ward */}
            {wardId && isMultiBed && (
              <FormField label="Bed" required>
                <Select value={bedId} onChange={(e) => setBedId(e.target.value)}>
                  <option value="">Select bed…</option>
                  {loadedBeds.map((b) => <option key={b.id} value={b.id}>{b.bed_no}</option>)}
                </Select>
              </FormField>
            )}

            {/* Temp ward: slot label */}
            {isTempWard && roomTypeId && (
              <FormField label="Slot label">
                <Input
                  value={tempSlot}
                  onChange={(e) => setTempSlot(e.target.value)}
                  placeholder="e.g. T-3, Corridor-1 (optional)"
                />
              </FormField>
            )}
          </div>
        ) : null}

        {/* Temp ward note */}
        {isTempWard && !directOt && (
          <div className="px-3.5 py-2.5 rounded-xl text-xs"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
            Overflow admission — a temporary slot will be created. Transfer the patient to a regular ward once a bed becomes available.
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
