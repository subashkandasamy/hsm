import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'
import { GUIDES, TIER_LABELS, type GuideTier } from '@/lib/guides/registry'
import { publishedSlugs } from '@/content/guides'

const SITE = 'https://uyirly.com'
const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE5 = '#64748B'
const BORDER = '#E2E8F0'

export const metadata: Metadata = {
  title: 'Hospital Software Guides — OPD, IPD, Billing, Pharmacy & More | Uyirly',
  description: 'Practical guides on running a hospital with software — OPD queues, IPD billing, nurse rostering, pharmacy, NABH staffing norms, and more. Written for Indian hospital administrators.',
  alternates: { canonical: '/guides' },
  openGraph: {
    url: '/guides',
    title: 'Hospital Software Guides | Uyirly',
    description: 'Practical guides on running a hospital with software — OPD, IPD, billing, pharmacy, nurse rostering and India compliance.',
  },
}

const published = new Set(publishedSlugs())
const TIER_ORDER: GuideTier[] = ['pillar', 'module', 'concept', 'decision']

export default function GuidesHubPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Uyirly Hospital Software Guides',
    url: `${SITE}/guides`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
      ],
    },
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <div className="flex items-center gap-2 mb-3" style={{ color: TEAL }}>
          <BookOpen className="w-5 h-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">Guides</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: SLATE9 }}>Hospital software guides</h1>
        <p className="text-base leading-relaxed max-w-2xl mb-12" style={{ color: SLATE5 }}>
          Practical explainers on running a hospital with software — from OPD queues to nurse rostering
          to NABH staffing norms — written for Indian hospital administrators, not just Uyirly customers.
        </p>

        {TIER_ORDER.map((tier) => {
          const items = GUIDES.filter((g) => g.tier === tier && published.has(g.slug))
          if (items.length === 0) return null
          return (
            <section key={tier} className="mb-12">
              <h2 className="text-lg font-bold mb-4" style={{ color: SLATE9 }}>{TIER_LABELS[tier]}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((g) => (
                  <Link key={g.slug} href={`/guides/${g.slug}`}
                    className="block rounded-2xl p-5 transition-shadow hover:shadow-md"
                    style={{ border: `1px solid ${BORDER}` }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEAL }}>{g.category}</p>
                    <p className="text-base font-semibold leading-snug mb-1.5" style={{ color: SLATE9 }}>{g.title}</p>
                    <p className="text-sm leading-relaxed line-clamp-2" style={{ color: SLATE5 }}>{g.description}</p>
                    <p className="text-xs mt-3" style={{ color: '#CBD5E1' }}>{g.readingMinutes} min read</p>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </main>

      <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mb-4" style={{ color: SLATE5 }}>
          <Link href="/pricing" className="hover:underline">Pricing</Link>
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/security" className="hover:underline">Security</Link>
        </div>
        <p className="text-xs" style={{ color: '#94A3B8' }}>© {new Date().getFullYear()} Uyirly. Made in India.</p>
      </footer>
    </div>
  )
}
