'use client'

import { useState, useTransition } from 'react'
import { Check, Plus, Pencil, Trash2, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import {
  updateIpdConfig, setAdvancePercentage,
  createCustomCharge, updateCustomCharge, deleteCustomCharge,
} from '@/app/actions/ipdConfig'
import { DEFAULT_DECLARATION_TEMPLATE } from '@/lib/ipdDeclarationTemplate'
import type { IpdBillingConfig, IpdCustomCharge } from '@/lib/types'

interface Props {
  config: IpdBillingConfig
  advancePercentage: number
  initialCustomCharges: IpdCustomCharge[]
}

type BoolKey = 'charge_room_rent' | 'charge_doctor_fee' | 'charge_nursing' | 'charge_medicines' | 'charge_admission_fee'

const TOGGLES: { key: BoolKey; label: string; hint: string }[] = [
  { key: 'charge_room_rent',     label: 'Room Rent',          hint: "Uses the ward's daily rate — set directly on each ward in the Ward Board." },
  { key: 'charge_doctor_fee',    label: 'Daily Doctor Fee',   hint: "Uses the attending doctor's consultation fee — set on their staff profile." },
  { key: 'charge_nursing',       label: 'Nursing Charges',    hint: 'Charges each nurse assigned to a shift at their configured per-shift rate.' },
  { key: 'charge_medicines',     label: 'Medicine Dispenses', hint: 'Auto-includes pharmacy dispenses for this patient during the day.' },
  { key: 'charge_admission_fee', label: 'Admission Fee',      hint: 'One-time fee charged only on Day 1 of admission.' },
]

export default function IpdBillingConfigClient({ config, advancePercentage: initPct, initialCustomCharges }: Props) {
  const [cfg, setCfg] = useState(config)
  const [advPct, setAdvPct] = useState(String(initPct))
  const [admFeeInput, setAdmFeeInput] = useState(String(config.admission_fee_amount))
  const [svcInput, setSvcInput] = useState(String(config.service_charge_per_day))
  const [templateInput, setTemplateInput] = useState(config.declaration_template || DEFAULT_DECLARATION_TEMPLATE)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Custom charges state
  const [charges, setCharges] = useState<IpdCustomCharge[]>(initialCustomCharges)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [chargeError, setChargeError] = useState('')

  function toggle(key: BoolKey) {
    const next = { ...cfg, [key]: !cfg[key] }
    setCfg(next)
    save(next)
  }

  function save(overrides?: Partial<IpdBillingConfig>) {
    setError('')
    setSaved(false)
    const merged = { ...cfg, ...overrides }
    startTransition(async () => {
      const res = await updateIpdConfig({
        charge_room_rent:       merged.charge_room_rent,
        charge_doctor_fee:      merged.charge_doctor_fee,
        charge_nursing:         merged.charge_nursing,
        charge_medicines:       merged.charge_medicines,
        charge_admission_fee:   merged.charge_admission_fee,
        admission_fee_amount:   merged.admission_fee_amount,
        service_charge_per_day: merged.service_charge_per_day,
      })
      if (!res.success) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  function saveAmounts() {
    const admFee = parseFloat(admFeeInput)
    const svc    = parseFloat(svcInput)
    if (isNaN(admFee) || admFee < 0 || isNaN(svc) || svc < 0) {
      setError('Amounts must be non-negative numbers')
      return
    }
    const next = { ...cfg, admission_fee_amount: admFee, service_charge_per_day: svc }
    setCfg(next)
    save(next)
  }

  function saveAdvPct() {
    const pct = parseFloat(advPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('Must be 0–100'); return }
    setError('')
    startTransition(async () => {
      const res = await setAdvancePercentage(pct)
      if (!res.success) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  function addCharge() {
    const amt = parseFloat(newAmount)
    if (!newName.trim()) { setChargeError('Name is required'); return }
    if (isNaN(amt) || amt < 0) { setChargeError('Enter a valid amount'); return }
    setChargeError('')
    startTransition(async () => {
      const res = await createCustomCharge(newName.trim(), amt)
      if (!res.success) { setChargeError(res.error); return }
      setCharges((prev) => [...prev, res.charge])
      setNewName(''); setNewAmount(''); setShowAdd(false)
    })
  }

  function startEdit(c: IpdCustomCharge) {
    setEditingId(c.id); setEditName(c.name); setEditAmount(String(c.amount)); setChargeError('')
  }

  function saveEdit(id: string) {
    const amt = parseFloat(editAmount)
    if (!editName.trim()) { setChargeError('Name is required'); return }
    if (isNaN(amt) || amt < 0) { setChargeError('Enter a valid amount'); return }
    setChargeError('')
    startTransition(async () => {
      const res = await updateCustomCharge(id, { name: editName.trim(), amount: amt })
      if (!res.success) { setChargeError(res.error); return }
      setCharges((prev) => prev.map((c) => c.id === id ? { ...c, name: editName.trim(), amount: amt } : c))
      setEditingId(null)
    })
  }

  function toggleCharge(id: string, is_active: boolean) {
    startTransition(async () => {
      await updateCustomCharge(id, { is_active })
      setCharges((prev) => prev.map((c) => c.id === id ? { ...c, is_active } : c))
    })
  }

  function removeCharge(id: string) {
    startTransition(async () => {
      const res = await deleteCustomCharge(id)
      if (!res.success) { setChargeError(res.error); return }
      setCharges((prev) => prev.filter((c) => c.id !== id))
    })
  }

  function saveTemplate() {
    if (!templateInput.trim()) { setError('Declaration text cannot be empty'); return }
    setError('')
    startTransition(async () => {
      const res = await updateIpdConfig({ declaration_template: templateInput })
      if (!res.success) { setError(res.error); return }
      setCfg((prev) => ({ ...prev, declaration_template: templateInput }))
      setTemplateSaved(true)
      setTimeout(() => setTemplateSaved(false), 2500)
    })
  }

  function resetTemplate() {
    setTemplateInput(DEFAULT_DECLARATION_TEMPLATE)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>
      )}
      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: '#F0FDF4', color: '#15803D' }}>
          <Check className="w-4 h-4" /> Saved
        </div>
      )}

      {/* Advance percentage */}
      <GlassCard>
        <div className="p-6">
          <h2 className="font-semibold mb-1" style={{ color: '#0F172A' }}>Advance Percentage</h2>
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            Percentage of the treatment tariff value collected as advance deposit on admission.
          </p>
          <div className="flex items-center gap-3">
            <div className="relative w-32">
              <input
                type="number"
                min={0}
                max={100}
                value={advPct}
                onChange={(e) => setAdvPct(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm border pr-7"
                style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94A3B8' }}>%</span>
            </div>
            <button
              onClick={saveAdvPct}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff' }}
            >
              Save
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Daily bill composition */}
      <GlassCard>
        <div className="p-6">
          <h2 className="font-semibold mb-1" style={{ color: '#0F172A' }}>Daily Bill Composition</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>
            Choose which charges appear in each patient's daily auto-generated bill.
            Toggling a charge off removes it from all subsequent daily bills.
          </p>

          <div className="space-y-4">
            {TOGGLES.map(({ key, label, hint }) => (
              <div key={key} className="flex items-start gap-4">
                <button
                  onClick={() => toggle(key)}
                  disabled={isPending}
                  role="switch"
                  aria-checked={cfg[key]}
                  className="mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative"
                  style={{ background: cfg[key] ? '#0D9488' : '#CBD5E1' }}
                >
                  <span
                    className="block w-4 h-4 rounded-full bg-white shadow transition-transform absolute top-1"
                    style={{ transform: cfg[key] ? 'translateX(20px)' : 'translateX(4px)' }}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{hint}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Admission fee amount */}
          {cfg.charge_admission_fee && (
            <div className="mt-5 pl-14 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>
                  Admission Fee Amount (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={admFeeInput}
                  onChange={(e) => setAdmFeeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm border"
                  style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                />
              </div>
            </div>
          )}

          {/* Service charge */}
          <div className="mt-5">
            <div className="flex items-start gap-4">
              <div className="w-10 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Daily Service Charge</p>
                <p className="text-xs mt-0.5 mb-2" style={{ color: '#94A3B8' }}>
                  Optional flat daily charge (misc. services). Set to 0 to disable.
                </p>
                <div className="relative w-40">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94A3B8' }}>₹</span>
                  <input
                    type="number"
                    min={0}
                    value={svcInput}
                    onChange={(e) => setSvcInput(e.target.value)}
                    className="w-full pl-6 pr-3 py-2 rounded-xl text-sm border"
                    style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={saveAmounts}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff' }}
            >
              Save Amounts
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Custom charge line items */}
      <GlassCard>
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold" style={{ color: '#0F172A' }}>Custom Daily Charges</h2>
            <button
              onClick={() => { setShowAdd(true); setChargeError('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#0D9488', color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> Add Charge
            </button>
          </div>
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            Any active custom charge here is added to every patient&apos;s daily bill automatically.
          </p>

          {chargeError && (
            <div className="p-2 rounded-lg text-xs mb-3" style={{ background: '#FEF2F2', color: '#DC2626' }}>{chargeError}</div>
          )}

          {/* Add form */}
          {showAdd && (
            <div className="mb-4 p-4 rounded-xl border" style={{ background: '#F8FAFC', borderColor: '#E2E8F0' }}>
              <p className="text-xs font-medium mb-2" style={{ color: '#0F172A' }}>New Custom Charge</p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Charge name (e.g. ICU Monitoring)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-sm border"
                  style={{ borderColor: '#CBD5E1', color: '#0F172A', minWidth: '160px' }}
                />
                <div className="relative w-36">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94A3B8' }}>₹</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Amount"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full pl-6 pr-3 py-2 rounded-xl text-sm border"
                    style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                  />
                </div>
                <button onClick={addCharge} disabled={isPending}
                  className="px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ background: '#0D9488', color: '#fff' }}>
                  Save
                </button>
                <button onClick={() => { setShowAdd(false); setNewName(''); setNewAmount('') }}
                  className="px-3 py-2 rounded-xl text-sm"
                  style={{ background: '#F1F5F9', color: '#64748B' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Charges list */}
          {charges.length === 0 && !showAdd ? (
            <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>
              No custom charges yet. Add one to include it in every daily bill.
            </p>
          ) : (
            <div className="space-y-1">
              {charges.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: c.is_active ? 'rgba(13,148,136,0.04)' : '#F8FAFC',
                    border: `1px solid ${c.is_active ? 'rgba(13,148,136,0.15)' : '#E2E8F0'}`,
                    opacity: c.is_active ? 1 : 0.6,
                  }}>
                  {editingId === c.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 rounded-lg border text-sm"
                        style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#94A3B8' }}>₹</span>
                        <input
                          type="number"
                          min={0}
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full pl-5 pr-2 py-1 rounded-lg border text-sm"
                          style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                        />
                      </div>
                      <button onClick={() => saveEdit(c.id)} disabled={isPending}
                        className="p-1.5 rounded-lg" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg" style={{ background: '#F1F5F9', color: '#64748B' }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Active toggle */}
                      <button
                        onClick={() => toggleCharge(c.id, !c.is_active)}
                        disabled={isPending}
                        role="switch"
                        aria-checked={c.is_active}
                        className="flex-shrink-0 w-8 h-5 rounded-full transition-colors relative"
                        style={{ background: c.is_active ? '#0D9488' : '#CBD5E1' }}
                      >
                        <span
                          className="block w-3.5 h-3.5 rounded-full bg-white shadow absolute top-[3px] transition-transform"
                          style={{ transform: c.is_active ? 'translateX(15px)' : 'translateX(3px)' }}
                        />
                      </button>
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: '#0F172A' }}>{c.name}</span>
                      <Money amount={c.amount} className="text-sm flex-shrink-0" style={{ color: '#0D9488' }} />
                      <button onClick={() => startEdit(c)}
                        className="p-1.5 rounded-lg flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}
                        title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeCharge(c.id)} disabled={isPending}
                        className="p-1.5 rounded-lg flex-shrink-0" style={{ color: '#EF4444' }}
                        title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Treatment declaration template */}
      <GlassCard>
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold" style={{ color: '#0F172A' }}>Treatment Declaration</h2>
            {templateSaved && (
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#15803D' }}>
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
          <p className="text-sm mb-4" style={{ color: '#64748B' }}>
            The consent, financial-responsibility and liability text patients sign before any IPD treatment
            can begin. Editing this only affects declarations generated after you save — admissions already
            signed keep the exact wording they were shown.
          </p>
          <textarea
            value={templateInput}
            onChange={(e) => setTemplateInput(e.target.value)}
            rows={14}
            className="w-full px-3 py-2.5 rounded-xl text-sm border font-mono leading-relaxed"
            style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
          />
          <div className="mt-4 flex justify-between items-center">
            <button
              onClick={resetTemplate}
              disabled={isPending}
              className="text-sm font-medium"
              style={{ color: '#64748B' }}
            >
              Reset to default text
            </button>
            <button
              onClick={saveTemplate}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff' }}
            >
              Save Declaration Text
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
