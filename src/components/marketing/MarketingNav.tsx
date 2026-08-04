import Link from 'next/link'
import { Building2 } from 'lucide-react'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'

// The single header shared by every marketing / public page (solutions, guides,
// pricing, legal). Home has its own landing header (anchor nav + patient/staff
// login) but uses the same logo + CTA so the brand stays consistent.
// Styling comes from `.landing-nav` (solid on mobile, glassy blur at md+) — a
// translucent backdrop-filter bar lags while scrolling on mobile.
export default function MarketingNav({ ctaLabel = 'Start free trial' }: { ctaLabel?: string }) {
  return (
    <header className="landing-nav fixed top-0 left-0 right-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: TEAL }}>
            <Building2 className="w-4 h-4" style={{ color: '#fff' }} />
          </div>
          <span className="text-base font-bold" style={{ color: SLATE9 }}>Uyirly</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/solutions" className="hidden sm:inline text-sm font-medium" style={{ color: SLATE6 }}>Solutions</Link>
          <Link href="/guides" className="hidden sm:inline text-sm font-medium" style={{ color: SLATE6 }}>Guides</Link>
          <Link href="/pricing" className="hidden sm:inline text-sm font-medium" style={{ color: SLATE6 }}>Pricing</Link>
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
