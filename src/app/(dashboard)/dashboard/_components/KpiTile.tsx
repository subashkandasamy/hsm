'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

interface KpiTileProps {
  label: string
  value: string | number
  sub?: string
  icon: ReactNode
  href?: string
  accent?: string
  urgent?: boolean
}

export default function KpiTile({ label, value, sub, icon, href, accent = '#0D9488', urgent }: KpiTileProps) {
  const content = (
    <div className="glass-card p-4 md:p-5 flex items-start gap-4 transition-all"
      style={href ? { cursor: 'pointer' } : {}}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: urgent ? 'rgba(220,38,38,0.08)' : `rgba(${hexToRgb(accent)},0.08)`, border: `1px solid ${urgent ? 'rgba(220,38,38,0.15)' : `rgba(${hexToRgb(accent)},0.15)`}` }}>
        <span style={{ color: urgent ? '#DC2626' : accent }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate" style={{ color: '#94A3B8' }}>{label}</p>
        <p className="text-2xl font-bold leading-tight mt-0.5" style={{ color: urgent ? '#DC2626' : '#0F172A' }}>
          {value}
        </p>
        {sub && <p className="text-xs mt-0.5 truncate" style={{ color: '#64748B' }}>{sub}</p>}
      </div>
    </div>
  )

  if (href) return (
    <Link href={href} className="block rounded-2xl"
      onMouseEnter={(e) => { (e.currentTarget.firstChild as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)' }}
      onMouseLeave={(e) => { (e.currentTarget.firstChild as HTMLElement).style.boxShadow = '' }}>
      {content}
    </Link>
  )
  return content
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
