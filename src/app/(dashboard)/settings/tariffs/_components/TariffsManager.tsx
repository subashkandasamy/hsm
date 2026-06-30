'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Check, X, BadgeDollarSign, Bed, Stethoscope } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import {
  updateWardRate,
  createProcedureTariff,
  updateProcedureTariff,
} from '@/app/actions/tariffs'
import type { Ward, ProcedureTariff } from '@/lib/types'

interface Props {
  initialWards: Ward[]
  initialTariffs: ProcedureTariff[]
}

const CATEGORIES = ['surgery', 'procedure', 'package'] as const

export default function TariffsManager({ initialWards, initialTariffs }: Props) {
  const [wards, setWards]       = useState(initialWards)
  const [tariffs, setTariffs]   = useState(initialTariffs)
  const [isPending, startTransition] = useTransition()
  const [error, setError]       = useState('')

  // Ward rate editing
  const [editingWardId, setEditingWardId] = useState<string | null>(null)
  const [wardRateInput, setWardRateInput] = useState('')

  // Procedure tariff editing
  const [editingTariffId, setEditingTariffId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [tariffForm, setTariffForm] = useState({
    name: '', category: '' as '' | 'surgery' | 'procedure' | 'package', default_price: '',
  })

  // ---- Ward rate actions ----

  function startEditWard(w: Ward & { daily_rate?: number }) {
    setEditingWardId(w.id)
    setWardRateInput(String((w as unknown as { daily_rate: number }).daily_rate ?? 0))
    setError('')
  }

  function saveWardRate(id: string) {
    const rate = parseFloat(wardRateInput)
    if (isNaN(rate) || rate < 0) { setError('Enter a valid rate'); return }
    setError('')
    startTransition(async () => {
      const res = await updateWardRate(id, rate)
      if (!res.success) { setError(res.error); return }
      setWards((ws) => ws.map((w) => w.id === id ? { ...w, daily_rate: rate } as unknown as Ward : w))
      setEditingWardId(null)
    })
  }

  // ---- Procedure tariff actions ----

  function openCreate() {
    setEditingTariffId(null)
    setTariffForm({ name: '', category: '', default_price: '' })
    setShowCreate(true)
    setError('')
  }

  function openEditTariff(t: ProcedureTariff) {
    setShowCreate(false)
    setEditingTariffId(t.id)
    setTariffForm({
      name: t.name,
      category: (t.category ?? '') as '' | 'surgery' | 'procedure' | 'package',
      default_price: String(t.default_price),
    })
    setError('')
  }

  function submitCreate() {
    const price = parseFloat(tariffForm.default_price)
    if (!tariffForm.name.trim()) { setError('Name is required'); return }
    if (isNaN(price) || price < 0) { setError('Enter a valid price'); return }
    setError('')
    startTransition(async () => {
      const res = await createProcedureTariff({
        name: tariffForm.name.trim(),
        category: tariffForm.category || null,
        default_price: price,
      })
      if (!res.success) { setError(res.error); return }
      setTariffs((ts) => [...ts, res.tariff].sort((a, b) => a.name.localeCompare(b.name)))
      setShowCreate(false)
    })
  }

  function submitEdit(id: string) {
    const price = parseFloat(tariffForm.default_price)
    if (!tariffForm.name.trim()) { setError('Name is required'); return }
    if (isNaN(price) || price < 0) { setError('Enter a valid price'); return }
    setError('')
    startTransition(async () => {
      const res = await updateProcedureTariff(id, {
        name: tariffForm.name.trim(),
        category: tariffForm.category || null,
        default_price: price,
      })
      if (!res.success) { setError(res.error); return }
      setTariffs((ts) => ts.map((t) =>
        t.id === id ? { ...t, name: tariffForm.name.trim(), category: tariffForm.category || null, default_price: price } : t
      ))
      setEditingTariffId(null)
    })
  }

  function toggleTariffActive(t: ProcedureTariff) {
    startTransition(async () => {
      await updateProcedureTariff(t.id, { is_active: !t.is_active })
      setTariffs((ts) => ts.map((x) => x.id === t.id ? { ...x, is_active: !x.is_active } : x))
    })
  }

  const catLabel = (c: string | null) =>
    c ? c.charAt(0).toUpperCase() + c.slice(1) : '—'

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>
          {error}
        </div>
      )}

      {/* ---- Ward Room Rates ---- */}
      <GlassCard>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bed className="w-5 h-5" style={{ color: '#0D9488' }} />
            <h2 className="text-base font-semibold" style={{ color: '#0F172A' }}>Ward Room Rates</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th className="text-left pb-2 font-medium" style={{ color: '#64748B' }}>Ward</th>
                  <th className="text-right pb-2 font-medium" style={{ color: '#64748B' }}>Daily Rate (₹)</th>
                  <th className="w-24 pb-2" />
                </tr>
              </thead>
              <tbody>
                {wards.map((ward) => {
                  const dailyRate = (ward as unknown as { daily_rate: number }).daily_rate ?? 0
                  const isEditing = editingWardId === ward.id
                  return (
                    <tr key={ward.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td className="py-3 font-medium" style={{ color: '#0F172A' }}>{ward.name}</td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={wardRateInput}
                            onChange={(e) => setWardRateInput(e.target.value)}
                            className="w-32 px-2 py-1 text-right text-sm rounded border"
                            style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                            autoFocus
                          />
                        ) : (
                          <Money amount={dailyRate} style={{ color: '#0F172A' }} />
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => saveWardRate(ward.id)}
                              disabled={isPending}
                              className="p-1.5 rounded-lg"
                              style={{ background: '#DCFCE7', color: '#16A34A' }}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingWardId(null)}
                              className="p-1.5 rounded-lg"
                              style={{ background: '#F1F5F9', color: '#64748B' }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditWard(ward as unknown as Ward & { daily_rate: number })}
                            className="p-1.5 rounded-lg"
                            style={{ background: '#F1F5F9', color: '#64748B' }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!wards.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm" style={{ color: '#94A3B8' }}>
                      No wards set up yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </GlassCard>

      {/* ---- Procedure Tariffs ---- */}
      <GlassCard>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5" style={{ color: '#0D9488' }} />
              <h2 className="text-base font-semibold" style={{ color: '#0F172A' }}>Procedure Tariffs</h2>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#0D9488', color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> Add Tariff
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="mb-4 p-4 rounded-xl border" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
              <p className="text-sm font-medium mb-3" style={{ color: '#0F172A' }}>New Procedure Tariff</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Procedure name"
                  value={tariffForm.name}
                  onChange={(e) => setTariffForm((f) => ({ ...f, name: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                />
                <select
                  value={tariffForm.category}
                  onChange={(e) => setTariffForm((f) => ({ ...f, category: e.target.value as '' | 'surgery' | 'procedure' | 'package' }))}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                >
                  <option value="">Category (optional)</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                </select>
                <input
                  type="number"
                  min={0}
                  placeholder="Price (₹)"
                  value={tariffForm.default_price}
                  onChange={(e) => setTariffForm((f) => ({ ...f, default_price: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={submitCreate}
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: '#0D9488', color: '#fff' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-1.5 rounded-lg text-sm"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th className="text-left pb-2 font-medium" style={{ color: '#64748B' }}>Name</th>
                  <th className="text-left pb-2 font-medium hidden sm:table-cell" style={{ color: '#64748B' }}>Category</th>
                  <th className="text-right pb-2 font-medium" style={{ color: '#64748B' }}>Price (₹)</th>
                  <th className="w-28 pb-2" />
                </tr>
              </thead>
              <tbody>
                {tariffs.map((t) => {
                  const isEditing = editingTariffId === t.id
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9', opacity: t.is_active ? 1 : 0.5 }}>
                      <td className="py-3 font-medium" style={{ color: '#0F172A' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={tariffForm.name}
                            onChange={(e) => setTariffForm((f) => ({ ...f, name: e.target.value }))}
                            className="px-2 py-1 text-sm rounded border w-full"
                            style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                          />
                        ) : t.name}
                      </td>
                      <td className="py-3 hidden sm:table-cell" style={{ color: '#64748B' }}>
                        {isEditing ? (
                          <select
                            value={tariffForm.category}
                            onChange={(e) => setTariffForm((f) => ({ ...f, category: e.target.value as '' | 'surgery' | 'procedure' | 'package' }))}
                            className="px-2 py-1 text-sm rounded border"
                            style={{ borderColor: '#CBD5E1' }}
                          >
                            <option value="">—</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                          </select>
                        ) : catLabel(t.category)}
                      </td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={tariffForm.default_price}
                            onChange={(e) => setTariffForm((f) => ({ ...f, default_price: e.target.value }))}
                            className="w-28 px-2 py-1 text-right text-sm rounded border"
                            style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                          />
                        ) : (
                          <Money amount={t.default_price} style={{ color: '#0F172A' }} />
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => submitEdit(t.id)}
                                disabled={isPending}
                                className="p-1.5 rounded-lg"
                                style={{ background: '#DCFCE7', color: '#16A34A' }}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingTariffId(null)}
                                className="p-1.5 rounded-lg"
                                style={{ background: '#F1F5F9', color: '#64748B' }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEditTariff(t)}
                                className="p-1.5 rounded-lg"
                                style={{ background: '#F1F5F9', color: '#64748B' }}
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleTariffActive(t)}
                                disabled={isPending}
                                className="px-2 py-1 rounded text-xs"
                                style={{
                                  background: t.is_active ? '#FEF2F2' : '#F0FDF4',
                                  color: t.is_active ? '#DC2626' : '#16A34A',
                                }}
                              >
                                {t.is_active ? 'Disable' : 'Enable'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!tariffs.length && !showCreate && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm" style={{ color: '#94A3B8' }}>
                      No procedure tariffs defined. Add one to enable advance suggestions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </GlassCard>

      <p className="text-xs" style={{ color: '#94A3B8' }}>
        Tip: Per-doctor consultation fees can be set on each doctor&apos;s staff profile page.
      </p>
    </div>
  )
}
