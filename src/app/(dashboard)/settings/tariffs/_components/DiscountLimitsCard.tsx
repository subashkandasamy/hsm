'use client'

import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { setDiscountLimit } from '@/app/actions/discounts'
import type { DiscountLimitRow } from '@/lib/types'

const ROLE_LABELS: Record<string, string> = { accountant: 'Accountant', receptionist: 'Receptionist' }

export default function DiscountLimitsCard({ initial }: { initial: DiscountLimitRow[] }) {
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, value: String(r.max_percent) })))
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [savedRole, setSavedRole] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(role: string, value: string) {
    setSavingRole(role); setError(null); setSavedRole(null)
    const res = await setDiscountLimit(role, parseFloat(value) || 0)
    setSavingRole(null)
    if (!res.success) { setError(res.error); return }
    setSavedRole(role)
    setTimeout(() => setSavedRole(null), 2000)
  }

  return (
    <GlassCard className="p-6 mt-6">
      <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Discount Limits</p>
      <p className="text-xs mb-4" style={{ color: '#64748B' }}>
        Maximum discount % each role can apply on a bill without approval. Anything higher goes to an admin for approval. Admins have no limit.
      </p>
      {error && <div className="mb-3 px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>}
      <div className="space-y-3" style={{ maxWidth: '360px' }}>
        {rows.map((r, i) => (
          <div key={r.role} className="flex items-center gap-3">
            <span className="text-sm flex-1" style={{ color: '#475569' }}>{ROLE_LABELS[r.role] ?? r.role}</span>
            <div style={{ width: '110px' }}>
              <Input type="number" min="0" max="100" value={r.value}
                onChange={(e) => setRows((rs) => rs.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x))} />
            </div>
            <span className="text-sm" style={{ color: '#94A3B8' }}>%</span>
            <button onClick={() => save(r.role, r.value)} disabled={savingRole === r.role}
              className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer', minWidth: '64px' }}>
              {savingRole === r.role ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : savedRole === r.role ? <><Check className="w-3.5 h-3.5 inline" /> Saved</> : 'Save'}
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
