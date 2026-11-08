'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, Pencil, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { listBankAccounts, upsertBankAccount, deleteBankAccount } from '@/app/actions/insurance'
import type { InsuranceBankAccount } from '@/lib/types'

interface Props {
  initialAccounts: InsuranceBankAccount[]
  onClose: () => void
  /** Only an admin may change accounts: one can carry the UPI id patients pay into (0267). Others see the list. */
  canManage: boolean
}

const BLANK = { account_name: '', bank_name: '', account_number: '', ifsc_code: '' }

export default function BankAccountManagerModal({ initialAccounts, onClose, canManage }: Props) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() { setAccounts(await listBankAccounts()) }

  function startEdit(a: InsuranceBankAccount) {
    setEditingId(a.id)
    setForm({
      account_name: a.account_name, bank_name: a.bank_name ?? '',
      account_number: a.account_number ?? '', ifsc_code: a.ifsc_code ?? '',
    })
  }
  function cancelEdit() { setEditingId(null); setForm(BLANK) }

  async function save() {
    if (!form.account_name.trim()) return
    setBusy(true); setError(null)
    const res = await upsertBankAccount({
      ...(editingId ? { id: editingId } : {}),
      account_name: form.account_name, bank_name: form.bank_name || null,
      account_number: form.account_number || null, ifsc_code: form.ifsc_code || null,
    })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    cancelEdit()
    await refresh()
  }

  async function remove(id: string) {
    setBusy(true); setError(null)
    const res = await deleteBankAccount(id)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    if (editingId === id) cancelEdit()
    await refresh()
  }

  async function toggle(a: InsuranceBankAccount) {
    setBusy(true); setError(null)
    const res = await upsertBankAccount({
      id: a.id, account_name: a.account_name, bank_name: a.bank_name,
      account_number: a.account_number, ifsc_code: a.ifsc_code, is_active: !a.is_active,
    })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    await refresh()
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '40px', outline: 'none',
  }
  const sub = (a: InsuranceBankAccount) => [a.bank_name, a.account_number, a.ifsc_code].filter(Boolean).join(' · ')

  return (
    <Modal open onClose={onClose} title="Bank Accounts" maxWidth="32rem">
      <div className="space-y-4">
        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {accounts.length === 0 && <p className="text-sm" style={{ color: '#94A3B8' }}>No bank accounts yet. Add one below.</p>}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: editingId === a.id ? '#F0FDFA' : '#F8FAFC', border: editingId === a.id ? '1px solid #99F6E4' : '1px solid transparent' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{a.account_name}</p>
                <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{sub(a) || 'No details yet'}</p>
              </div>
              {canManage ? (<>
              <button onClick={() => toggle(a)} disabled={busy}
                className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
                style={a.is_active ? { background: '#F0FDF4', color: '#0D9488' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                {a.is_active ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => startEdit(a)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#64748B' }} title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(a.id)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#EF4444' }} title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              </>) : (
                <span className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
                  style={a.is_active ? { background: '#F0FDF4', color: '#0D9488' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>
          ))}
        </div>

        {!canManage ? (
          <p className="pt-3 text-xs" style={{ borderTop: '1px solid #F1F5F9', color: '#64748B' }}>
            Only an admin can add or change accounts — an account can hold the UPI id patients pay into.
            Admins manage them under Settings → Billing &amp; Collections.
          </p>
        ) : (
        <div className="pt-3 space-y-2" style={{ borderTop: '1px solid #F1F5F9' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
              {editingId ? 'Edit Account' : 'Add Account'}
            </p>
            {editingId && (
              <button onClick={cancelEdit} className="flex items-center gap-1 text-xs" style={{ color: '#94A3B8' }}>
                <X className="w-3 h-3" /> Cancel
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Account label (e.g. HDFC Current A/c) *" value={form.account_name} onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
              className="col-span-2 px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Bank name" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="IFSC code" value={form.ifsc_code} onChange={(e) => setForm((f) => ({ ...f, ifsc_code: e.target.value }))}
              className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input placeholder="Account number" value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
              className="col-span-2 px-3 py-2 rounded-xl text-sm" style={inputStyle} />
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={busy || !form.account_name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: busy || !form.account_name.trim() ? '#94A3B8' : '#0D9488', minHeight: '40px' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save changes' : 'Add Account'}
            </button>
          </div>
        </div>
        )}
      </div>
    </Modal>
  )
}
