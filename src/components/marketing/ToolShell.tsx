import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { ChevronRight, ArrowRight } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'
import type { ToolMeta } from '@/lib/tools/registry'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'
const SITE = 'https://www.uyirly.com'

// Inline markup: [label](/href) internal link + **bold**.
function renderRich(text: string): ReactNode {
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g
  const out: ReactNode[] = []
  let last = 0, key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    if (m[1] && m[2]) out.push(<Link key={key++} href={m[2]} className="font-medium underline underline-offset-2" style={{ color: TEAL }}>{m[1]}</Link>)
    else if (m[3]) out.push(<strong key={key++} style={{ color: SLATE9 }}>{m[3]}</strong>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return out
}

function jsonLd(meta: ToolMeta) {
  const url = `${SITE}/tools/${meta.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/tools` },
          { '@type': 'ListItem', position: 3, name: meta.eyebrow === 'Free Tool' ? meta.h1 : meta.eyebrow, item: url },
        ],
      },
      {
        '@type': 'WebApplication',
        name: meta.metaTitle,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        publisher: { '@type': 'Organization', name: 'Uyirly', url: SITE },
      },
      {
        '@type': 'FAQPage',
        mainEntity: meta.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  }
}

export default function ToolShell({ meta, children }: { meta: ToolMeta; children: ReactNode }) {
  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(meta)) }} />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center flex-wrap gap-1 text-xs mb-6" style={{ color: SLATE4 }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/tools" className="hover:underline">Tools</Link>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: SLATE5 }}>{meta.h1}</span>
        </nav>

        {/* Hero */}
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full mb-3"
          style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>{meta.eyebrow}</span>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight" style={{ color: SLATE9 }}>{meta.h1}</h1>
        <p className="text-lg leading-relaxed mb-8" style={{ color: SLATE5 }}>{renderRich(meta.intro)}</p>

        {/* The interactive tool */}
        {children}

        {/* How to use */}
        <section className="mt-12">
          <h2 className="text-xl font-bold mb-4" style={{ color: SLATE9 }}>How to use it</h2>
          <ol className="space-y-4">
            {meta.howTo.map((s, i) => (
              <li key={i} className="flex gap-3.5">
                <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: SLATE9 }}>{s.title}</p>
                  <p className="text-sm leading-relaxed mt-0.5" style={{ color: SLATE6 }}>{renderRich(s.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        {meta.faqs.length > 0 && (
          <section className="mt-12 pt-8" style={{ borderTop: `1px solid ${BORDER}` }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: SLATE9 }}>Frequently asked questions</h2>
            <div className="space-y-4">
              {meta.faqs.map((f, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold mb-1" style={{ color: SLATE9 }}>{f.q}</p>
                  <p className="text-sm leading-relaxed" style={{ color: SLATE6 }}>{renderRich(f.a)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-12 rounded-2xl p-6 sm:p-8 text-center" style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0891B2 100%)' }}>
          <p className="text-lg font-bold text-white mb-1.5">Stop making bills by hand</p>
          <p className="text-sm text-white/85 mb-5 max-w-md mx-auto">
            Uyirly builds every bill automatically as care happens — OPD, IPD, pharmacy and lab on one platform. 30-day free trial, no credit card.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#fff', color: TEAL }}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Related */}
        {meta.related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold mb-4" style={{ color: SLATE9 }}>Related</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {meta.related.map((r) => (
                <Link key={r.href} href={r.href} className="block rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
                  <p className="text-sm font-semibold leading-snug" style={{ color: SLATE9 }}>{r.label}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mb-4" style={{ color: SLATE5 }}>
          <Link href="/tools" className="hover:underline">Tools</Link>
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
