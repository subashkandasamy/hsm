'use client'

import { useState } from 'react'
import { setDirectoryListing } from '@/app/actions/tenantProfile'
import GlassCard from '@/components/ui/GlassCard'

export default function DirectoryListingCard({
  initial,
}: {
  initial: { listed: boolean; city: string | null }
}) {
  const [listed, setListed] = useState(initial.listed)
  const [city, setCity] = useState(initial.city ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setSaving(true)
    setMsg(null)
    const res = await setDirectoryListing({ listed, city: city.trim() || null })
    setSaving(false)
    setMsg(res.success ? { ok: true, text: 'Directory settings saved.' } : { ok: false, text: res.error })
  }

  return (
    <GlassCard className="p-6">
      <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Patient App Directory</p>
      <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
        List your hospital on the Uyirly patient app (my.uyirly.com) so patients can find you, register
        themselves, and book an OPD appointment. You still confirm every self-registered patient at the front desk.
      </p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => { setListed(e.target.checked); setMsg(null) }}
          style={{ width: 18, height: 18, marginTop: 1, accentColor: '#0D9488', cursor: 'pointer' }}
        />
        <span>
          <span className="text-sm font-medium" style={{ color: '#0F172A' }}>List this hospital in the patient app</span>
          <span className="block text-xs" style={{ color: '#94A3B8' }}>Patients can discover and book with you online</span>
        </span>
      </label>

      <div style={{ maxWidth: 320 }}>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>City (shown on your listing)</label>
        <input
          type="text"
          value={city}
          placeholder="e.g. Coimbatore"
          onChange={(e) => { setCity(e.target.value); setMsg(null) }}
          className="w-full px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}>
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && (
          <span className="text-sm" style={{ color: msg.ok ? '#10B981' : '#DC2626' }}>{msg.text}</span>
        )}
      </div>
    </GlassCard>
  )
}
