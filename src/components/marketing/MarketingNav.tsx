import Link from 'next/link'
import { Building2 } from 'lucide-react'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const BORDER = '#E2E8F0'

export default function MarketingNav({ ctaLabel = 'Get started' }: { ctaLabel?: string }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50"
      style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${BORDER}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-4 h-4" style={{ color: TEAL }} />
          </div>
          <span className="text-base font-bold" style={{ color: SLATE9 }}>Uyirly</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/solutions" className="hidden sm:inline text-sm font-medium" style={{ color: '#475569' }}>Solutions</Link>
          <Link href="/guides" className="hidden sm:inline text-sm font-medium" style={{ color: '#475569' }}>Guides</Link>
          <Link href="/pricing" className="hidden sm:inline text-sm font-medium" style={{ color: '#475569' }}>Pricing</Link>
          <Link href="/signup"
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: TEAL, color: '#fff' }}>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </header>
  )
}
