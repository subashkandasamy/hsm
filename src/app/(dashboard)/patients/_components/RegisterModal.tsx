'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import GlassCard from '@/components/ui/GlassCard'
import { createPatient } from '@/app/actions/patients'
import type { Patient } from '@/lib/types'
import { AlertTriangle, UserCheck } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (patient: Patient) => void
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export default function RegisterModal({ open, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    full_name: '', dob: '', gender: '', phone: '', email: '',
    address: '', blood_group: '', allergies: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    notify_whatsapp_consent: false,
    notify_sms_consent: false,
    aadhaar_no: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<Patient | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => { const n = { ...e }; delete n[field]; return n })
    setApiError(null)
    setDuplicate(null)
    setConfirmed(false)
  }

  function setConsent(field: 'notify_whatsapp_consent' | 'notify_sms_consent', value: boolean) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function validatePhone(raw: string): string | null {
    const digits = raw.replace(/[\s\-()+]/g, '').replace(/^91/, '')
    if (!/^[6-9]\d{9}$/.test(digits)) return 'Enter a valid 10-digit Indian mobile number'
    return null
  }

  function validateAadhaar(raw: string): string | null {
    if (!raw) return null
    if (!/^\d{12}$/.test(raw.replace(/\s/g, ''))) return 'Aadhaar must be exactly 12 digits'
    return null
  }

  async function handleSubmit(e: React.FormEvent, force = false) {
    e.preventDefault()

    const phoneErr = validatePhone(form.phone)
    const aadhaarErr = validateAadhaar(form.aadhaar_no)
    if (phoneErr || aadhaarErr) {
      setErrors((prev) => ({
        ...prev,
        ...(phoneErr ? { phone: phoneErr } : {}),
        ...(aadhaarErr ? { aadhaar_no: aadhaarErr } : {}),
      }))
      return
    }

    setLoading(true)
    setApiError(null)

    const input: Record<string, unknown> = {
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
      notify_whatsapp_consent: form.notify_whatsapp_consent,
      notify_sms_consent: form.notify_sms_consent,
      aadhaar_no: form.aadhaar_no || null,
    }

    const result = await createPatient(input)
    setLoading(false)

    if ('duplicate' in result) {
      setDuplicate(result.existing as Patient)
      return
    }

    if (!result.success) {
      setApiError(result.error)
      return
    }

    onSuccess(result.patient)
    setForm({
      full_name: '', dob: '', gender: '', phone: '', email: '',
      address: '', blood_group: '', allergies: '',
      emergency_contact_name: '', emergency_contact_phone: '',
      notify_whatsapp_consent: false, notify_sms_consent: false,
      aadhaar_no: '',
    })
    setDuplicate(null)
  }

  return (
    <Modal open={open} onClose={onClose} title="Register New Patient" maxWidth="44rem">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Duplicate warning */}
        {duplicate && (
          <div className="rounded-xl p-4 flex gap-3"
            style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#B45309' }}>Existing patient found</p>
              <p className="text-sm mt-0.5" style={{ color: '#92400E' }}>
                <span className="font-mono">{duplicate.uhid}</span> — {duplicate.full_name} ({duplicate.phone})
              </p>
              <div className="flex gap-2 mt-3">
                <a
                  href={`/patients/${duplicate.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#0D9488', color: '#fff' }}
                >
                  <UserCheck className="w-3.5 h-3.5" /> Open Existing Record
                </a>
                <button
                  type="button"
                  onClick={() => setConfirmed(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}
                >
                  Register Anyway
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name" htmlFor="full_name" required error={errors.full_name}>
            <Input
              id="full_name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
              placeholder="Patient full name" hasError={!!errors.full_name} required
            />
          </FormField>
          <FormField label="Phone" htmlFor="phone" required error={errors.phone}
            hint="10-digit Indian mobile number">
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value.replace(/[^\d\s\+\-()]/g, ''))}
              placeholder="98765 43210"
              hasError={!!errors.phone}
              required
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
            <Select id="blood_group" value={form.blood_group}
              onChange={(e) => set('blood_group', e.target.value)}>
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
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d\s]/g, '').slice(0, 14)
                set('aadhaar_no', val)
              }}
              placeholder="XXXX XXXX XXXX"
              hasError={!!errors.aadhaar_no}
            />
          </FormField>
        </div>

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

        {/* Notification consent */}
        <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Notification Consent</p>
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={form.notify_whatsapp_consent}
              onChange={(e) => setConsent('notify_whatsapp_consent', e.target.checked)}
              className="w-4 h-4 rounded" style={{ accentColor: '#0D9488' }} />
            <span className="text-sm" style={{ color: '#0F172A' }}>
              Patient consents to WhatsApp notifications (bills, prescriptions, reminders)
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={form.notify_sms_consent}
              onChange={(e) => setConsent('notify_sms_consent', e.target.checked)}
              className="w-4 h-4 rounded" style={{ accentColor: '#0D9488' }} />
            <span className="text-sm" style={{ color: '#0F172A' }}>
              Patient consents to SMS notifications
            </span>
          </label>
        </div>

        {apiError && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {apiError}
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
            disabled={loading || (!!duplicate && !confirmed)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: (loading || (!!duplicate && !confirmed)) ? '#94A3B8' : '#0D9488',
              color: '#fff',
              cursor: (loading || (!!duplicate && !confirmed)) ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            {loading ? 'Registering…' : 'Register Patient'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
