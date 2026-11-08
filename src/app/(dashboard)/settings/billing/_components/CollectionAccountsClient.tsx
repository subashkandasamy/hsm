'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Pencil, Plus, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import { getCollectionSetup, setDepartmentAccount, type CollectionSetup } from '@/app/actions/billingSettings'
import { upsertBankAccount } from '@/app/actions/insurance'
import { ADVANCE_KEY, DEPARTMENTS } from '@/lib/billing/collectionAccounts'
import { isValidVpa } from '@/lib/upi'
import type { InsuranceBankAccount } from '@/lib/types'

interface Props {
  initialSetup: CollectionSetup | null
  /** Why the setup could not be loaded, when it could not. */
  loadError?: string
}

const BLANK = { account_name: '', upi_vpa: '', upi_payee_name: '', bank_name: '', account_number: '', ifsc_code: '' }

/** Every department, then IPD advance deposits, which take one account for the whole deposit (0268). */
const ROUTE_ROWS: Array<{ key: string; label: string; hint?: string }> = [
  ...DEPARTMENTS.map((d) => ({ key: d.key as string, label: d.label as string })),
  { key: ADVANCE_KEY, label: 'Advance deposits (IPD)', hint: 'The QR shown when taking an admitted patient\'s advance.' },
]

const input: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '40px', outline: 'none',
}

function SavedTick({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
      <Check className="w-3.5 h-3.5" /> Saved
    </span>
  )
}

/**
 * Where each department's money is paid. The main account is the UPI id on
 * the hospital profile; every department pays into it unless pointed at one of
 * the accounts listed here. The payment screens then show one QR per account.
 */
