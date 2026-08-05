import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, ArrowRight, Wrench } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'
import { TOOLS, toolSlugs } from '@/lib/tools/registry'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'
const SITE = 'https://www.uyirly.com'

export const metadata: Metadata = {
  title: 'Free Hospital Tools — Bill Format, Calculators | Uyirly',
  description:
    'Free tools for Indian hospitals and clinics — a hospital bill format generator and more. No sign-up. Built by Uyirly, all-in-one hospital management software.',
  alternates: { canonical: `${SITE}/tools` },
  openGraph: { url: `${SITE}/tools`, title: 'Free Hospital Tools — Uyirly', description: 'Free tools for Indian hospitals and clinics. No sign-up.' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/tools` },
    ] },
    { '@type': 'ItemList', itemListElement: toolSlugs().map((slug, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE}/tools/${slug}`, name: TOOLS[slug].metaTitle,
    })) },
  ],
}

export default function ToolsHub() {
  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <nav className="flex items-center gap-1 text-xs mb-6" style={{ color: SLATE4 }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: SLATE5 }}>Tools</span>
        </nav>

        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full mb-3"
          style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>Free Tools</span>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight" style={{ color: SLATE9 }}>Free tools for hospitals &amp; clinics</h1>
        <p className="text-lg leading-relaxed mb-10" style={{ color: SLATE5 }}>
          Handy, free tools for Indian hospitals and clinics — no sign-up needed. Built by the team behind{' '}
          <Link href="/hospital-management-software" className="font-medium underline underline-offset-2" style={{ color: TEAL }}>Uyirly</Link>,
          all-in-one hospital management software.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {toolSlugs().map((slug) => {
            const t = TOOLS[slug]
            return (
              <Link key={slug} href={`/tools/${slug}`} className="block rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}>
                  <Wrench className="w-4 h-4" style={{ color: TEAL }} />
                </div>
                <p className="text-base font-semibold mb-1" style={{ color: SLATE9 }}>{t.h1}</p>
                <p className="text-sm leading-relaxed mb-3" style={{ color: SLATE6 }}>{t.tagline}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: TEAL }}>Open tool <ArrowRight className="w-3.5 h-3.5" /></span>
              </Link>
            )
          })}
        </div>
      </main>

      <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mb-4" style={{ color: SLATE5 }}>
          <Link href="/solutions" className="hover:underline">Solutions</Link>
          <Link href="/guides" className="hover:underline">Guides</Link>
          <Link href="/pricing" className="hover:underline">Pricing</Link>
          <a href="https://www.linkedin.com/company/uyirly" target="_blank" rel="noopener noreferrer" className="hover:underline">LinkedIn</a>
          <a href="https://www.facebook.com/uyirly" target="_blank" rel="noopener noreferrer" className="hover:underline">Facebook</a>
        </div>
        <p className="text-xs" style={{ color: SLATE4 }}>© {new Date().getFullYear()} Uyirly. Made in India.</p>
      </footer>
    </div>
  )
}
