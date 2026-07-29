import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, ArrowRight } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'
import { solutionsByGroup, solutionSlugs, SOLUTIONS } from '@/lib/solutions/registry'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'
const SITE   = 'https://uyirly.com'

export const metadata: Metadata = {
  title: 'Hospital & Clinic Software Solutions | Uyirly',
  description:
    'Explore Uyirly’s hospital and clinic software — hospital management, lab (LIMS), clinic management and EMR/EHR — all on one cloud platform built for India. 30-day free trial.',
  alternates: { canonical: `${SITE}/solutions` },
  openGraph: {
    title: 'Hospital & Clinic Software Solutions | Uyirly',
    description:
      'Hospital management, lab (LIMS), clinic management and EMR/EHR software — one cloud platform built for India.',
    url: `${SITE}/solutions`,
    siteName: 'Uyirly',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Solutions', item: `${SITE}/solutions` },
      ],
    },
    {
      '@type': 'ItemList',
      itemListElement: solutionSlugs().map((slug, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: SOLUTIONS[slug].eyebrow,
        url: `${SITE}/${slug}`,
      })),
    },
  ],
}

export default function SolutionsHub() {
  const groups = solutionsByGroup()

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center flex-wrap gap-1 text-xs mb-6" style={{ color: SLATE4 }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: SLATE5 }}>Solutions</span>
        </nav>

        {/* Header */}
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full mb-3"
          style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>
          Solutions
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight" style={{ color: SLATE9 }}>
          Software for every part of your hospital
        </h1>
        <p className="text-lg leading-relaxed mb-10 max-w-2xl" style={{ color: SLATE5 }}>
          Uyirly runs the whole hospital on one cloud platform — but you can come at it from wherever you are today,
          whether that’s a diagnostic lab, a clinic, your patient records, or the full hospital. Each page below goes
          deep on one part; it’s all the same connected system underneath.
        </p>

        {/* Groups */}
        <div className="space-y-12">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: SLATE5 }}>{group}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {items.map((s) => (
                  <Link key={s.slug} href={`/${s.slug}`}
                    className="group block rounded-2xl p-5 transition-colors hover:border-teal-300"
                    style={{ border: `1px solid ${BORDER}` }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: TEAL }}>{s.eyebrow}</p>
                    <p className="text-base font-bold leading-snug mb-1.5" style={{ color: SLATE9 }}>{s.h1}</p>
                    <p className="text-sm leading-relaxed mb-3" style={{ color: SLATE6 }}>{s.tagline}</p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: TEAL }}>
                      Learn more <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 rounded-2xl p-6 sm:p-8 text-center"
          style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0891B2 100%)' }}>
          <p className="text-lg font-bold text-white mb-1.5">One platform, your whole hospital</p>
          <p className="text-sm text-white/85 mb-5 max-w-md mx-auto">
            OPD, IPD, pharmacy, lab, billing and staff scheduling in one system. 30-day free trial, no credit card.
          </p>
          <Link href="/signup"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#fff', color: TEAL }}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Cross-link to guides */}
        <p className="mt-10 text-sm text-center" style={{ color: SLATE5 }}>
          Want the how-to detail instead? Read the <Link href="/guides" className="font-semibold hover:underline" style={{ color: TEAL }}>guides</Link>.
        </p>
      </main>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mb-4" style={{ color: SLATE5 }}>
          <Link href="/solutions" className="hover:underline">Solutions</Link>
          <Link href="/guides" className="hover:underline">Guides</Link>
          <Link href="/pricing" className="hover:underline">Pricing</Link>
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/security" className="hover:underline">Security</Link>
        </div>
        <p className="text-xs" style={{ color: SLATE4 }}>© {new Date().getFullYear()} Uyirly. Made in India.</p>
      </footer>
    </div>
  )
}
