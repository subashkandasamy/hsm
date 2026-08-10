'use client'

import { useState } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { setMessagingEnabled } from '@/app/actions/platform'

export default function MessagingToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    const next = !enabled
    const res = await setMessagingEnabled(next)
    setBusy(false)
    if (res.success) setEnabled(next)
  }

  return (
    <div className="rounded-xl p-4 mb-8 flex items-center gap-3"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <MessageSquare className="w-5 h-5 shrink-0" style={{ color: enabled ? '#34D399' : '#64748B' }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>WhatsApp / SMS messaging</p>
        <p className="text-xs" style={{ color: '#64748B' }}>
          {enabled ? 'Enabled — patients/staff see messaging features.' : 'Disabled globally — all WhatsApp/SMS controls are hidden.'}
        </p>
      </div>
      <button onClick={toggle} disabled={busy}
        className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: enabled ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)', color: enabled ? '#34D399' : '#94A3B8', border: '1px solid rgba(255,255,255,0.1)', cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {enabled ? 'Turn OFF' : 'Turn ON'}
      </button>
    </div>
  )
}
