'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, Pencil, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import { listTariffPackages, upsertTariffPackage, deleteTariffPackage } from '@/app/actions/insurance'
import type { InsuranceTariffPackage, InsuranceTpa } from '@/lib/types'

interface Props { initialPackages: InsuranceTariffPackage[]; tpas: InsuranceTpa[]; onClose: () => void }

const BLANK = { provider: '', tpa_id: '', package_name: '', package_code: '', amount: '' }

export default function TariffPackageManagerModal({ initialPackages, tpas, onClose }: Props) {
  const [packages, setPackages] = useState(initialPackages)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() { setPackages(await listTariffPackages()) }

  function startEdit(p: InsuranceTariffPackage) {
    setEditingId(p.id)
    setForm({ provider: p.provider ?? '', tpa_id: p.tpa_id ?? '', package_name: p.package_name, package_code: p.package_code ?? '', amount: String(p.amount) })
  }
  function cancelEdit() { setEditingId(null); setForm(BLANK) }

  async function save() {
    if (!form.package_name.trim() || !(parseFloat(form.amount) >= 0)) return
    setBusy(true); setError(null)
    const res = await upsertTariffPackage({
      ...(editingId ? { id: editingId } : {}),
      provider: form.provider || null, tpa_id: form.tpa_id || null,
      package_name: form.package_name, package_code: form.package_code || null, amount: parseFloat(form.amount),
    })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    cancelEdit(); await refresh()
  }

  async function remove(id: string) {
    setBusy(true); setError(null)
    const res = await deleteTariffPackage(id)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    if (editingId === id) cancelEdit()
    await refresh()
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '40px', outline: 'none',
  }

  return (
    <Modal open onClose={onClose} title="Agreed Tariffs / Package Rates" maxWidth="34rem">
      <div className="space-y-4">
        <p className="text-xs" style={{ color: '#64748B' }}>
          Empanelled rates you&apos;ve agreed with an insurer or TPA — reference these when raising a claim so the amount matches the negotiated package.
        </p>
        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {packages.length === 0 && <p className="text-sm" style={{ color: '#94A3B8' }}>No package rates yet. Add one below.</p>}
          {packages.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: editingId === p.id ? '#F0FDFA' : '#F8FAFC', border: editingId === p.id ? '1px solid #99F6E4' : '1px solid transparent' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{p.package_name}{p.package_code ? ` · ${p.package_code}` : ''}</p>
                <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{[p.provider, tpas.find((t) => t.id === p.tpa_id)?.name].filter(Boolean).join(' · ') || 'Any insurer'}</p>
              </div>
              <Money amount={p.amount} className="text-sm font-semibold shrink-0" style={{ color: '#0D9488' }} />
              <button onClick={() => startEdit(p)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#64748B' }} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => remove(p.id)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#EF4444' }} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>

        <div className="pt-3 space-y-2" style={{ borderTop: '1px solid #F1F5F9' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>{editingId ? 'Edit Package' : 'Add Package'}</p>
            {editingId && <button onClick={cancelEdit} className="flex items-center gap-1 text-xs" style={{ color: '#94A3B8' }}><X className="w-3 h-3" /> Cancel</button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Package name * (e.g. Appendectomy)" value={form.package_name} onChange={(e) => setForm((f) => ({ ...f, package_name: e.target.value }))}
              className="col-span-2 px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Package code" value={form.package_code} onChange={(e) => setForm((f) => ({ ...f, package_code: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Agreed amount ₹ *" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Insurer (optional)" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <Select value={form.tpa_id} onChange={(e) => setForm((f) => ({ ...f, tpa_id: e.target.value }))}>
              <option value="">— Any TPA —</option>
              {tpas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={busy || !form.package_name.trim() || !(parseFloat(form.amount) >= 0)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: busy ? '#94A3B8' : '#0D9488', minHeight: '40px' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save changes' : 'Add Package'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
