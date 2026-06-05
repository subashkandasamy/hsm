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

export default function EditPatientModal({ patient, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    full_name: patient.full_name ?? '',
    dob: patient.dob ?? '',
    gender: patient.gender ?? '',
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    address: patient.address ?? '',
    blood_group: patient.blood_group ?? '',
    allergies: patient.allergies ?? '',
    emergency_contact_name: patient.emergency_contact_name ?? '',
    emergency_contact_phone: patient.emergency_contact_phone ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await updatePatient(patient.id, {
      full_name: form.full_name,
      phone: form.phone,
      dob: form.dob || null,
      gender: form.gender || null,
      email: form.email || null,
      address: form.address || null,
      blood_group: form.blood_group || null,
      allergies: form.allergies || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
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
          <FormField label="Phone" htmlFor="phone" required>
            <Input
              id="phone" value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+91 98765 43210" required
            />
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-4">
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

        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" value={form.email}
            onChange={(e) => set('email', e.target.value)} placeholder="patient@email.com" />
        </FormField>

        <FormField label="Address" htmlFor="address">
          <Textarea id="address" value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Street, City, State…" style={{ minHeight: '3.5rem' }} />
        </FormField>

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
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: loading ? '#94A3B8' : '#0D9488',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
