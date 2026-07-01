'use client'

import { useState, useEffect, Fragment } from 'react'
import { Plus, Search, Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createLabTest, updateLabTest, listAllLabCatalog } from '@/app/actions/lab'
import type { LabTestCatalog } from '@/lib/types'

interface Props { open: boolean; onClose: () => void; onSuccess: () => void }

const SAMPLE_TYPES = ['Blood', 'Urine', 'Swab', 'Stool', 'CSF', 'Tissue', 'Sputum', 'Other']

type TestForm = {
  name: string; code: string; sample_type: string; unit: string
  ref_low: string; ref_high: string; reference_range: string; price: string
}
const BLANK: TestForm = { name: '', code: '', sample_type: '', unit: '', ref_low: '', ref_high: '', reference_range: '', price: '' }

function parseNum(s: string): number | null { const n = parseFloat(s); return isNaN(n) ? null : n }

function testToForm(t: LabTestCatalog): TestForm {
  return {
    name: t.name, code: t.code ?? '', sample_type: t.sample_type ?? '',
    unit: t.unit ?? '', ref_low: t.ref_low != null ? String(t.ref_low) : '',
    ref_high: t.ref_high != null ? String(t.ref_high) : '',
    reference_range: t.reference_range ?? '', price: String(t.price),
  }
}

function formToPayload(f: TestForm) {
  return {
    name: f.name.trim(),
    code: f.code.trim() || null,
    sample_type: f.sample_type.toLowerCase() || null,
    unit: f.unit.trim() || null,
    ref_low: parseNum(f.ref_low),
    ref_high: parseNum(f.ref_high),
    reference_range: f.reference_range.trim() || null,
    price: parseFloat(f.price) || 0,
  }
}

