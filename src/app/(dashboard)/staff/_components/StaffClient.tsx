'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Plus, RefreshCw, Users, CalendarCheck, CalendarClock,
  Edit2, UserX, Phone, Mail, Briefcase,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { listStaff, updateStaff, updateStaffEmail, getStaffEmail, deactivateStaff, getAttendance, getRoster } from '@/app/actions/hr'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { StaffMember, StaffAttendance, DutyRoster, Role } from '@/lib/types'
import AddStaffModal from './AddStaffModal'
import AttendancePanel from './AttendancePanel'
import RosterPanel from './RosterPanel'

type Tab = 'directory' | 'attendance' | 'roster'

const ROLE_LABELS: Record<Role, string> = {
  admin:        'Admin',
  doctor:       'Doctor',
  nurse:        'Nurse',
  receptionist: 'Receptionist',
  lab_tech:     'Lab Tech',
  pharmacist:   'Pharmacist',
  accountant:   'Accountant',
}

const ROLES: Role[] = ['doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'accountant', 'admin']

interface Props {
  initialStaff: StaffMember[]
  initialAttendance: StaffAttendance[]
  initialRoster: DutyRoster[]
  currentMonth: string
  weekStart: string
}

export default function StaffClient({ initialStaff, initialAttendance, initialRoster, currentMonth, weekStart }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canManage    = !!role && hasPermission(role, 'hr:manage')
  const canAttendance = !!role && hasPermission(role, 'hr:attendance')

  const [tab, setTab]       = useState<Tab>('directory')
  const [staff, setStaff]   = useState(initialStaff)
  const [loading, setLoading] = useState(false)
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [editMember, setEditMember]     = useState<StaffMember | null>(null)
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [roleFilter, setRoleFilter]     = useState<Role | ''>('')

  async function refresh() {
    setLoading(true)
    const data = await listStaff()
    setStaff(data)
    setLoading(false)
  }

  const filtered = roleFilter ? staff.filter((s) => s.role === roleFilter) : staff
  const activeCount = staff.filter((s) => s.is_active).length

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'directory',  label: 'Directory',  icon: <Users className="w-4 h-4" /> },
    { key: 'attendance', label: 'Attendance', icon: <CalendarCheck className="w-4 h-4" /> },
    { key: 'roster',     label: 'Roster',     icon: <CalendarClock className="w-4 h-4" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Staff & HR"
        subtitle={`${activeCount} active staff members`}
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button onClick={() => setShowAddStaff(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
            style={tab === key
              ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
              : { background: 'transparent', color: '#64748B', border: 'none', cursor: 'pointer' }}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Directory Tab */}
      {tab === 'directory' && (
        <div className="space-y-4">
          {/* Role filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium" style={{ color: '#475569' }}>Filter:</span>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setRoleFilter('')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={!roleFilter ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' } : { background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                All ({staff.length})
              </button>
              {ROLES.map((r) => {
                const count = staff.filter((s) => s.role === r).length
                if (count === 0) return null
                return (
                  <button key={r} onClick={() => setRoleFilter(r)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={roleFilter === r ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' } : { background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                    {ROLE_LABELS[r]} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          <DataTable
            data={filtered as unknown as Record<string, unknown>[]}
            searchKeys={['full_name', 'phone']}
            searchPlaceholder="Search staff…"
            emptyTitle="No staff found"
            emptyDescription="Add staff members to get started"
            columns={[
              {
                key: 'full_name', header: 'Name', sortable: true,
                render: (row) => {
                  const s = row as unknown as StaffMember
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: '#0F172A' }}>{s.full_name}</p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>{s.staff?.designation ?? '—'}</p>
                      </div>
                    </div>
                  )
                },
              },
              {
                key: 'role', header: 'Role', sortable: true,
                render: (row) => {
                  const s = row as unknown as StaffMember
                  return <StatusBadge status="info" label={ROLE_LABELS[s.role]} />
                },
              },
              {
                key: 'phone', header: 'Contact', mobileHidden: true,
                render: (row) => {
                  const s = row as unknown as StaffMember
                  return (
                    <div className="space-y-0.5">
                      {s.phone && (
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#475569' }}>
                          <Phone className="w-3 h-3" /> {s.phone}
                        </div>
                      )}
                    </div>
                  )
                },
              },
              {
                key: 'is_active', header: 'Status',
                render: (row) => {
                  const s = row as unknown as StaffMember
                  return <StatusBadge status={s.is_active ? 'success' : 'cancelled'} label={s.is_active ? 'Active' : 'Inactive'} />
                },
              },
              {
                key: 'actions', header: '',
                render: (row) => {
                  const s = row as unknown as StaffMember
                  if (!canManage) return null
                  return (
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => setEditMember(s)} title="Edit"
                        className="w-8 h-8 flex items-center justify-center rounded-lg"
                        style={{ background: 'rgba(100,116,139,0.08)', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {s.is_active && (
                        <button onClick={() => setDeactivateId(s.id)} title="Deactivate"
                          className="w-8 h-8 flex items-center justify-center rounded-lg"
                          style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                },
              },
            ]}
          />
        </div>
      )}

      {/* Attendance Tab */}
      {tab === 'attendance' && (
        <AttendancePanel
          staff={staff}
          initialAttendance={initialAttendance}
          currentMonth={currentMonth}
        />
      )}

      {/* Roster Tab */}
      {tab === 'roster' && (
        <RosterPanel
          staff={staff}
          initialRoster={initialRoster}
          weekStart={weekStart}
        />
      )}

      {/* Add Staff Modal */}
      <AddStaffModal
        open={showAddStaff}
        onClose={() => setShowAddStaff(false)}
        onSuccess={refresh}
      />

      {/* Edit Staff Modal */}
      {editMember && (
        <EditStaffModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSuccess={refresh}
        />
      )}

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={async () => {
          if (!deactivateId) return
          await deactivateStaff(deactivateId)
          setDeactivateId(null)
          refresh()
        }}
        title="Deactivate staff member?"
        description="This will revoke their access. This action can be reversed by an admin."
        confirmLabel="Deactivate"
        confirmVariant="danger"
      />
    </div>
  )
}

// ─── Inline Edit Modal ─────────────────────────────────────────────────────────

function EditStaffModal({ member, onClose, onSuccess }: { member: StaffMember; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    full_name:         member.full_name,
    role:              member.role as Role,
    phone:             member.phone ?? '',
    designation:       member.staff?.designation ?? '',
    joining_date:      member.staff?.joining_date ?? '',
    address:           member.staff?.address ?? '',
    emergency_contact: member.staff?.emergency_contact ?? '',
    email:             '',
  })
  const originalEmail = useRef<string>('')
  const [emailLoading, setEmailLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getStaffEmail(member.id).then((email) => {
      const e = email ?? ''
      originalEmail.current = e
      setForm((f) => ({ ...f, email: e }))
      setEmailLoading(false)
    })
  }, [member.id])

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')

    const newEmail = form.email.trim().toLowerCase()
    if (newEmail !== originalEmail.current.toLowerCase()) {
      const emailRes = await updateStaffEmail(member.id, newEmail)
      if (!emailRes.success) { setSaving(false); setError(emailRes.error); return }
    }

    const res = await updateStaff(member.id, {
      full_name:         form.full_name.trim(),
      role:              form.role,
      phone:             form.phone.trim() || null,
      designation:       form.designation.trim() || null,
      joining_date:      form.joining_date || null,
      address:           form.address.trim() || null,
      emergency_contact: form.emergency_contact.trim() || null,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Staff Member"
      maxWidth="36rem"
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button form="edit-staff-form" type="submit" disabled={saving || emailLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: (saving || emailLoading) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (saving || emailLoading) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      }
    >
      <form id="edit-staff-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Full Name" required>
            <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
          </FormField>
          <FormField label="Role" required>
            <Select value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              {(['doctor','nurse','receptionist','lab_tech','pharmacist','accountant','admin'] as Role[]).map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Email" required hint="Changing email updates their Supabase login immediately.">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              disabled={emailLoading}
              placeholder={emailLoading ? 'Loading…' : 'staff@hospital.com'}
            />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Emergency Contact">
            <Input value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} placeholder="Name & phone" />
          </FormField>
          <FormField label="Address">
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </FormField>
        </div>
      </form>
    </Modal>
  )
}
