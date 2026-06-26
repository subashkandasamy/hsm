import { Building2 } from 'lucide-react'
import SignupForm from './_components/SignupForm'

export const metadata = { title: 'Register your hospital — Uyirly' }

interface Props {
  searchParams: Promise<{ plan?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const { plan } = await searchParams
  const selectedPlan = plan === 'growth' ? 'growth' : 'starter'

  return (
    <main className="min-h-screen flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-7 h-7" style={{ color: '#0D9488' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
            Start your free trial
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
            Set up your hospital on Uyirly in under 2 minutes.
          </p>
          {selectedPlan === 'growth' && (
            <span className="mt-3 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
              Growth plan selected — 14-day free trial
            </span>
          )}
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <SignupForm plan={selectedPlan} />
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#94A3B8' }}>
          Already registered?{' '}
          <span style={{ color: '#64748B' }}>
            Log in at <span style={{ color: '#0D9488' }}>your-hospital.uyirly.com</span>
          </span>
        </p>
      </div>
    </main>
  )
}