export default function AddLabTestModal({ open, onClose, onSuccess }: Props) {
  const [tests, setTests]           = useState<LabTestCatalog[]>([])
  const [loading, setLoading]       = useState(false)
  const [query, setQuery]           = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const [addForm, setAddForm]       = useState<TestForm>(BLANK)
  const [addErr, setAddErr]         = useState('')
  const [addSaving, setAddSaving]   = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [editForm, setEditForm]     = useState<TestForm>(BLANK)
  const [editErr, setEditErr]       = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)

  useEffect(() => { if (open) load() }, [open])

  async function load() {
    setLoading(true)
    setTests(await listAllLabCatalog())
    setLoading(false)
  }

  const filtered = query.trim()
    ? tests.filter((t) =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        (t.code ?? '').toLowerCase().includes(query.toLowerCase()))
    : tests

  async function submitAdd() {
    if (!addForm.name.trim()) { setAddErr('Name is required'); return }
    if (!addForm.price) { setAddErr('Price is required'); return }
    setAddSaving(true); setAddErr('')
    const res = await createLabTest(formToPayload(addForm))
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
    const res = await updateLabTest(editId, formToPayload(editForm))
    setEditSaving(false)
    if (!res.success) { setEditErr(res.error); return }
    setEditId(null); await load(); onSuccess()
  }

  async function toggleActive(t: LabTestCatalog) {
    setToggling(t.id)
    await updateLabTest(t.id, { is_active: !t.is_active })
    await load(); setToggling(null); onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Lab Test Catalog  ·  ${tests.length} tests`} maxWidth="64rem">
      {/* Search + Add button */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border"
            style={{ borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }} />
        </div>
        <button onClick={() => { setShowAdd((v) => !v); setAddErr('') }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-4 h-4" /> Add Test
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <TestForm
          form={addForm} err={addErr} saving={addSaving} accent="#0D9488"
          title="New Test" saveLabel="Add Test"
          onSet={(f, v) => setAddForm((p) => ({ ...p, [f]: v }))}
          onSave={submitAdd} onCancel={() => { setShowAdd(false); setAddForm(BLANK) }}
        />
      )}

      {/* Catalog table */}
      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>Loading catalog…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
          {query ? 'No tests match your search.' : 'No tests yet. Add your first test above.'}
        </p>
      ) : (
        <>
          {/* ── Mobile card list (< sm) ── */}
          <div className="sm:hidden rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', maxHeight: '55vh', overflowY: 'auto' }}>
            {filtered.map((t) => (
              <Fragment key={t.id}>
                <div className="px-3 py-3" style={{ background: t.is_active ? '#fff' : '#FAFAFA', borderBottom: '1px solid #F1F5F9' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug flex-1" style={{ color: t.is_active ? '#0F172A' : '#64748B' }}>{t.name}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => toggleActive(t)} disabled={toggling === t.id}
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={t.is_active
                          ? { background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }
                          : { background: '#FEF3C7', color: '#92400E', border: 'none', cursor: 'pointer' }}>
                        {toggling === t.id ? '…' : t.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => { if (editId === t.id) setEditId(null); else { setEditId(t.id); setEditForm(testToForm(t)); setEditErr('') } }}
                        className="p-1.5 rounded-lg flex-shrink-0"
                        style={{ background: editId === t.id ? '#CCFBF1' : '#F1F5F9', color: editId === t.id ? '#0D9488' : '#64748B', border: `1px solid ${editId === t.id ? '#99F6E4' : '#E2E8F0'}`, cursor: 'pointer' }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs">
                    {t.sample_type && <span style={{ color: '#64748B' }}><span style={{ color: '#94A3B8' }}>Sample:</span> {t.sample_type}</span>}
                    {t.unit && <span style={{ color: '#64748B' }}><span style={{ color: '#94A3B8' }}>Unit:</span> {t.unit}</span>}
                    <span className="font-semibold" style={{ color: '#0D9488' }}>₹{t.price.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                {editId === t.id && (
                  <div className="px-2 pb-2" style={{ background: '#FAFAFA', borderBottom: '1px solid #F1F5F9' }}>
                    <TestForm
                      form={editForm} err={editErr} saving={editSaving} accent="#0D9488"
                      title={`Editing: ${t.name}`} saveLabel="Save Changes"
                      onSet={(f, v) => setEditForm((p) => ({ ...p, [f]: v }))}
                      onSave={submitEdit} onCancel={() => setEditId(null)}
                    />
                  </div>
                )}
              </Fragment>
            ))}
          </div>

          {/* ── Desktop table (sm+) ── */}
          <div className="hidden sm:block overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {[
                      { label: 'Name', cls: 'text-left' },
                      { label: 'Code', cls: 'text-left' },
                      { label: 'Sample', cls: 'text-left' },
                      { label: 'Unit', cls: 'text-left' },
                      { label: 'Ref Range', cls: 'text-left' },
                      { label: 'Price (₹)', cls: 'text-right' },
                      { label: 'Status', cls: 'text-center' },
                      { label: '', cls: '' },
                    ].map((h) => (
                      <th key={h.label} className={`py-2.5 px-3 text-xs font-semibold ${h.cls}`}
                        style={{ color: '#64748B', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, background: '#F8FAFC' }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <Fragment key={t.id}>
                      <tr style={{ borderBottom: '1px solid #F1F5F9', background: t.is_active ? '#fff' : '#FAFAFA' }}>
                        <td className="py-2.5 px-3 font-medium" style={{ color: t.is_active ? '#0F172A' : '#64748B' }}>{t.name}</td>
                        <td className="py-2.5 px-3 font-mono text-xs" style={{ color: '#94A3B8' }}>{t.code ?? '—'}</td>
                        <td className="py-2.5 px-3 text-xs capitalize" style={{ color: '#64748B' }}>{t.sample_type ?? '—'}</td>
                        <td className="py-2.5 px-3 text-xs" style={{ color: '#64748B' }}>{t.unit ?? '—'}</td>
                        <td className="py-2.5 px-3 text-xs" style={{ color: '#475569' }}>
                          {t.reference_range ?? (t.ref_low != null || t.ref_high != null
                            ? `${t.ref_low ?? '?'} – ${t.ref_high ?? '?'}`
                            : '—')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold" style={{ color: '#0D9488' }}>
                          ₹{t.price.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
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
                              else { setEditId(t.id); setEditForm(testToForm(t)); setEditErr('') }
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
                          <td colSpan={8} className="p-0 px-2 pb-2">
                            <TestForm
                              form={editForm} err={editErr} saving={editSaving} accent="#0D9488"
                              title={`Editing: ${t.name}`} saveLabel="Save Changes"
                              onSet={(f, v) => setEditForm((p) => ({ ...p, [f]: v }))}
                              onSave={submitEdit} onCancel={() => setEditId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Shared add/edit form ──────────────────────────────────────────────────────

interface FormProps {
  form: TestForm; err: string; saving: boolean
  accent: string; title: string; saveLabel: string
  onSet: (f: string, v: string) => void
  onSave: () => void; onCancel: () => void
}

function TestForm({ form, err, saving, accent, title, saveLabel, onSet, onSave, onCancel }: FormProps) {
  const inp = 'w-full px-3 py-2 rounded-lg text-sm border'
  const bdr = { borderColor: '#E2E8F0', color: '#0F172A', background: '#fff' }

  return (
    <div className="mt-2 p-4 rounded-xl space-y-3"
      style={{ background: `color-mix(in srgb, ${accent} 4%, white)`, border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)` }}>
      <p className="text-xs font-semibold" style={{ color: accent }}>{title}</p>

      {err && (
        <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {err}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Test Name *</label>
          <input value={form.name} onChange={(e) => onSet('name', e.target.value)}
            className={inp} style={bdr} placeholder="e.g. Complete Blood Count" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Code</label>
          <input value={form.code} onChange={(e) => onSet('code', e.target.value)}
            className={inp} style={bdr} placeholder="CBC" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Sample</label>
          <select value={form.sample_type} onChange={(e) => onSet('sample_type', e.target.value)}
            className={inp} style={{ ...bdr, paddingRight: '8px' }}>
            <option value="">—</option>
            {SAMPLE_TYPES.map((s) => (
              <option key={s} value={s.toLowerCase()}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Unit</label>
          <input value={form.unit} onChange={(e) => onSet('unit', e.target.value)}
            className={inp} style={bdr} placeholder="mg/dL" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Ref Low</label>
          <input type="number" step="any" value={form.ref_low} onChange={(e) => onSet('ref_low', e.target.value)}
            className={inp} style={bdr} placeholder="70" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Ref High</label>
          <input type="number" step="any" value={form.ref_high} onChange={(e) => onSet('ref_high', e.target.value)}
            className={inp} style={bdr} placeholder="110" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Reference Range (report display)</label>
          <input value={form.reference_range} onChange={(e) => onSet('reference_range', e.target.value)}
            className={inp} style={bdr} placeholder="70–110 mg/dL" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: accent }}>Price (₹) *</label>
          <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => onSet('price', e.target.value)}
            className={inp} style={{ borderColor: accent, color: accent, background: '#fff', fontWeight: 600 }}
            placeholder="150" />
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
