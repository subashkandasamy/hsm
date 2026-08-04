import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { Check, ChevronRight, ArrowRight } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'
import AppPreview from '@/components/marketing/AppPreview'
import type { SolutionMeta } from '@/lib/solutions/registry'

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

const SITE = 'https://www.uyirly.com'

// Parse simple inline markup in body text: [label](/href) → internal link
// (keyword anchor, good for SEO) and **bold** → emphasis. Plain text otherwise.
function renderRich(text: string): ReactNode {
  const tokenRe = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    if (m[1] && m[2]) {
      out.push(
        <Link key={key++} href={m[2]} className="font-medium underline underline-offset-2" style={{ color: TEAL }}>
          {m[1]}
        </Link>
      )
    } else if (m[3]) {
      out.push(<strong key={key++} style={{ color: SLATE9 }}>{m[3]}</strong>)
    }
    last = tokenRe.lastIndex
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return out
}

function jsonLd(meta: SolutionMeta) {
  const url = `${SITE}/${meta.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
          { '@type': 'ListItem', position: 2, name: meta.eyebrow, item: url },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Uyirly',
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Web, iOS, Android',
        description: meta.description,
        url,
        offers: {
          '@type': 'Offer',
          price: '2999',
          priceCurrency: 'INR',
          description: '30-day free trial, then flat monthly pricing',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Uyirly',
          url: SITE,
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: meta.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }
}

export default function SolutionShell({ meta }: { meta: SolutionMeta }) {
  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(meta)) }}
      />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center flex-wrap gap-1 text-xs mb-6" style={{ color: SLATE4 }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: SLATE5 }}>{meta.eyebrow}</span>
        </nav>

        {/* Hero */}
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full mb-3"
          style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>
          {meta.eyebrow}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight" style={{ color: SLATE9 }}>{meta.h1}</h1>
        <p className="text-lg leading-relaxed mb-6" style={{ color: SLATE5 }}>{meta.subhead}</p>

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Link href="/signup"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: TEAL, color: '#fff' }}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/pricing"
            className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ border: `1px solid ${BORDER}`, color: SLATE6 }}>
            See pricing
          </Link>
        </div>

        {/* Hero value props */}
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-12 pb-10" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {meta.heroBullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: SLATE6 }}>
              <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: TEAL }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {/* Sections */}
        <div className="space-y-10">
          {meta.sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-2xl font-bold mb-3 leading-snug" style={{ color: SLATE9 }}>{s.h2}</h2>
              <p className="text-base leading-relaxed" style={{ color: SLATE6 }}>{renderRich(s.body)}</p>

              {s.preview && <AppPreview variant={s.preview} />}

              {s.bullets && s.bullets.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm" style={{ color: SLATE6 }}>
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: TEAL }} />
                      <span>{renderRich(b)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* H3 subsections */}
              {s.subsections && s.subsections.map((sub, j) => (
                <div key={j} className="mt-6">
                  <h3 className="text-lg font-semibold mb-2" style={{ color: SLATE9 }}>{sub.h3}</h3>
                  <p className="text-base leading-relaxed" style={{ color: SLATE6 }}>{renderRich(sub.body)}</p>
                  {sub.bullets && sub.bullets.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {sub.bullets.map((b, k) => (
                        <li key={k} className="flex items-start gap-2 text-sm" style={{ color: SLATE6 }}>
                          <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: TEAL }} />
                          <span>{renderRich(b)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {/* Numbered how-to steps */}
              {s.steps && s.steps.length > 0 && (
                <ol className="mt-5 space-y-4">
                  {s.steps.map((st, j) => (
                    <li key={j} className="flex gap-3.5">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>{j + 1}</span>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: SLATE9 }}>{st.title}</p>
                        <p className="text-sm leading-relaxed mt-0.5" style={{ color: SLATE6 }}>{renderRich(st.body)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {/* Comparison / feature table */}
              {s.table && (
                <div className="mt-5 overflow-x-auto rounded-xl" style={{ border: `1px solid ${BORDER}` }}>
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {s.table.headers.map((h, j) => (
                          <th key={j} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap"
                            style={{ color: SLATE9, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((row, j) => (
                        <tr key={j}>
                          {row.map((cell, k) => (
                            <td key={k} className="px-3 py-2.5 align-top"
                              style={{ color: k === 0 ? SLATE9 : SLATE6, fontWeight: k === 0 ? 600 : 400, borderBottom: j < s.table!.rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                              {renderRich(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>

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
        <div className="mt-12 rounded-2xl p-6 sm:p-8 text-center"
          style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0891B2 100%)' }}>
          <p className="text-lg font-bold text-white mb-1.5">See it in your own hospital</p>
          <p className="text-sm text-white/85 mb-5 max-w-md mx-auto">
            Uyirly runs OPD, IPD, pharmacy, lab, billing and staff scheduling in one platform. 30-day free trial, no credit card.
          </p>
          <Link href="/signup"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#fff', color: TEAL }}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Related */}
        {meta.related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold mb-4" style={{ color: SLATE9 }}>Related</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {meta.related.map((r) => (
                <Link key={r.href} href={r.href}
                  className="block rounded-xl p-4 transition-colors hover:border-teal-300"
                  style={{ border: `1px solid ${BORDER}` }}>
                  <p className="text-sm font-semibold leading-snug" style={{ color: SLATE9 }}>{r.label}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
        {/* Disclaimer (e.g. trademark/neutrality on comparison pages) */}
        {meta.disclaimer && (
          <p className="mt-10 text-xs leading-relaxed" style={{ color: SLATE4 }}>{meta.disclaimer}</p>
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
          <a href="https://www.linkedin.com/company/uyirly" target="_blank" rel="noopener noreferrer" className="hover:underline">LinkedIn</a>
          <a href="https://www.facebook.com/profile.php?id=61592842021170" target="_blank" rel="noopener noreferrer" className="hover:underline">Facebook</a>
        </div>
        <p className="text-xs" style={{ color: SLATE4 }}>© {new Date().getFullYear()} Uyirly. Made in India.</p>
      </footer>
    </div>
  )
}
