import { Info, AlertTriangle, Lightbulb } from 'lucide-react'
import type { ReactNode } from 'react'

const TONES = {
  tip:     { bg: '#F0FDFA', border: '#99F6E4', color: '#0F766E', Icon: Lightbulb },
  info:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', Icon: Info },
  warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', Icon: AlertTriangle },
} as const

export default function CalloutBox({ tone = 'info', title, children }: { tone?: keyof typeof TONES; title?: string; children: ReactNode }) {
  const t = TONES[tone]
  const Icon = t.Icon
  return (
    <div className="not-prose my-5 flex gap-3 rounded-xl p-4" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: t.color }} />
      <div className="text-sm" style={{ color: t.color }}>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  )
}
