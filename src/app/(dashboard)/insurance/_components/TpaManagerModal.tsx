'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, Pencil, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { listTpas, upsertTpa, deleteTpa } from '@/app/actions/insurance'
import type { InsuranceTpa } from '@/lib/types'

interface Props { initialTpas: InsuranceTpa[]; onClose: () => void }

const BLANK = { name: '', code: '', contact_person: '', phone: '', email: '', notes: '' }

export default function TpaManagerModal({ initialTpas, onClose }: Props) {
  const [tpas, setTpas] = useState(initialTpas)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() { setTpas(await listTpas()) }

  function startEdit(t: InsuranceTpa) {
    setEditingId(t.id)
    setForm({
      name: t.name, code: t.code ?? '', contact_person: t.contact_person ?? '',
      phone: t.phone ?? '', email: t.email ?? '', notes: t.notes ?? '',
    })
  }
  function cancelEdit() { setEditingId(null); setForm(BLANK) }

  async function save() {
    if (!form.name.trim()) return
    setBusy(true); setError(null)
    const res = await upsertTpa({
      ...(editingId ? { id: editingId } : {}),
      name: form.name, code: form.code || null,
      contact_person: form.contact_person || null, phone: form.phone || null,
      email: form.email || null, notes: form.notes || null,
    })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    cancelEdit()
    await refresh()
  }

  async function remove(id: string) {
    setBusy(true); setError(null)
    const res = await deleteTpa(id)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    if (editingId === id) cancelEdit()
    await refresh()
  }

  async function toggle(t: InsuranceTpa) {
    setBusy(true); setError(null)
    await upsertTpa({
      id: t.id, name: t.name, code: t.code, contact_person: t.contact_person,
      phone: t.phone, email: t.email, notes: t.notes, is_active: !t.is_active,
    })
    setBusy(false)
    await refresh()
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '40px', outline: 'none',
  }
  const sub = (t: InsuranceTpa) => [t.contact_person, t.phone, t.email].filter(Boolean).join(' · ')

  return (
    <Modal open onClose={onClose} title="TPAs / Insurers" maxWidth="32rem">
      <div className="space-y-4">
        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        {/* List */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {tpas.length === 0 && <p className="text-sm" style={{ color: '#94A3B8' }}>No TPAs yet. Add one below.</p>}
          {tpas.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: editingId === t.id ? '#F0FDFA' : '#F8FAFC', border: editingId === t.id ? '1px solid #99F6E4' : '1px solid transparent' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{t.name}</p>
                <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{sub(t) || (t.code ? `Code: ${t.code}` : 'No contact yet')}</p>
              </div>
              <button onClick={() => toggle(t)} disabled={busy}
                className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
                style={t.is_active ? { background: '#F0FDF4', color: '#0D9488' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                {t.is_active ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => startEdit(t)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#64748B' }} title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(t.id)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#EF4444' }} title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add / edit form */}
        <div className="pt-3 space-y-2" style={{ borderTop: '1px solid #F1F5F9' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
              {editingId ? 'Edit TPA' : 'Add TPA'}
            </p>
            {editingId && (
              <button onClick={cancelEdit} className="flex items-center gap-1 text-xs" style={{ color: '#94A3B8' }}>
                <X className="w-3 h-3" /> Cancel
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="TPA / insurer name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="col-span-2 px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Contact person" value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Notes (e.g. portal / desk hours)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="col-span-2 px-3 py-2 rounded-xl text-sm" style={inputStyle} />
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={busy || !form.name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: busy || !form.name.trim() ? '#94A3B8' : '#0D9488', minHeight: '40px' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save changes' : 'Add TPA'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
