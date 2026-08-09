'use client'

import { useState } from 'react'
import { Landmark, IndianRupee, CheckCircle2 } from 'lucide-react'
import { updatePartnerBankDetails } from '@/app/actions/partnerAuth'
import type { PartnerPayoutDetails } from '@/app/actions/partnerAuth'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'
const inputStyle = { background: '#F8FAFC', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' } as const

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
    </div>
  )
}

export default function PartnerBankDetails({ owed, paid, payout }: { owed: number; paid: number; payout: PartnerPayoutDetails }) {
  const [f, setF] = useState({
    bank_account_name: payout.bank_account_name ?? '',
    bank_account_number: payout.bank_account_number ?? '',
    bank_ifsc: payout.bank_ifsc ?? '',
    upi_id: payout.upi_id ?? '',
    pan_number: payout.pan_number ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (v: string) => { setF(s => ({ ...s, [k]: v })); setSaved(false) }

  async function save() {
    setSaving(true); setError(null)
    const res = await updatePartnerBankDetails(f)
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="mt-5 space-y-5">
      {/* Earnings breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="flex items-center gap-1.5 mb-1"><IndianRupee className="w-4 h-4" style={{ color: '#B45309' }} /><span className="text-xs" style={{ color: SLATE6 }}>To be paid</span></div>
          <p className="text-2xl font-bold" style={{ color: '#B45309' }}>₹{owed.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-1.5 mb-1"><IndianRupee className="w-4 h-4" style={{ color: '#15803D' }} /><span className="text-xs" style={{ color: SLATE6 }}>Paid to date</span></div>
          <p className="text-2xl font-bold" style={{ color: '#15803D' }}>₹{paid.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Bank / payout details */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-4 h-4" style={{ color: TEAL }} />
          <h3 className="text-sm font-semibold" style={{ color: SLATE9 }}>Payout details</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: SLATE4 }}>Where we send your commission. Keep these accurate — payouts go to this account.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Account holder name" value={f.bank_account_name} onChange={set('bank_account_name')} placeholder="As per bank records" />
          <Field label="Account number" value={f.bank_account_number} onChange={set('bank_account_number')} placeholder="e.g. 001234567890" />
          <Field label="IFSC code" value={f.bank_ifsc} onChange={set('bank_ifsc')} placeholder="e.g. HDFC0001234" />
          <Field label="UPI ID (optional)" value={f.upi_id} onChange={set('upi_id')} placeholder="name@bank" />
          <Field label="PAN (for TDS)" value={f.pan_number} onChange={set('pan_number')} placeholder="ABCDE1234F" />
        </div>

        {error && <div className="text-sm rounded-xl px-3 py-2 mt-3" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex items-center gap-3 mt-4">
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: saving ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save payout details'}
          </button>
          {saved && <span className="flex items-center gap-1.5 text-sm" style={{ color: '#15803D' }}><CheckCircle2 className="w-4 h-4" /> Saved</span>}
        </div>
        <p className="text-xs mt-3" style={{ color: SLATE4 }}>A PAN is required for cash payouts (TDS under Sec 194H). Your details are private and used only for payouts.</p>
      </div>
    </div>
  )
}
