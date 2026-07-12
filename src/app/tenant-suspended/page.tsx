import type { Metadata } from 'next'
import { AlertTriangle, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Account suspended — Uyirly',
  robots: { index: false, follow: false },
}

export default function TenantSuspendedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertTriangle className="w-8 h-8" style={{ color: '#DC2626' }} />
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: '#0F172A' }}>
          Account suspended
        </h1>
        <p className="text-sm mb-8" style={{ color: '#64748B' }}>
          Access to this hospital&apos;s Uyirly account has been suspended,
          usually due to a billing issue or a policy violation.
        </p>

        <div className="glass-card p-6 mb-6 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#94A3B8' }}>
            Next steps
          </p>
          <ul className="space-y-2 text-sm" style={{ color: '#475569' }}>
            <li>• Contact your hospital administrator</li>
            <li>• Check for outstanding invoices in your billing portal</li>
            <li>• Reach out to Uyirly support if you believe this is an error</li>
          </ul>
        </div>

        <a
          href="mailto:support@uyirly.com"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
          style={{ background: '#0D9488', color: '#fff' }}
        >
          <Mail className="w-4 h-4" /> Contact support
        </a>
      </div>
    </main>
  )
}
