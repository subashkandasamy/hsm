import Link from 'next/link'
import MobileLoginMenu from '@/app/_components/MobileLoginMenu'
import BrandMark from '@/components/ui/BrandMark'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'

// The single header used on EVERY page — home and all marketing/legal pages —
// so the nav is identical everywhere. Links point to real pages only
// (Solutions/Pricing/Guides); Features/Modules are home sections, not routes.
// Styling comes from `.landing-nav` (solid on mobile, glassy blur at md+) — a
// translucent backdrop-filter bar lags while scrolling on mobile.
export default function MarketingNav({ ctaLabel = 'Start free trial' }: { ctaLabel?: string }) {
  return (
    <header className="landing-nav fixed top-0 left-0 right-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="text-base font-bold" style={{ color: SLATE9 }}>Uyirly</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: 'Solutions', href: '/solutions' },
            { label: 'Pricing',   href: '/pricing'   },
            { label: 'Guides',    href: '/guides'    },
          ].map(({ label, href }) => (
            <Link key={label} href={href} className="text-sm font-medium" style={{ color: SLATE6 }}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <a href="https://my.uyirly.com"
            className="hidden sm:inline-flex text-sm font-medium px-2 sm:px-3 py-2 rounded-xl"
            style={{ color: TEAL }}>
            Patient login
          </a>
          <Link href="/find-hospital" className="hidden sm:inline-flex text-sm font-medium px-2 sm:px-3 py-2 rounded-xl"
            style={{ color: SLATE6 }}>
            Sign in
          </Link>
          <MobileLoginMenu />
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: TEAL, color: '#fff', boxShadow: '0 4px 14px rgba(13,148,136,0.3)' }}>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </header>
  )
}
