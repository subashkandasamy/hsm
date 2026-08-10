'use client'

import { useState } from 'react'
import { Copy, CheckCheck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createStaff } from '@/app/actions/hr'
import type { Role } from '@/lib/types'
import type { PlanKey, TenantStatus } from '@/lib/plans'

const ROLES: { value: Role; label: string }[] = [
  { value: 'doctor',       label: 'Doctor' },
  { value: 'nurse',        label: 'Nurse' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'lab_tech',     label: 'Lab Technician' },
  { value: 'pharmacist',   label: 'Pharmacist' },
  { value: 'accountant',   label: 'Accountant' },
  { value: 'admin',        label: 'Admin' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  plan?: PlanKey
  tenantStatus?: TenantStatus
  roleCountMap?: Record<string, number>
}

export default function AddStaffModal({ open, onClose, onSuccess, plan = 'starter', tenantStatus = 'trial', roleCountMap = {} }: Props) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: '' as Role | '',
    designation: '',
    joining_date: '',
    consultation_fee: '',
    nursing_charge_per_shift: '',
  })
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function copyPassword(pw: string) {
    await navigator.clipboard.writeText(pw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.role) { setError('Role is required'); return }
    setSaving(true); setError('')
    const res = await createStaff({
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      designation: form.designation.trim() || undefined,
      joining_date: form.joining_date || undefined,
      ...(form.role === 'doctor' && form.consultation_fee
        ? { consultation_fee: parseFloat(form.consultation_fee) }
        : {}),
      ...(form.role === 'nurse' && form.nursing_charge_per_shift
        ? { nursing_charge_per_shift: parseFloat(form.nursing_charge_per_shift) }
        : {}),
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setCreatedPassword(res.tempPassword)
  }

  function handleClose() {
    if (createdPassword) onSuccess()
    setCreatedPassword(null)
    setForm({ full_name: '', email: '', phone: '', role: '', designation: '', joining_date: '', consultation_fee: '', nursing_charge_per_shift: '' })
    setError('')
    onClose()
  }

  if (createdPassword) {
    return (
      <Modal open={open} onClose={handleClose} title="Staff Account Created"
        footer={
          <div className="flex justify-end">
            <button onClick={handleClose}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#065F46' }}>Account created successfully</p>
            <p className="text-sm" style={{ color: '#64748B' }}>The login link and this temporary password have been emailed to the staff member. It expires in 72 hours, and they'll set their own password on first sign-in. You can also share it directly below.</p>
          </div>
          <div className="p-4 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>Temporary Password</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-base font-bold flex-1" style={{ color: '#0F172A' }}>
                {createdPassword}
              </p>
              <button onClick={() => copyPassword(createdPassword)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(13,148,136,0.08)', color: copied ? '#065F46' : '#0D9488', border: 'none', cursor: 'pointer' }}>
                {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Staff Member"
      maxWidth="36rem"
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={handleClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button form="add-staff-form" type="submit"
            disabled={saving || (plan === 'starter' && tenantStatus !== 'trial' && !!form.role && (roleCountMap[form.role] ?? 0) >= 1)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: saving || (plan === 'starter' && tenantStatus !== 'trial' && !!form.role && (roleCountMap[form.role] ?? 0) >= 1) ? '#94A3B8' : '#0D9488',
              color: '#fff', border: 'none',
              cursor: saving || (plan === 'starter' && tenantStatus !== 'trial' && !!form.role && (roleCountMap[form.role] ?? 0) >= 1) ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      }
    >
      <form id="add-staff-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}
        {plan === 'starter' && tenantStatus !== 'trial' && form.role && (roleCountMap[form.role] ?? 0) >= 1 && (
          <div className="p-3 rounded-xl text-sm flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.06)', color: '#92400E', border: '1px solid rgba(245,158,11,0.2)' }}>
            <span>⚠</span>
            <span>
              Starter plan allows <strong>1 {ROLES.find((r) => r.value === form.role)?.label ?? form.role}</strong> per practice.{' '}
              <a href="/account/subscription?upgrade=1" style={{ color: '#0D9488', textDecoration: 'underline', fontWeight: 600 }}>Upgrade to Growth</a> to add more.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Full Name" required>
            <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Dr. Aanya Sharma" required />
          </FormField>
          <FormField label="Role" required>
            <Select value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              <option value="">Select role…</option>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="staff@hospital.com" required />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Designation">
            <Input value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Senior Consultant" />
          </FormField>
          <FormField label="Joining Date">
            <Input type="date" value={form.joining_date} onChange={(e) => set('joining_date', e.target.value)} />
          </FormField>
        </div>

        {form.role === 'doctor' && (
          <FormField label="Consultation Fee (₹)" hint="Per-visit fee billed at appointment booking. Leave blank to use the hospital default.">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.consultation_fee}
              onChange={(e) => set('consultation_fee', e.target.value)}
              placeholder="e.g. 500"
            />
          </FormField>
        )}

        {form.role === 'nurse' && (
          <FormField label="Nursing Charge per Shift (₹)" hint="Amount charged to the patient per nursing shift. Leave blank to use the ward default.">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.nursing_charge_per_shift}
              onChange={(e) => set('nursing_charge_per_shift', e.target.value)}
              placeholder="e.g. 300"
            />
          </FormField>
        )}

        <div className="p-3 rounded-xl text-sm flex items-start gap-2" style={{ background: 'rgba(13,148,136,0.05)', color: '#0F766E', border: '1px solid rgba(13,148,136,0.15)' }}>
          <span>✉</span>
          <span>A temporary password will be generated and emailed to the staff member along with their login link. They'll set their own password on first sign-in.</span>
        </div>
      </form>
    </Modal>
  )
}
