import { CalendarX, RefreshCcw } from 'lucide-react'
import Link from 'next/link'

export default function TenantExpiredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)' }}>
          <CalendarX className="w-8 h-8" style={{ color: '#D97706' }} />
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: '#0F172A' }}>
          Subscription expired
        </h1>
        <p className="text-sm mb-8" style={{ color: '#64748B' }}>
          Your Uyirly subscription has ended. Renew to restore full access to your hospital account.
        </p>

        <Link
          href="/account/subscription"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold mb-4"
          style={{ background: '#0D9488', color: '#fff' }}
        >
          <RefreshCcw className="w-4 h-4" /> Renew subscription
        </Link>

        <p className="text-xs" style={{ color: '#94A3B8' }}>
          Need help?{' '}
          <a href="mailto:support@uyirly.com" style={{ color: '#0D9488' }}>
            Contact support
          </a>
        </p>
      </div>
    </main>
  )
}
