'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, X, Check, Building2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import { createDepartment, updateDepartment } from '@/app/actions/departments'
import type { DepartmentWithTemplate, ClinicalTemplate } from '@/lib/types'

const TEMPLATES: { value: ClinicalTemplate; label: string; description: string }[] = [
  { value: 'general',        label: 'General',        description: 'Standard consultation form — complaint, diagnosis, ICD, notes.' },
  { value: 'dental',         label: 'Dental',         description: 'Adds tooth chart + dental treatment recording below the general form.' },
  { value: 'ophthalmology',  label: 'Ophthalmology',  description: 'Adds per-eye exam fields (acuity, IOP, refraction) below the general form.' },
  { value: 'paediatrics',    label: 'Paediatrics',    description: 'Adds WHO growth charts and z-scores, vaccinations due, milestones and birth history below the general form.' },
]

const TEMPLATE_BADGE: Record<ClinicalTemplate, string> = {
  general:       'default',
  dental:        'active',
  ophthalmology: 'booked',
  paediatrics:   'info',
  obgyn:         'info',
}

interface Props {
  initialDepartments: DepartmentWithTemplate[]
}

interface FormState {
  name: string
  clinical_template: ClinicalTemplate
}

const EMPTY_FORM: FormState = { name: '', clinical_template: 'general' }

export default function DepartmentManager({ initialDepartments }: Props) {
  const [departments, setDepartments] = useState(initialDepartments)
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState('')

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowCreate(true)
  }

  function openEdit(dept: DepartmentWithTemplate) {
    setShowCreate(false)
    setEditingId(dept.id)
    setForm({ name: dept.name, clinical_template: dept.clinical_template })
    setError('')
  }

  function cancelAll() {
    setShowCreate(false)
    setEditingId(null)
    setError('')
  }

  function handleCreate() {
    setError('')
    startTransition(async () => {
      const res = await createDepartment(form as unknown as Record<string, unknown>)
      if (!res.success) { setError(res.error); return }
      const newDept: DepartmentWithTemplate = {
        id: res.id, name: form.name, description: null,
        clinical_template: form.clinical_template, created_at: new Date().toISOString(),
      }
      setDepartments((d) => [...d, newDept].sort((a, b) => a.name.localeCompare(b.name)))
      setShowCreate(false)
      setForm(EMPTY_FORM)
    })
  }

  function handleUpdate(id: string) {
    setError('')
    startTransition(async () => {
      const res = await updateDepartment(id, form as unknown as Record<string, unknown>)
      if (!res.success) { setError(res.error); return }
      setDepartments((d) =>
        d.map((dept) => dept.id === id
          ? { ...dept, name: form.name, clinical_template: form.clinical_template }
          : dept
        ).sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditingId(null)
    })
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0',
    color: '#0F172A', outline: 'none', borderRadius: '0.75rem',
    padding: '0.5rem 0.875rem', fontSize: '0.875rem', width: '100%',
    minHeight: '40px',
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: '#64748B' }}>
          {departments.length} department{departments.length !== 1 ? 's' : ''}
        </p>
        {!showCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', minHeight: '40px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
          >
            <Plus className="w-4 h-4" /> Add Department
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <GlassCard className="p-4 space-y-4">
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>New Department</p>
          <DeptForm
            form={form}
            onChange={setForm}
            inputStyle={inputStyle}
          />
          {error && (
            <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={isPending || !form.name.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: (!form.name.trim() || isPending) ? '#94A3B8' : '#0D9488',
                color: '#fff', border: 'none',
                cursor: (!form.name.trim() || isPending) ? 'not-allowed' : 'pointer',
                minHeight: '40px',
              }}
            >
              <Check className="w-4 h-4" /> {isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={cancelAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer', minHeight: '40px' }}>
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </GlassCard>
      )}

      {/* Department list */}
      <div className="space-y-2">
        {departments.map((dept) => (
          <GlassCard key={dept.id} className="p-4">
            {editingId === dept.id ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Edit — {dept.name}</p>
                <DeptForm form={form} onChange={setForm} inputStyle={inputStyle} />
                {error && <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleUpdate(dept.id)}
                    disabled={isPending || !form.name.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                    style={{
                      background: (!form.name.trim() || isPending) ? '#94A3B8' : '#0D9488',
                      color: '#fff', border: 'none',
                      cursor: (!form.name.trim() || isPending) ? 'not-allowed' : 'pointer',
                      minHeight: '40px',
                    }}
                  >
                    <Check className="w-4 h-4" /> {isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={cancelAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm"
                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer', minHeight: '40px' }}>
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 justify-between flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}>
                    <Building2 className="w-4 h-4" style={{ color: '#0D9488' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{dept.name}</p>
                    {dept.clinical_template !== 'general' ? null : (
                      <p className="text-xs" style={{ color: '#94A3B8' }}>General consultation form</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge
                    status={TEMPLATE_BADGE[dept.clinical_template]}
                    label={TEMPLATES.find((t) => t.value === dept.clinical_template)?.label ?? dept.clinical_template}
                  />
                  <button
                    onClick={() => openEdit(dept)}
                    className="p-1.5 rounded-lg"
                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                    title="Edit department"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        ))}

        {departments.length === 0 && (
          <GlassCard className="p-8 text-center">
            <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: '#94A3B8' }} />
            <p className="text-sm" style={{ color: '#64748B' }}>No departments yet. Add one to get started.</p>
          </GlassCard>
        )}
      </div>
    </div>
  )
}

function DeptForm({
  form,
  onChange,
  inputStyle,
}: {
  form: FormState
  onChange: (f: FormState) => void
  inputStyle: React.CSSProperties
}) {
  const TEMPLATES_LIST: { value: ClinicalTemplate; label: string; note: string }[] = [
    { value: 'general',       label: 'General',       note: 'Standard consultation form (complaint, diagnosis, ICD, notes). Works for any specialty without a dedicated template.' },
    { value: 'dental',        label: 'Dental',        note: 'Adds a tooth chart and treatment recording section.' },
    { value: 'ophthalmology', label: 'Ophthalmology', note: 'Adds per-eye exam fields (visual acuity, IOP, refraction).' },
    { value: 'paediatrics',   label: 'Paediatrics',   note: 'Adds WHO growth charts with z-scores, vaccinations due, developmental milestones and birth history.' },
  ]

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>
          Department Name *
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="e.g. Pediatrics, Dental, General Medicine"
          style={inputStyle}
          onFocus={(e) => Object.assign(e.currentTarget.style, { borderColor: '#0D9488', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' })}
          onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
          Clinical Template
        </label>
        <div className="space-y-2">
          {TEMPLATES_LIST.map((t) => (
            <label
              key={t.value}
              className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
              style={{
                border: `1px solid ${form.clinical_template === t.value ? '#0D9488' : '#E2E8F0'}`,
                background: form.clinical_template === t.value ? 'rgba(13,148,136,0.05)' : 'rgba(255,255,255,0.6)',
              }}
            >
              <input
                type="radio"
                name="clinical_template"
                value={t.value}
                checked={form.clinical_template === t.value}
                onChange={() => onChange({ ...form, clinical_template: t.value })}
                className="mt-0.5 accent-teal-600"
              />
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{t.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{t.note}</p>
                {t.value === 'general' && form.name && !['General Medicine','Surgery','Paediatrics','Emergency'].some(n => form.name.toLowerCase().includes(n.toLowerCase())) && (
                  <p className="text-xs mt-1 italic" style={{ color: '#94A3B8' }}>
                    No dedicated specialty template yet — this department will use the general consultation form.
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
