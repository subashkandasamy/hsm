import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Hospital not found — Uyirly',
  robots: { index: false, follow: false },
}
import { Building2, ArrowRight } from 'lucide-react'

export default function TenantNotFoundPage() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
          <Building2 className="w-8 h-8" style={{ color: '#0D9488' }} />
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: '#0F172A' }}>
          Hospital not found
        </h1>
        <p className="text-sm mb-8" style={{ color: '#64748B' }}>
          The hospital you&apos;re looking for doesn&apos;t exist on Uyirly,
          or the subdomain may have changed.
        </p>

        <div className="glass-card p-6 mb-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#94A3B8' }}>
            What to try
          </p>
          <ul className="space-y-2 text-sm" style={{ color: '#475569' }}>
            <li>• Double-check the URL spelling</li>
            <li>• Ask your hospital administrator for the correct link</li>
            <li>• Register a new hospital below</li>
          </ul>
        </div>

        <Link
          href={`https://${rootDomain}/signup`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
          style={{ background: '#0D9488', color: '#fff' }}
        >
          Register your hospital <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </main>
  )
}
