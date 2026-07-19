'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import {
  listRemittanceBatches, upsertRemittanceBatch, deleteRemittanceBatch,
  listSettledClaimsForReconcile, assignClaimToBatch,
} from '@/app/actions/insurance'
import type { InsuranceRemittanceBatch, InsuranceBankAccount } from '@/lib/types'

interface Props { initialBatches: InsuranceRemittanceBatch[]; bankAccounts: InsuranceBankAccount[]; onClose: () => void }

type SettledClaim = { id: string; patient_name: string; settled_amount: number; settled_at: string | null; remittance_batch_id: string | null; provider: string | null }

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '40px', outline: 'none',
}

export default function RemittanceManagerModal({ initialBatches, bankAccounts, onClose }: Props) {
  const [batches, setBatches] = useState(initialBatches)
  const [claims, setClaims] = useState<SettledClaim[]>([])
  const [tab, setTab] = useState<'batches' | 'reconcile'>('batches')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ref, setRef] = useState('')
  const [insurer, setInsurer] = useState('')
  const [total, setTotal] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [accountId, setAccountId] = useState('')

  useEffect(() => { listSettledClaimsForReconcile().then(setClaims) }, [])

  async function refresh() {
    const [b, c] = await Promise.all([listRemittanceBatches(), listSettledClaimsForReconcile()])
    setBatches(b); setClaims(c)
  }

  async function createBatch() {
    if (!ref.trim() || !(parseFloat(total) >= 0)) return
    setBusy(true); setError(null)
    const res = await upsertRemittanceBatch({
      reference: ref, insurer: insurer || null, total_amount: parseFloat(total),
      received_date: receivedDate || null, account_id: accountId || null,
    })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setRef(''); setInsurer(''); setTotal(''); setReceivedDate(''); setAccountId('')
    await refresh()
  }

  async function removeBatch(id: string) {
    setBusy(true); setError(null)
    const res = await deleteRemittanceBatch(id)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    await refresh()
  }

  async function assign(claimId: string, batchId: string) {
    const res = await assignClaimToBatch(claimId, batchId || null)
    if (!res.success) { setError(res.error); return }
    await refresh()
  }

  return (
    <Modal open onClose={onClose} title="Remittance Reconciliation" maxWidth="40rem">
      <div className="space-y-4">
        <div className="flex gap-1 p-1 rounded-xl w-max" style={{ background: '#F1F5F9' }}>
          {(['batches', 'reconcile'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={tab === t ? { background: '#0D9488', color: '#fff' } : { color: '#64748B' }}>
              {t === 'batches' ? 'Batches' : 'Assign Settled Claims'}
            </button>
          ))}
        </div>

        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        {tab === 'batches' ? (
          <>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {batches.length === 0 && <p className="text-sm" style={{ color: '#94A3B8' }}>No remittance batches yet.</p>}
              {batches.map((b) => {
                const reconciled = b.reconciled_amount ?? 0
                const variance = b.total_amount - reconciled
                const matched = Math.abs(variance) < 0.5
                return (
                  <div key={b.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{b.reference}{b.insurer ? ` · ${b.insurer}` : ''}</p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>
                        {b.claim_count ?? 0} claim{(b.claim_count ?? 0) !== 1 ? 's' : ''} · reconciled <Money amount={reconciled} /> of <Money amount={b.total_amount} />
                        {b.received_date ? <> · <DateText date={b.received_date} /></> : ''}
                      </p>
                    </div>
                    {matched
                      ? <span className="inline-flex items-center gap-1 text-xs shrink-0" style={{ color: '#0D9488' }}><CheckCircle2 className="w-3.5 h-3.5" /> Matched</span>
                      : <span className="inline-flex items-center gap-1 text-xs shrink-0" style={{ color: '#B45309' }}><AlertTriangle className="w-3.5 h-3.5" /> {variance > 0 ? 'Under' : 'Over'} <Money amount={Math.abs(variance)} /></span>}
                    <button onClick={() => removeBatch(b.id)} disabled={busy} className="p-1 rounded shrink-0" style={{ color: '#EF4444' }} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )
              })}
            </div>

            <div className="pt-3 space-y-2" style={{ borderTop: '1px solid #F1F5F9' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>New Batch</p>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Reference / UTR *" value={ref} onChange={(e) => setRef(e.target.value)} className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                <input placeholder="Insurer" value={insurer} onChange={(e) => setInsurer(e.target.value)} className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                <input placeholder="Total received ₹ *" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                {bankAccounts.length > 0 && (
                  <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">— Account —</option>
                    {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </Select>
                )}
              </div>
              <div className="flex justify-end">
                <button onClick={createBatch} disabled={busy || !ref.trim() || !(parseFloat(total) >= 0)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: busy ? '#94A3B8' : '#0D9488', minHeight: '40px' }}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Batch
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {claims.length === 0 && <p className="text-sm" style={{ color: '#94A3B8' }}>No settled claims to reconcile yet.</p>}
            {claims.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{c.patient_name}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{c.provider ?? '—'} · settled <Money amount={c.settled_amount} />{c.settled_at ? <> · <DateText date={c.settled_at} /></> : ''}</p>
                </div>
                <Select value={c.remittance_batch_id ?? ''} onChange={(e) => assign(c.id, e.target.value)} className="w-44">
                  <option value="">— Unreconciled —</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.reference}</option>)}
                </Select>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
