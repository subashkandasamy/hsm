import Link from 'next/link'
import MarketingNav from './MarketingNav'

// Design tokens (shared with marketing pages)
const T  = '#0D9488'
const S9 = '#0F172A'
const S6 = '#475569'
const S5 = '#64748B'
const S4 = '#94A3B8'
const S2 = '#E2E8F0'

const PROSE_CSS = `
.legal-prose { color: ${S6}; font-size: 15px; line-height: 1.7; }
.legal-prose h2 { color: ${S9}; font-size: 20px; font-weight: 700; margin: 2.25rem 0 0.75rem; scroll-margin-top: 90px; }
.legal-prose h3 { color: ${S9}; font-size: 16px; font-weight: 600; margin: 1.5rem 0 0.5rem; }
.legal-prose p { margin: 0.75rem 0; }
.legal-prose ul { margin: 0.75rem 0; padding-left: 1.25rem; list-style: disc; }
.legal-prose ol { margin: 0.75rem 0; padding-left: 1.25rem; list-style: decimal; }
.legal-prose li { margin: 0.4rem 0; }
.legal-prose strong { color: ${S9}; font-weight: 600; }
.legal-prose a { color: ${T}; text-decoration: underline; text-underline-offset: 2px; }
.legal-prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 14px; }
.legal-prose th, .legal-prose td { border: 1px solid ${S2}; padding: 8px 12px; text-align: left; vertical-align: top; }
.legal-prose th { background: #F8FAFC; color: ${S9}; font-weight: 600; }
`

interface Props {
  title: string
  lastUpdated: string
  intro?: string
  children: React.ReactNode
}

export default function LegalShell({ title, lastUpdated, intro, children }: Props) {
  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PROSE_CSS }} />

      {/* Nav — shared marketing header (consistent across all pages) */}
      <MarketingNav />

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: S9 }}>{title}</h1>
        <p className="text-sm mb-8" style={{ color: S4 }}>Last updated: {lastUpdated}</p>

        {intro && (
          <p className="text-base mb-8 leading-relaxed" style={{ color: S5 }}>{intro}</p>
        )}

        <article className="legal-prose">{children}</article>

        {/* Legal disclaimer */}
        <div className="mt-12 rounded-xl p-4 text-xs leading-relaxed"
          style={{ background: '#F8FAFC', border: `1px solid ${S2}`, color: S5 }}>
          This document is provided for general informational purposes. For questions about how it
          applies to your hospital, contact us at{' '}
          <a href="mailto:legal@uyirly.com" style={{ color: T }}>legal@uyirly.com</a>.
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${S2}` }}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mb-4" style={{ color: S5 }}>
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/security" className="hover:underline">Security</Link>
          <Link href="/pricing" className="hover:underline">Pricing</Link>
          <a href="mailto:contact@uyirly.com" className="hover:underline">contact@uyirly.com</a>
        </div>
        <p className="text-xs" style={{ color: S4 }}>© {new Date().getFullYear()} Uyirly. Made in India.</p>
      </footer>
    </div>
  )
}
