'use client'

import { useState, useEffect, Fragment } from 'react'
import { Plus, Search, Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createRadiologyTest, updateRadiologyTest, listAllRadiologyCatalog } from '@/app/actions/radiology'
import type { RadiologyCatalog } from '@/lib/types'

interface Props { open: boolean; onClose: () => void; onSuccess: () => void }

const MODALITIES = [
  { value: 'xray',         label: 'X-Ray' },
  { value: 'ct',           label: 'CT Scan' },
  { value: 'mri',          label: 'MRI' },
  { value: 'usg',          label: 'Ultrasound (USG)' },
  { value: 'mammography',  label: 'Mammography' },
  { value: 'fluoroscopy',  label: 'Fluoroscopy' },
  { value: 'nuclear',      label: 'Nuclear Medicine' },
  { value: 'pet',          label: 'PET Scan' },
  { value: 'dexa',         label: 'DEXA Scan' },
  { value: 'angiography',  label: 'Angiography' },
]

const MODALITY_LABEL: Record<string, string> = Object.fromEntries(MODALITIES.map((m) => [m.value, m.label]))
const MODALITY_COLOR: Record<string, { bg: string; color: string }> = {
  xray:        { bg: '#EFF6FF', color: '#1D4ED8' },
  ct:          { bg: '#FEF3C7', color: '#B45309' },
  mri:         { bg: '#F3E8FF', color: '#0D9488' },
  usg:         { bg: '#DCFCE7', color: '#15803D' },
  mammography: { bg: '#FFF0F9', color: '#DB2777' },
  fluoroscopy: { bg: '#FFF7ED', color: '#C2410C' },
  nuclear:     { bg: '#F0F9FF', color: '#0369A1' },
  pet:         { bg: '#ECFDF5', color: '#047857' },
  dexa:        { bg: '#FDF4FF', color: '#9333EA' },
  angiography: { bg: '#FFF1F2', color: '#BE123C' },
}

type ScanForm = { name: string; modality: string; price: string }
const BLANK: ScanForm = { name: '', modality: '', price: '' }

function scanToForm(t: RadiologyCatalog): ScanForm {
  return { name: t.name, modality: t.modality ?? '', price: String(t.price) }
}

