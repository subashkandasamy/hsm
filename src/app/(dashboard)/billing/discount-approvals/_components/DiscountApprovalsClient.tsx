'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Percent, Check, X, Loader2 } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import { approveDiscountRequest, rejectDiscountRequest } from '@/app/actions/discounts'
import type { DiscountRequestRow } from '@/lib/types'

export default function DiscountApprovalsClient({ initial }: { initial: DiscountRequestRow[] }) {
  const { profile } = useAuth()
  const canDecide = !!profile?.role && hasPermission(profile.role, 'billing:manage')
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(id: string, approve: boolean) {
    setBusy(id); setError(null)
    const res = approve ? await approveDiscountRequest(id) : await rejectDiscountRequest(id)
    setBusy(null)
    if (!res.success) { setError(res.error); return }
    setRows((r) => r.filter((x) => x.id !== id))
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Discount Approvals" subtitle="Discounts above a staff member's limit, awaiting approval" />

      {error && <div className="mb-4 px-4 py-2.5 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>}

      {rows.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <Percent className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="text-sm font-medium" style={{ color: '#475569' }}>No pending discount approvals</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <GlassCard key={r.id} className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                    {r.patient_name} · <Link href={`/billing/${r.bill_id}`} style={{ color: '#0D9488', fontFamily: 'monospace' }}>{r.bill_no}</Link>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {r.reason} · requested by {r.requested_by_name} · <DateText date={r.created_at} />
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold" style={{ color: '#0F172A' }}>{r.requested_pct}%</p>
                  <p className="text-xs" style={{ color: '#64748B' }}><Money amount={r.requested_amount} /></p>
                </div>
                {canDecide && (
                  <div className="flex gap-2">
                    <button onClick={() => decide(r.id, true)} disabled={busy === r.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#0D9488', border: 'none', cursor: busy === r.id ? 'wait' : 'pointer' }}>
                      {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                    </button>
                    <button onClick={() => decide(r.id, false)} disabled={busy === r.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'transparent', color: '#DC2626', border: '1px solid #FECACA', cursor: busy === r.id ? 'wait' : 'pointer' }}>
                      <X className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  )
}
