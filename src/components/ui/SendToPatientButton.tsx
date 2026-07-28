'use client'

import { useState } from 'react'
import { Send, Check } from 'lucide-react'

interface Props {
  onSend: (channel: 'whatsapp' | 'sms') => Promise<{ success: boolean; error?: string; fallback?: boolean }>
  label?: string
}

// Small "Send to patient" control — WhatsApp with SMS fallback handled server-side.
export default function SendToPatientButton({ onSend, label = 'Send to patient' }: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function send() {
    setBusy(true); setMsg(null)
    const res = await onSend('whatsapp')
    setBusy(false)
    if (res.success) setMsg({ ok: true, text: res.fallback ? 'Sent via SMS' : 'Sent via WhatsApp' })
    else setMsg({ ok: false, text: res.error ?? 'Failed to send' })
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={send} disabled={busy}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
        style={{ background: 'rgba(37,211,102,0.1)', color: '#128C7E', border: '1px solid rgba(37,211,102,0.3)', cursor: busy ? 'not-allowed' : 'pointer' }}>
        {msg?.ok ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
        {busy ? 'Sending…' : msg?.ok ? msg.text : label}
      </button>
      {msg && !msg.ok && <span className="text-xs" style={{ color: '#DC2626' }}>{msg.text}</span>}
    </div>
  )
}
