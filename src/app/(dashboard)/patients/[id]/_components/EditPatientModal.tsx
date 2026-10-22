'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import GlassCard from '@/components/ui/GlassCard'
import { updatePatient } from '@/app/actions/patients'
import type { Patient } from '@/lib/types'

interface Props {
  patient: Patient
  onClose: () => void
  onSuccess: () => void
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// Strip +91 prefix to get bare 10-digit number for the input
function barePhone(phone: string) {
  return phone.replace(/^\+91/, '').replace(/\D/g, '').slice(0, 10)
}

export default function EditPatientModal({ patient, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    full_name:               patient.full_name ?? '',
    dob:                     patient.dob ?? '',
    gender:                  patient.gender ?? '',
    phone:                   barePhone(patient.phone ?? ''),
    email:                   patient.email ?? '',
    address:                 patient.address ?? '',
    district:                patient.district ?? '',
    state:                   patient.state ?? '',
    pincode:                 patient.pincode ?? '',
    relation_type:           patient.relation_type ?? '',
    relation_name:           patient.relation_name ?? '',
    blood_group:             patient.blood_group ?? '',
    allergies:               patient.allergies ?? '',
    emergency_contact_name:  patient.emergency_contact_name ?? '',
    emergency_contact_phone: patient.emergency_contact_phone ?? '',
    aadhaar_no:              patient.aadhaar_no ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => { const n = { ...e }; delete n[field]; return n })
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const newErrors: Record<string, string> = {}
    if (!/^[6-9]\d{9}$/.test(form.phone))
      newErrors.phone = 'Must be a valid 10-digit mobile number starting with 6–9'
    if (form.aadhaar_no && !/^\d{12}$/.test(form.aadhaar_no))
      newErrors.aadhaar_no = 'Aadhaar must be exactly 12 digits'
    if (Object.keys(newErrors).length) { setErrors(newErrors); return }

    setLoading(true)
    setError(null)

    const result = await updatePatient(patient.id, {
      full_name:               form.full_name,
      phone:                   `+91${form.phone}`,
      dob:                     form.dob || null,
      gender:                  form.gender || null,
      email:                   form.email || null,
      address:                 form.address || null,
      district:                form.district || null,
      state:                   form.state || null,
      pincode:                 form.pincode || null,
      relation_type:           form.relation_type || null,
      relation_name:           form.relation_name || null,
      blood_group:             form.blood_group || null,
      allergies:               form.allergies || null,
      emergency_contact_name:  form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      aadhaar_no:              form.aadhaar_no || null,
    })

    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open onClose={onClose} title="Edit Patient Details" maxWidth="44rem">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name" htmlFor="full_name" required>
            <Input
              id="full_name" value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="Patient full name" required
            />
          </FormField>

          <FormField label="Phone" htmlFor="phone" required error={errors.phone}>
            <div className="flex rounded-xl overflow-hidden"
              style={{ border: `1px solid ${errors.phone ? '#DC2626' : '#E2E8F0'}`, background: 'rgba(255,255,255,0.85)' }}>
              <span className="flex items-center px-3 text-sm font-semibold flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.07)', color: '#0D9488', borderRight: '1px solid #E2E8F0' }}>
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                  set('phone', digits)
                }}
                placeholder="98765 43210"
                maxLength={10}
                style={{
                  flex: 1, padding: '0.625rem 0.875rem', fontSize: '0.875rem',
                  background: 'transparent', border: 'none', outline: 'none', color: '#0F172A',
                }}
              />
              <span className="flex items-center pr-3 text-xs flex-shrink-0"
                style={{ color: form.phone.length === 10 ? '#10B981' : '#94A3B8' }}>
                {form.phone.length}/10
              </span>
            </div>
          </FormField>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FormField label="Date of Birth" htmlFor="dob">
            <Input id="dob" type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
          </FormField>
          <FormField label="Gender" htmlFor="gender">
            <Select id="gender" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Blood Group" htmlFor="blood_group">
            <Select id="blood_group" value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)}>
              <option value="">Select…</option>
              {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email" htmlFor="email">
            <Input id="email" type="email" value={form.email}
              onChange={(e) => set('email', e.target.value)} placeholder="patient@email.com" />
          </FormField>
          <FormField label="Aadhaar Number" htmlFor="aadhaar_no" error={errors.aadhaar_no}
            hint="12-digit number — optional">
            <Input
              id="aadhaar_no"
              value={form.aadhaar_no}
              onChange={(e) => set('aadhaar_no', e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="XXXXXXXXXXXX"
              maxLength={12}
              hasError={!!errors.aadhaar_no}
            />
          </FormField>
        </div>

        <FormField label="Address" htmlFor="address">
          <Textarea id="address" value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Door no, street, village / town" style={{ minHeight: '3.5rem' }} />
        </FormField>

        {/* Added to registration for the statutory returns, and needed here
            too — most of these are learned on a later visit, not at the
            counter, so an edit screen without them means they never get
            recorded at all. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="District" htmlFor="district">
            <Input id="district" value={form.district}
              onChange={(e) => set('district', e.target.value)} placeholder="e.g. Karur" />
          </FormField>
          <FormField label="State" htmlFor="state">
            <Input id="state" value={form.state}
              onChange={(e) => set('state', e.target.value)} placeholder="e.g. Tamil Nadu" />
          </FormField>
          <FormField label="PIN code" htmlFor="pincode">
            <Input id="pincode" value={form.pincode} inputMode="numeric" maxLength={6}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
              placeholder="639001" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Relation" htmlFor="relation_type">
            <Select id="relation_type" value={form.relation_type}
              onChange={(e) => set('relation_type', e.target.value)}>
              <option value="">—</option>
              <option value="husband">W/o — Wife of</option>
              <option value="father">D/o or S/o — Child of (father)</option>
              <option value="mother">Child of (mother)</option>
              <option value="wife">H/o — Husband of</option>
            </Select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Name" htmlFor="relation_name">
              <Input id="relation_name" value={form.relation_name}
                onChange={(e) => set('relation_name', e.target.value)}
                placeholder="Husband's / father's name" />
            </FormField>
          </div>
        </div>

        <FormField label="Allergies" htmlFor="allergies"
          hint="Drug allergies, food allergies, environmental (comma-separated)">
          <Input id="allergies" value={form.allergies}
            onChange={(e) => set('allergies', e.target.value)}
            placeholder="e.g. Penicillin, Aspirin" />
        </FormField>

        <GlassCard className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
            Emergency Contact
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" htmlFor="ec_name">
              <Input id="ec_name" value={form.emergency_contact_name}
                onChange={(e) => set('emergency_contact_name', e.target.value)}
                placeholder="Contact name" />
            </FormField>
            <FormField label="Phone" htmlFor="ec_phone">
              <Input id="ec_phone" value={form.emergency_contact_phone}
                onChange={(e) => set('emergency_contact_phone', e.target.value)}
                placeholder="Contact phone" />
            </FormField>
          </div>
        </GlassCard>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: loading ? '#94A3B8' : '#0D9488',
              color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
            }}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