export default function AddRadiologyTestModal({ open, onClose, onSuccess }: Props) {
  const [tests, setTests]           = useState<RadiologyCatalog[]>([])
  const [loading, setLoading]       = useState(false)
  const [query, setQuery]           = useState('')
  const [filterMod, setFilterMod]   = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const [addForm, setAddForm]       = useState<ScanForm>(BLANK)
  const [addErr, setAddErr]         = useState('')
  const [addSaving, setAddSaving]   = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [editForm, setEditForm]     = useState<ScanForm>(BLANK)
  const [editErr, setEditErr]       = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)

  useEffect(() => { if (open) load() }, [open])

  async function load() {
    setLoading(true)
    setTests(await listAllRadiologyCatalog())
    setLoading(false)
  }

  const filtered = tests.filter((t) => {
    const matchQ = !query.trim() || t.name.toLowerCase().includes(query.toLowerCase())
    const matchM = !filterMod || t.modality === filterMod
    return matchQ && matchM
  })

  async function submitAdd() {
    if (!addForm.name.trim()) { setAddErr('Name is required'); return }
    if (!addForm.price) { setAddErr('Price is required'); return }
    setAddSaving(true); setAddErr('')
    const res = await createRadiologyTest({
      name: addForm.name.trim(),
      modality: addForm.modality || null,
      price: parseFloat(addForm.price) || 0,
    })
    setAddSaving(false)
    if (!res.success) { setAddErr(res.error); return }
    setAddForm(BLANK); setShowAdd(false)
    await load(); onSuccess()
  }

  async function submitEdit() {
    if (!editId) return
    if (!editForm.name.trim()) { setEditErr('Name is required'); return }
    if (!editForm.price) { setEditErr('Price is required'); return }
    setEditSaving(true); setEditErr('')
    const res = await updateRadiologyTest(editId, {
      name: editForm.name.trim(),
      modality: editForm.modality || null,
      price: parseFloat(editForm.price) || 0,
    })
    setEditSaving(false)
    if (!res.success) { setEditErr(res.error); return }
    setEditId(null); await load(); onSuccess()
  }

  async function toggleActive(t: RadiologyCatalog) {
    setToggling(t.id)
    await updateRadiologyTest(t.id, { is_active: !t.is_active })
    await load(); setToggling(null); onSuccess()
  }

  const activeModalities = [...new Set(tests.map((t) => t.modality).filter(Boolean))] as string[]

  return (
    <Modal open={open} onClose={onClose} title={`Radiology Catalog  ·  ${tests.length} procedures`} maxWidth="52rem">
      {/* Search + modality filter + add button */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search procedures…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border"
            style={{ borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }} />
        </div>
        {activeModalities.length > 0 && (
          <select value={filterMod} onChange={(e) => setFilterMod(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm border"
            style={{ borderColor: '#E2E8F0', color: '#64748B', background: '#fff' }}>
            <option value="">All modalities</option>
            {activeModalities.map((m) => (
              <option key={m} value={m}>{MODALITY_LABEL[m] ?? m}</option>
            ))}
          </select>
        )}
        <button onClick={() => { setShowAdd((v) => !v); setAddErr('') }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-4 h-4" /> Add Procedure
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <ScanForm
          form={addForm} err={addErr} saving={addSaving} accent="#0D9488"
          title="New Procedure" saveLabel="Add Procedure"
          onSet={(f, v) => setAddForm((p) => ({ ...p, [f]: v }))}
          onSave={submitAdd} onCancel={() => { setShowAdd(false); setAddForm(BLANK) }}
        />
      )}

      {/* Catalog table */}
      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>Loading catalog…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
          {query || filterMod ? 'No procedures match your filter.' : 'No procedures yet. Add your first one above.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Procedure Name', 'Modality', 'Price (₹)', 'Status', ''].map((h) => (
                    <th key={h}
                      className={`py-2.5 px-3 text-xs font-semibold text-left${h === 'Price (₹)' ? ' text-right' : ''}`}
                      style={{ color: '#64748B', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, background: '#F8FAFC' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const mc = MODALITY_COLOR[t.modality ?? ''] ?? { bg: '#F1F5F9', color: '#64748B' }
                  return (
                    <Fragment key={t.id}>
                      <tr style={{ borderBottom: '1px solid #F1F5F9', background: t.is_active ? '#fff' : '#FAFAFA' }}>
                        <td className="py-2.5 px-3 font-medium" style={{ color: t.is_active ? '#0F172A' : '#64748B' }}>{t.name}</td>
                        <td className="py-2.5 px-3">
                          {t.modality ? (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{ background: mc.bg, color: mc.color }}>
                              {MODALITY_LABEL[t.modality] ?? t.modality}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: '#94A3B8' }}>—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold" style={{ color: '#0D9488' }}>
                          ₹{t.price.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3">
                          <button onClick={() => toggleActive(t)} disabled={toggling === t.id}
                            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={t.is_active
                              ? { background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }
                              : { background: '#FEF3C7', color: '#92400E', border: 'none', cursor: 'pointer' }}>
                            {toggling === t.id ? '…' : t.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => {
                              if (editId === t.id) { setEditId(null) }
                              else { setEditId(t.id); setEditForm(scanToForm(t)); setEditErr('') }
                            }}
                            className="p-1.5 rounded-lg"
                            style={{
                              background: editId === t.id ? '#CCFBF1' : '#F1F5F9',
                              color: editId === t.id ? '#0D9488' : '#64748B',
                              border: `1px solid ${editId === t.id ? '#99F6E4' : '#E2E8F0'}`, cursor: 'pointer',
                            }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {editId === t.id && (
                        <tr>
                          <td colSpan={5} className="p-0 px-2 pb-2">
                            <ScanForm
                              form={editForm} err={editErr} saving={editSaving} accent="#0D9488"
                              title={`Editing: ${t.name}`} saveLabel="Save Changes"
                              onSet={(f, v) => setEditForm((p) => ({ ...p, [f]: v }))}
                              onSave={submitEdit} onCancel={() => setEditId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Shared scan add/edit form ─────────────────────────────────────────────────

interface ScanFormProps {
  form: ScanForm; err: string; saving: boolean
  accent: string; title: string; saveLabel: string
  onSet: (f: string, v: string) => void
  onSave: () => void; onCancel: () => void
}

function ScanForm({ form, err, saving, accent, title, saveLabel, onSet, onSave, onCancel }: ScanFormProps) {
  const inp = 'w-full px-3 py-2 rounded-lg text-sm border'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  return (
    <div className="mt-2 p-4 rounded-xl space-y-3"
      style={{ background: `color-mix(in srgb, ${accent} 4%, white)`, border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)` }}>
      <p className="text-xs font-semibold" style={{ color: accent }}>{title}</p>

      {err && (
        <p className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {err}
        </p>
      )}

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Procedure Name *</label>
        <input value={form.name} onChange={(e) => onSet('name', e.target.value)}
          className={inp} style={bdr} placeholder="e.g. Chest X-Ray PA View" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Modality</label>
          <select value={form.modality} onChange={(e) => onSet('modality', e.target.value)}
            className={inp} style={{ ...bdr, paddingRight: '8px' }}>
            <option value="">— Select —</option>
            {MODALITIES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: accent }}>Price (₹) *</label>
          <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => onSet('price', e.target.value)}
            className={inp} style={{ borderColor: accent, color: accent, background: '#fff', fontWeight: 600 }}
            placeholder="500" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={onSave} disabled={saving}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: saving ? '#94A3B8' : accent, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
