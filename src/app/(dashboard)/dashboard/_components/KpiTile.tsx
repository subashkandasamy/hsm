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
    <div className="glass-card p-3 sm:p-4 md:p-5 h-full flex items-start gap-2.5 transition-all overflow-hidden"
      style={href ? { cursor: 'pointer' } : {}}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: urgent ? 'rgba(220,38,38,0.08)' : `rgba(${hexToRgb(accent)},0.08)`, border: `1px solid ${urgent ? 'rgba(220,38,38,0.15)' : `rgba(${hexToRgb(accent)},0.15)`}` }}>
        <span style={{ color: urgent ? '#DC2626' : accent }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium leading-snug truncate" style={{ color: '#94A3B8' }}>{label}</p>
        <p className="text-lg sm:text-xl md:text-2xl font-bold leading-tight mt-0.5 truncate" style={{ color: urgent ? '#DC2626' : '#0F172A' }}>
          {value}
        </p>
        {sub && (
          <p className="text-[11px] mt-0.5 leading-snug line-clamp-1" style={{ color: '#64748B' }}>{sub}</p>
        )}
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
