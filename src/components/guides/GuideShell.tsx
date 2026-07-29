import Link from 'next/link'
import { Clock, ChevronRight, ArrowRight } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'
import type { GuideMeta } from '@/lib/guides/registry'
import { relatedGuides } from '@/lib/guides/registry'
import { publishedSlugs } from '@/content/guides'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

const PROSE_CSS = `
.guide-prose { color: ${SLATE6}; font-size: 16px; line-height: 1.75; }
.guide-prose h2 { color: ${SLATE9}; font-size: 22px; font-weight: 700; margin: 2.5rem 0 0.9rem; scroll-margin-top: 90px; }
.guide-prose h3 { color: ${SLATE9}; font-size: 17px; font-weight: 600; margin: 1.75rem 0 0.6rem; }
.guide-prose p { margin: 0.9rem 0; }
.guide-prose ul { margin: 0.9rem 0; padding-left: 1.4rem; list-style: disc; }
.guide-prose ol { margin: 0.9rem 0; padding-left: 1.4rem; list-style: decimal; }
.guide-prose li { margin: 0.4rem 0; }
.guide-prose li::marker { color: ${TEAL}; }
.guide-prose strong { color: ${SLATE9}; font-weight: 600; }
.guide-prose a { color: ${TEAL}; text-decoration: underline; text-underline-offset: 2px; }
.guide-prose table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 14px; }
.guide-prose th, .guide-prose td { border: 1px solid ${BORDER}; padding: 9px 12px; text-align: left; vertical-align: top; }
.guide-prose th { background: #F8FAFC; color: ${SLATE9}; font-weight: 600; }
.guide-prose blockquote { border-left: 3px solid ${TEAL}; padding-left: 1rem; margin: 1.25rem 0; color: ${SLATE5}; font-style: italic; }
`

interface Props {
  meta: GuideMeta
  children: React.ReactNode
  faqs?: { q: string; a: string }[]
}

export default function GuideShell({ meta, children, faqs }: Props) {
  const published = new Set(publishedSlugs())
  const related = relatedGuides(meta.slug).filter((g) => published.has(g.slug))

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PROSE_CSS }} />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center flex-wrap gap-1 text-xs mb-6" style={{ color: SLATE4 }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/guides" className="hover:underline">Guides</Link>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: SLATE5 }}>{meta.category}</span>
        </nav>

        {/* Header */}
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full mb-3"
          style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>
          {meta.category}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight" style={{ color: SLATE9 }}>{meta.title}</h1>
        <p className="text-base leading-relaxed mb-5" style={{ color: SLATE5 }}>{meta.description}</p>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)', color: TEAL }}>
            SK
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: SLATE9 }}>Subash Kandasamy</p>
            <p className="text-xs" style={{ color: SLATE4 }}>Founder, Uyirly</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs mb-10 pb-6" style={{ color: SLATE4, borderBottom: `1px solid ${BORDER}` }}>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {meta.readingMinutes} min read</span>
          <span>Updated {new Date(meta.updated + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>

        {/* Body */}
        <article className="guide-prose">{children}</article>

        {/* FAQ (also feeds FAQPage JSON-LD from the page component) */}
        {faqs && faqs.length > 0 && (
          <section className="mt-12 pt-8" style={{ borderTop: `1px solid ${BORDER}` }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: SLATE9 }}>Frequently asked questions</h2>
            <div className="space-y-4">
              {faqs.map((f, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold mb-1" style={{ color: SLATE9 }}>{f.q}</p>
                  <p className="text-sm leading-relaxed" style={{ color: SLATE6 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-12 rounded-2xl p-6 sm:p-8 text-center"
          style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0891B2 100%)' }}>
          <p className="text-lg font-bold text-white mb-1.5">See this in your own hospital</p>
          <p className="text-sm text-white/85 mb-5 max-w-md mx-auto">
            Uyirly runs OPD, IPD, pharmacy, lab, billing and staff scheduling in one platform. 30-day free trial, no credit card.
          </p>
          <Link href="/signup"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#fff', color: TEAL }}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Related guides */}
        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold mb-4" style={{ color: SLATE9 }}>Related guides</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {related.map((r) => (
                <Link key={r.slug} href={`/guides/${r.slug}`}
                  className="block rounded-xl p-4 transition-colors hover:border-teal-300"
                  style={{ border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: TEAL }}>{r.category}</p>
                  <p className="text-sm font-semibold leading-snug" style={{ color: SLATE9 }}>{r.title}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mb-4" style={{ color: SLATE5 }}>
          <Link href="/solutions" className="hover:underline">Solutions</Link>
          <Link href="/guides" className="hover:underline">All Guides</Link>
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
