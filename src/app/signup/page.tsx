import type { Metadata } from 'next'
import BrandMark from '@/components/ui/BrandMark'
import { LayoutDashboard, UserCheck, Users, ShieldCheck, MapPin, CreditCard } from 'lucide-react'
import SignupForm from './_components/SignupForm'

export const metadata: Metadata = {
  title: 'Start Your Free Trial — Uyirly Hospital Management Software',
  description:
    'Register your hospital on Uyirly in under 2 minutes and start a 30-day free trial. No credit card required. All-in-one hospital management software for India — OPD, IPD, pharmacy, lab, billing and more.',
  alternates: { canonical: '/signup' },
  openGraph: {
    url: '/signup',
    title: 'Start Your Free Trial — Uyirly Hospital Management Software',
    description:
      'Set up your hospital in under 2 minutes. 30-day free trial, no credit card. Built for Indian hospitals.',
  },
}

const STEPS = [
  {
    icon: LayoutDashboard,
    title: 'Your hospital gets its own dashboard',
    body: 'We instantly create a private, secure Uyirly workspace just for your hospital — OPD, IPD, pharmacy, lab, billing and more, all connected.',
  },
  {
    icon: UserCheck,
    title: "You're signed in as the admin",
    body: 'The details you enter here create your admin account. As soon as you finish, you’re logged straight into your dashboard.',
  },
  {
    icon: Users,
    title: 'Invite your team and start',
    body: 'Add your doctors, nurses and front-desk staff, then register your first patient. Everything is ready to use on day one.',
  },
]

const TRUST = [
  { icon: CreditCard, label: '30-day free trial · No credit card' },
  { icon: MapPin,     label: 'Patient data stored in India' },
  { icon: ShieldCheck, label: 'DPDP Act aligned · Bank-grade security' },
]

interface Props {
  searchParams: Promise<{ plan?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const { plan } = await searchParams
  // Growth is the default trial tier — new hospitals trial the full feature set,
  // then choose a paid plan at the end. Only an explicit ?plan=starter opts down.
  const selectedPlan = plan === 'starter' ? 'starter' : 'growth'

  return (
    <main className="min-h-screen flex items-center justify-center p-4 py-10 sm:py-12">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">

        {/* ── Left: what this is & what happens ── */}
        <div className="lg:pt-6">
          <div className="flex items-center gap-2.5 mb-6">
            <BrandMark size={44} />
            <span className="text-lg font-bold" style={{ color: '#0F172A' }}>Uyirly</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: '#0F172A' }}>
            Set up your hospital on Uyirly
          </h1>
          <p className="text-sm sm:text-base mb-8 leading-relaxed" style={{ color: '#64748B' }}>
            This creates your hospital&apos;s own account so you can run OPD, IPD, pharmacy, lab and billing
            in one place. It takes about 2 minutes — no payment needed to start.
          </p>

          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: '#94A3B8' }}>
            What happens when you register
          </p>
          <div className="space-y-4 mb-8">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={i} className="flex gap-3.5">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}>
                    <Icon className="flex-shrink-0" style={{ color: '#0D9488', width: 18, height: 18 }} />
                  </div>
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: '#0D9488', color: '#fff' }}>{i + 1}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</p>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: '#64748B' }}>{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {TRUST.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#475569' }}>
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#0D9488' }} /> {label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: the form ── */}
        <div>
          <div className="glass-card p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-bold" style={{ color: '#0F172A' }}>Create your account</h2>
              <p className="mt-0.5 text-sm" style={{ color: '#64748B' }}>
                Fill this in once — you can change everything later.
              </p>
              {selectedPlan === 'growth' && (
                <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                  Growth plan selected — 30-day free trial
                </span>
              )}
            </div>
            <SignupForm plan={selectedPlan} />
          </div>

          <p className="text-center mt-6 text-xs" style={{ color: '#94A3B8' }}>
            Already registered?{' '}
            <span style={{ color: '#64748B' }}>
              Log in at your hospital&apos;s address, e.g. <span style={{ color: '#0D9488' }}>your-hospital.uyirly.com</span>
            </span>
          </p>
        </div>
      </div>
    </main>
  )
}
