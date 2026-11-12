'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { addEmergencyCharge, listEmergencyCharges, removeEmergencyCharge, type ErChargeLine } from '@/app/actions/emergency'
import type { EmergencyCase, ProcedureTariff } from '@/lib/types'

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ER charges for one case: the registration fee and consultation raised
// automatically, plus procedures added here (from Settings → Tariffs → Emergency,
// or a one-off charge). Everything lands on the case's ER bill and moves onto the
// IPD bill if the patient is admitted.
export default function ErChargesModal({ ec, erTariffs, readOnly, onClose }: {
  ec: EmergencyCase; erTariffs: ProcedureTariff[]; readOnly: boolean; onClose: () => void
}) {
  const [lines, setLines] = useState<ErChargeLine[] | null>(null)
  const [tariffId, setTariffId] = useState('')
  const [custom, setCustom] = useState({ description: '', amount: '' })
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => setLines(await listEmergencyCharges(ec.id)), [ec.id])
  useEffect(() => {
    let active = true
    listEmergencyCharges(ec.id).then((l) => { if (active) setLines(l) })
    return () => { active = false }
  }, [ec.id])

  async function add() {
    setBusy(true); setError(null)
    // A refused call threw and left the button on "Adding…" for good (BUG-031).
    const r = await addEmergencyCharge(tariffId === 'custom'
      ? { caseId: ec.id, description: custom.description, unitPrice: Number(custom.amount), qty: Number(qty) }
      : { caseId: ec.id, tariffId, qty: Number(qty) })
      .catch(() => ({ success: false as const, error: 'Could not add the charge — you may not have billing access. Ask an admin.' }))
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setTariffId(''); setCustom({ description: '', amount: '' }); setQty('1')
    await load()
  }

  async function remove(itemId: string) {
    setRemoving(itemId); setError(null)
    const r = await removeEmergencyCharge(ec.id, itemId)
      .catch(() => ({ success: false as const, error: 'Could not remove the charge — you may not have billing access.' }))
    setRemoving(null)
    if (!r.success) { setError(r.error); return }
    await load()
  }

  const total = (lines ?? []).reduce((s, l) => s + Number(l.amount), 0)
  const canAdd = tariffId && (tariffId !== 'custom' || (custom.description.trim() && Number(custom.amount) > 0)) && Number(qty) >= 1

  return (
    <Modal open onClose={onClose} title={`ER charges — ${ec.patient?.full_name ?? ''}`} maxWidth="34rem">
      <div className="space-y-4">
        {lines === null ? (
          <p className="text-sm flex items-center gap-2" style={{ color: '#64748B' }}><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : lines.length === 0 ? (
          <p className="text-sm" style={{ color: '#94A3B8' }}>No charges billed on this case yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ color: '#0F172A' }}>{l.description}{l.qty > 1 ? ` × ${l.qty}` : ''}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{l.bill_no} · {l.bill_status}</p>
                </div>
                <span className="font-semibold tabular-nums" style={{ color: '#0F172A' }}>{inr(l.amount)}</span>
                {l.removable && !readOnly ? (
                  <button onClick={() => remove(l.id)} disabled={removing === l.id} aria-label={`Remove ${l.description}`}
                    className="p-1.5 rounded-lg" style={{ color: '#DC2626', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    {removing === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                ) : <span style={{ width: 28 }} />}
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 text-sm font-semibold" style={{ background: '#F8FAFC' }}>
              <span>Total</span><span className="tabular-nums">{inr(total)}</span>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="space-y-2 pt-1" style={{ borderTop: '1px solid #F1F5F9' }}>
            <p className="text-xs font-semibold uppercase tracking-wide pt-3" style={{ color: '#64748B' }}>Add a charge</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
                  <option value="">Select procedure / service…</option>
                  {erTariffs.map((t) => <option key={t.id} value={t.id}>{t.name} — {inr(t.default_price)}</option>)}
                  <option value="custom">Other (enter description and amount)</option>
                </Select>
              </div>
              <div style={{ width: 80 }}>
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
              </div>
            </div>
            {tariffId === 'custom' && (
              <div className="flex gap-2">
                <div className="flex-1"><Input placeholder="e.g. Nebulisation" value={custom.description} onChange={(e) => setCustom((c) => ({ ...c, description: e.target.value }))} /></div>
                <div style={{ width: 120 }}><Input type="number" min="1" placeholder="Amount ₹" value={custom.amount} onChange={(e) => setCustom((c) => ({ ...c, amount: e.target.value }))} /></div>
              </div>
            )}
            {erTariffs.length === 0 && (
              <p className="text-xs" style={{ color: '#94A3B8' }}>Tip: add your standard ER procedures under Settings → Tariffs with the category &ldquo;Emergency&rdquo;.</p>
            )}
            {error && <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>}
            <div className="flex justify-end">
              <button onClick={add} disabled={!canAdd || busy}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: !canAdd || busy ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: !canAdd || busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Adding…' : 'Add charge'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