export default function CollectionAccountsClient({ initialSetup, loadError }: Props) {
  const [setup, setSetup] = useState<CollectionSetup | null>(initialSetup)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [routeError, setRouteError] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!setup) {
    return (
      <div className="p-4 rounded-xl text-sm max-w-3xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
        {loadError ?? 'The accounts cannot be loaded right now.'} Until then every payment QR uses the UPI id on the
        hospital profile, as before.
      </div>
    )
  }

  const accounts = setup.accounts
  const active = accounts.filter((a) => a.is_active)
  const vpaBad = form.upi_vpa.trim() !== '' && !isValidVpa(form.upi_vpa)

  async function reload() {
    const res = await getCollectionSetup()
    if (res.setup) setSetup(res.setup)
  }
  function flash(what: string) { setSaved(what); setTimeout(() => setSaved(null), 2500) }

  function startEdit(a: InsuranceBankAccount) {
    setAdding(false); setEditingId(a.id); setError('')
    setForm({
      account_name: a.account_name, upi_vpa: a.upi_vpa ?? '', upi_payee_name: a.upi_payee_name ?? '',
      bank_name: a.bank_name ?? '', account_number: a.account_number ?? '', ifsc_code: a.ifsc_code ?? '',
    })
  }
  function closeForm() { setEditingId(null); setAdding(false); setForm(BLANK); setError('') }

  function saveAccount() {
    if (!form.account_name.trim()) { setError('Give the account a name staff will recognise, e.g. "Pharmacy — ICICI".'); return }
    if (vpaBad) { setError('That does not look like a UPI id — it should read something like pharmacy@okicici.'); return }
    const existing = editingId ? accounts.find((a) => a.id === editingId) : null
    startTransition(async () => {
      const res = await upsertBankAccount({
        ...(editingId ? { id: editingId } : {}),
        account_name: form.account_name.trim(),
        upi_vpa: form.upi_vpa.trim(),
        upi_payee_name: form.upi_payee_name.trim(),
        bank_name: form.bank_name.trim() || null,
        account_number: form.account_number.trim() || null,
        ifsc_code: form.ifsc_code.trim() || null,
        is_active: existing ? existing.is_active : true,
      })
      if (!res.success) { setError(res.error); return }
      closeForm(); await reload(); flash('account')
    })
  }

  function toggleActive(a: InsuranceBankAccount) {
    setError('')
    startTransition(async () => {
      const res = await upsertBankAccount({
        id: a.id, account_name: a.account_name, bank_name: a.bank_name,
        account_number: a.account_number, ifsc_code: a.ifsc_code, is_active: !a.is_active,
      })
      if (!res.success) { setError(res.error); return }
      await reload(); flash('account')
    })
  }

  function route(dept: string, value: string) {
    const previous = setup!.routes
    const next = { ...previous }
    if (value === 'main') delete next[dept]; else next[dept] = value
    setSetup({ ...setup!, routes: next })        // shown at once, put back if it fails
    setRouteError('')
    startTransition(async () => {
      const res = await setDepartmentAccount(dept, value === 'main' ? null : value)
      if (!res.success) { setSetup((s) => (s ? { ...s, routes: previous } : s)); setRouteError(res.error); return }
      flash('route')
    })
  }

  const describe = (a: InsuranceBankAccount) =>
    [a.upi_vpa ? `UPI ${a.upi_vpa}` : 'No UPI id', a.bank_name, a.account_number].filter(Boolean).join(' · ')

  const showForm = adding || editingId !== null

  return (
    <div className="space-y-4 max-w-3xl">
      <GlassCard>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="font-semibold" style={{ color: '#0F172A' }}>Accounts patients pay into</h2>
            <SavedTick show={saved === 'account'} />
          </div>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>
            Add an account here for each department that banks separately — say pharmacy, or lab and radiology.
            Patients pay straight into these accounts; the money never passes through Uyirly.
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: '#F0FDFA', border: '1px solid #CCFBF1' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Main account</p>
                <p className="text-xs truncate" style={{ color: setup.main.vpa ? '#475569' : '#B45309' }}>
                  {setup.main.vpa ? `UPI ${setup.main.vpa} · ${setup.main.payeeName}` : 'No UPI id set yet — no QR can be shown for it'}
                </p>
              </div>
              <Link href="/settings/profile" className="text-xs font-medium shrink-0" style={{ color: '#0D9488' }}>
                Change on Hospital Profile
              </Link>
            </div>

            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                style={{ background: editingId === a.id ? '#F0FDFA' : '#F8FAFC', border: editingId === a.id ? '1px solid #99F6E4' : '1px solid transparent' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: a.is_active ? '#0F172A' : '#94A3B8' }}>{a.account_name}</p>
                  <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{describe(a)}</p>
                </div>
                <button type="button" onClick={() => toggleActive(a)} disabled={isPending}
                  className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
                  style={a.is_active ? { background: '#F0FDF4', color: '#0D9488' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </button>
                <button type="button" onClick={() => startEdit(a)} disabled={isPending} className="p-1 rounded shrink-0"
                  style={{ color: '#64748B' }} aria-label={`Edit ${a.account_name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {showForm ? (
            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
                  {editingId ? 'Edit account' : 'Add an account'}
                </p>
                <button type="button" onClick={closeForm} className="flex items-center gap-1 text-xs" style={{ color: '#94A3B8' }}>
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Account name *</label>
                  <input value={form.account_name} placeholder="Pharmacy — ICICI current"
                    onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm" style={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>UPI id</label>
                  <input value={form.upi_vpa} placeholder="pharmacy@okicici"
                    onChange={(e) => setForm((f) => ({ ...f, upi_vpa: e.target.value.trim() }))}
                    className="w-full px-3 py-2 rounded-xl text-sm" style={{ ...input, borderColor: vpaBad ? '#FCA5A5' : '#E2E8F0' }} />
                  <p className="text-xs mt-1" style={{ color: vpaBad ? '#DC2626' : '#94A3B8' }}>
                    {vpaBad ? 'That does not look like a UPI id.' : 'Exactly as it appears in the UPI app. A wrong id pays a stranger.'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Name shown to patients</label>
                  <input value={form.upi_payee_name} placeholder="Blank uses the hospital name"
                    onChange={(e) => setForm((f) => ({ ...f, upi_payee_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm" style={input} />
                </div>
                <input value={form.bank_name} placeholder="Bank name"
                  onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-sm" style={input} />
                <input value={form.ifsc_code} placeholder="IFSC code"
                  onChange={(e) => setForm((f) => ({ ...f, ifsc_code: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-sm" style={input} />
                <input value={form.account_number} placeholder="Account number"
                  onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                  className="sm:col-span-2 px-3 py-2 rounded-xl text-sm" style={input} />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={saveAccount} disabled={isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: isPending ? '#94A3B8' : '#0D9488', minHeight: '40px' }}>
                  {editingId ? 'Save changes' : 'Add account'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setAdding(true); setEditingId(null); setForm(BLANK); setError('') }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium" style={{ color: '#0D9488' }}>
              <Plus className="w-4 h-4" /> Add an account
            </button>
          )}

          {error && <p className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="font-semibold" style={{ color: '#0F172A' }}>Which account each department pays into</h2>
            <SavedTick show={saved === 'route'} />
          </div>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>
            The QR at payment uses the account set here. When a patient pays for several departments at once, they
            get one QR per account.
          </p>

          <div>
            {ROUTE_ROWS.map((d, i) => {
              const id = setup.routes[d.key]
              const acct = id ? accounts.find((a) => a.id === id) : undefined
              const fallsBack = !!id && (!acct || !acct.is_active)
              const value = id && acct?.is_active ? id : 'main'
              return (
                <div key={d.key} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5"
                  style={i ? { borderTop: '1px solid #F1F5F9' } : undefined}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: '#0F172A' }}>{d.label}</p>
                    {d.hint && <p className="text-xs" style={{ color: '#94A3B8' }}>{d.hint}</p>}
                    {fallsBack && (
                      <p className="text-xs" style={{ color: '#B45309' }}>
                        Set to {acct?.account_name ?? 'a removed account'}, which is inactive — paying into the main account.
                      </p>
                    )}
                  </div>
                  <div className="sm:w-64">
                    <Select value={value} onChange={(e) => route(d.key, e.target.value)} disabled={isPending}
                      aria-label={`Account for ${d.label}`}>
                      <option value="main">Main account</option>
                      {active.map((a) => <option key={a.id} value={a.id}>{a.account_name}{a.upi_vpa ? '' : ' (no UPI id)'}</option>)}
                    </Select>
                  </div>
                </div>
              )
            })}
          </div>

          {routeError && <p className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{routeError}</p>}

          <div className="mt-6 pt-4 text-xs space-y-1" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
            <p>Cash and card are not tied to an account — they go into the counter drawer as before.</p>
            <p>An advance pays the admitted patient&rsquo;s bills from every department. Moving that money between your own accounts afterwards is up to you.</p>
            <p>Changing an account here changes the QR for payments from now on. Money already received stays where it was paid.</p>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
