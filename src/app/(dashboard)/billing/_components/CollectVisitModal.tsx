'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import UpiCollectPanel from './UpiCollectPanel'
import { SOURCE_LABELS } from './BillBuilderModal'
import { recordGroupPayment } from '@/app/actions/billing'
import type { Bill } from '@/lib/types'

type Method = 'cash' | 'card' | 'upi' | 'bank_transfer'

interface Props {
  open: boolean
  onClose: () => void
  /** The visit's unpaid bills — every one is collected in this single payment. */
  bills: Bill[]
  upi: { vpa: string | null; payeeName: string }
  onDone: () => void
}

const balanceOf = (b: Bill) => Math.max(0, Math.round((b.total - b.paid) * 100) / 100)

/**
 * Collect a visit's bills in one payment. The patient pays once; the server
 * spreads it over the bills oldest first (record_encounter_payment). The
 * amount can be lowered for a part payment, which then clears the oldest bills
 * first — the list shows the order it will be applied in.
 */
export default function CollectVisitModal({ open, onClose, bills, upi, onDone }: Props) {
  const ordered = [...bills].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.bill_no.localeCompare(b.bill_no))
  const totalDue = Math.round(ordered.reduce((s, b) => s + balanceOf(b), 0) * 100) / 100

  const [amount, setAmount] = useState(String(totalDue))
  const [method, setMethod] = useState<Method>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<Array<{ bill_no: string; amount: number; status: string }> | null>(null)
  const [isPending, startTransition] = useTransition()

  const amt = Number(amount)
  const amountOk = Number.isFinite(amt) && amt > 0 && amt <= totalDue + 0.001

  function submit() {
    if (!amountOk) { setError(`Enter an amount up to ₹${totalDue.toFixed(2)}`); return }
    setError('')
    startTransition(async () => {
      const res = await recordGroupPayment({
        bill_ids: ordered.map((b) => b.id), amount: amt, method, reference: reference || null,
      })
      if (!res.success) { setError(res.error); return }
      setDone(res.allocated)
    })
  }

  function close() {
    if (done) onDone()
    setDone(null); setError(''); setReference('')
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title={done ? 'Payment recorded' : 'Collect payment for this visit'} maxWidth="30rem"
      footer={done ? (
        <button type="button" onClick={close}
          className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none' }}>
          Done
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={isPending || !amountOk}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: isPending || !amountOk ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
          {isPending ? 'Recording…' : <>Collect <Money amount={amountOk ? amt : 0} /></>}
        </button>
      )}>
      {done ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm" style={{ color: '#059669' }}>
            <CheckCircle2 className="w-4 h-4" /> One payment, recorded against each bill:
          </p>
          <ul className="space-y-1.5">
            {done.map((a) => (
              <li key={a.bill_no} className="flex items-center justify-between text-sm">
                <span style={{ color: '#475569' }}>{a.bill_no}</span>
                <span style={{ color: '#0F172A' }}>
                  <Money amount={a.amount} />{' '}
                  <span className="text-xs" style={{ color: a.status === 'paid' ? '#059669' : '#B45309' }}>
                    {a.status === 'paid' ? 'paid' : 'part paid'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: '#64748B' }}>Bills, in the order the payment is applied</p>
            <ul className="space-y-1.5">
              {ordered.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span style={{ color: '#475569' }}>
                    {b.bill_no} <span className="text-xs" style={{ color: '#94A3B8' }}>· {SOURCE_LABELS[b.bill_source ?? ''] ?? 'Charges'}</span>
                  </span>
                  <span style={{ color: '#0F172A' }}><Money amount={balanceOf(b)} /></span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between mt-2 pt-2 text-sm font-semibold" style={{ borderTop: '1px solid #F1F5F9', color: '#0F172A' }}>
              <span>Total due</span><Money amount={totalDue} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Amount</label>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm border" style={{ borderColor: '#CBD5E1', color: '#0F172A' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Method</label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </Select>
            </div>
          </div>
          {amountOk && amt < totalDue - 0.001 && (
            <p className="text-xs" style={{ color: '#B45309' }}>Part payment — the oldest bills are cleared first.</p>
          )}

          {method === 'upi' && (
            <UpiCollectPanel vpa={upi.vpa} payeeName={upi.payeeName} amount={amountOk ? amt : totalDue} billNo={ordered[0]?.bill_no ?? ''} />
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Reference (optional)</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'upi' ? 'UPI transaction id (UTR)' : method === 'card' ? 'Card slip number' : ''}
              className="w-full px-3 py-2 rounded-xl text-sm border" style={{ borderColor: '#CBD5E1', color: '#0F172A' }} />
          </div>

          {error && <p className="text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
        </div>
      )}
    </Modal>
  )
}
