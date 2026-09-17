'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { setErRegistrationFee } from '@/app/actions/emergency'

export default function ErFeeCard({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    const r = await setErRegistrationFee(parseFloat(value) || 0)
    setSaving(false)
    if (!r.success) { setError(r.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <GlassCard className="p-6 mt-6">
      <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Emergency charges</p>
      <p className="text-xs mb-4" style={{ color: '#64748B' }}>
        Registration fee billed automatically when an emergency case is registered (0 = no fee). Add ER procedures
        (dressing, nebulisation, ECG…) as tariffs above with the category &ldquo;Emergency&rdquo; — staff pick them from
        the case&apos;s Charges button.
      </p>
      {error && <div className="mb-3 px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>}
      <div className="flex items-center gap-3" style={{ maxWidth: '360px' }}>
        <span className="text-sm flex-1" style={{ color: '#475569' }}>ER registration fee</span>
        <span className="text-sm" style={{ color: '#94A3B8' }}>₹</span>
        <div style={{ width: '110px' }}>
          <Input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button onClick={save} disabled={saving}
          className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: 'none', cursor: 'pointer', minWidth: '64px' }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : saved ? <><Check className="w-3.5 h-3.5 inline" /> Saved</> : 'Save'}
        </button>
      </div>
    </GlassCard>
  )
}
