import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2, Users, FlaskConical, Receipt, Shield,
  CheckCircle, ArrowRight, ChevronDown,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Uyirly — Hospital Management Software for India',
  description:
    'From OPD to billing, pharmacy to blood bank — everything your team needs in one place. Built for Indian hospitals. DPDP Act aligned.',
}

// ── Shared tokens ─────────────────────────────────────────────────────────────
const TEAL   = '#0D9488'
const TEAL_D = '#0F766E'
const SLATE9 = '#0F172A'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50"
      style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${BORDER}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-4 h-4" style={{ color: TEAL }} />
          </div>
          <span className="text-base font-bold" style={{ color: SLATE9 }}>Uyirly</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link href="/pricing" className="text-sm font-medium transition-colors hover:text-teal-600"
            style={{ color: SLATE5 }}>Pricing</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/pricing"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: TEAL, color: '#fff' }}
            onMouseEnter={undefined}>
            Get started
          </Link>
          <Link href="/pricing"
            className="sm:hidden px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: TEAL, color: '#fff' }}>
            Start free
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 text-center"
      style={{ background: 'linear-gradient(180deg, rgba(204,251,241,0.35) 0%, transparent 100%)' }}>
      <div className="max-w-3xl mx-auto">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-6"
          style={{ background: 'rgba(13,148,136,0.1)', color: TEAL, border: '1px solid rgba(13,148,136,0.2)' }}>
          14-day free trial · No credit card required
        </span>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5" style={{ color: SLATE9 }}>
          Hospital management<br className="hidden sm:block" />
          software built for India
        </h1>
        <p className="text-lg sm:text-xl mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: SLATE5 }}>
          From OPD to billing, pharmacy to blood bank — everything your team needs in one place. DPDP Act aligned. India data residency.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/signup?plan=starter"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
            style={{ background: TEAL, color: '#fff', minHeight: '52px' }}>
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/pricing"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
            style={{ background: 'rgba(255,255,255,0.9)', color: SLATE9, border: `1px solid ${BORDER}`, minHeight: '52px' }}>
            View pricing
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm" style={{ color: SLATE4 }}>
          {['OPD & IPD', 'Lab & Pharmacy', 'Billing & Insurance', 'Blood Bank & OT'].map(f => (
            <span key={f} className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" style={{ color: TEAL }} /> {f}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <Users className="w-5 h-5" style={{ color: TEAL }} />,
    title: 'Core Clinical',
    desc: 'Patient registration with UHID, OPD visits with vitals and ICD codes, appointments with token queue, and full inpatient admission-to-discharge cycle.',
  },
  {
    icon: <FlaskConical className="w-5 h-5" style={{ color: TEAL }} />,
    title: 'Diagnostics & Treatment',
    desc: 'Lab orders and result entry, radiology with report upload, pharmacy with FEFO dispense, OT scheduling with overlap prevention, and blood bank with cross-match.',
  },
  {
    icon: <Receipt className="w-5 h-5" style={{ color: TEAL }} />,
    title: 'Financial & Administrative',
    desc: 'Integrated billing aggregating all charges, payment recording, insurance claim lifecycle, inventory PO to stock movement, and HR with attendance and duty roster.',
  },
  {
    icon: <Shield className="w-5 h-5" style={{ color: TEAL }} />,
    title: 'Platform & Compliance',
    desc: 'Role-based access control with 7 roles, tamper-proof audit trail on every action, multi-tenant data isolation at row level, and DPDP Act–aligned data handling.',
  },
]

function Features() {
  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: SLATE9 }}>
            Everything a hospital needs
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: SLATE5 }}>
            Modules built around real clinical workflows — not retrofitted from generic SaaS.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title}
              className="glass-card p-6 flex flex-col gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)' }}>
                {icon}
              </div>
              <div>
                <h3 className="font-bold text-base mb-1.5" style={{ color: SLATE9 }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: SLATE5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Trust ─────────────────────────────────────────────────────────────────────
const TRUST = [
  { emoji: '🇮🇳', title: 'India data residency', desc: 'All patient data stored on Indian servers. No cross-border data transfer.' },
  { emoji: '🔒', title: 'Encrypted at rest & transit', desc: 'AES-256 at rest, TLS 1.3 in transit. Supabase-managed key rotation.' },
  { emoji: '📋', title: 'DPDP Act aligned', desc: 'Patient consent flags, purpose limitation, and erasure support built in from day one.' },
  { emoji: '📊', title: 'Full audit trail', desc: 'Every data change is logged with actor, timestamp, and entity. Immutable by design.' },
]

function Trust() {
  return (
    <section className="py-20 px-4 sm:px-6"
      style={{ background: 'linear-gradient(180deg, rgba(240,253,250,0.6) 0%, rgba(204,251,241,0.3) 100%)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: SLATE9 }}>
            Built for trust
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: SLATE5 }}>
            Security and compliance aren't add-ons — they're in the foundation.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TRUST.map(({ emoji, title, desc }) => (
            <div key={title} className="glass-card p-6 text-center">
              <div className="text-3xl mb-3">{emoji}</div>
              <h3 className="font-bold text-sm mb-2" style={{ color: SLATE9 }}>{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: SLATE5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', title: 'Sign up', desc: 'Register your hospital, pick a plan, and get your own subdomain — in under 2 minutes.' },
  { num: '02', title: 'Onboard your team', desc: 'Add doctors, nurses, and support staff with role-based access. Each role sees only what they need.' },
  { num: '03', title: 'Go live', desc: 'Start booking appointments, recording visits, dispensing medicines, and processing bills the same day.' },
]

function HowItWorks() {
  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: SLATE9 }}>How it works</h2>
          <p className="text-base" style={{ color: SLATE5 }}>
            From sign-up to seeing patients — three steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map(({ num, title, desc }) => (
            <div key={num} className="relative flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-xl font-bold"
                style={{ background: 'rgba(13,148,136,0.1)', color: TEAL, border: '1px solid rgba(13,148,136,0.2)' }}>
                {num}
              </div>
              <h3 className="font-bold text-lg mb-2" style={{ color: SLATE9 }}>{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: SLATE5 }}>{desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
            style={{ background: TEAL, color: '#fff' }}>
            Get started now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Pricing teaser ────────────────────────────────────────────────────────────
const PLAN_TEASER = [
  {
    name: 'Starter',
    price: '₹2,999',
    desc: 'Core clinical for small clinics',
    features: ['OPD & Appointments', 'Patient records & EMR', 'Basic billing', 'Up to 5 staff'],
    href: '/signup?plan=starter',
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '₹7,999',
    desc: 'Full feature set for mid-size hospitals',
    features: ['Everything in Starter', 'Lab, Radiology & Pharmacy', 'IPD, OT & Blood Bank', 'Insurance claims', 'Unlimited staff'],
    href: '/signup?plan=growth',
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    desc: 'Multi-location + custom SLA',
    features: ['Everything in Growth', 'Multi-location', 'Custom domain', 'Priority onboarding', 'SLA guarantee'],
    href: 'mailto:contact@uyirly.com',
    cta: 'Contact us',
    highlight: false,
  },
]

function PricingTeaser() {
  return (
    <section className="py-20 px-4 sm:px-6"
      style={{ background: 'linear-gradient(180deg, rgba(204,251,241,0.2) 0%, rgba(240,253,250,0.5) 100%)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: SLATE9 }}>Simple, flat pricing</h2>
          <p className="text-base" style={{ color: SLATE5 }}>
            14-day free trial on all plans. No credit card required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_TEASER.map(({ name, price, desc, features, href, cta, highlight }) => (
            <div key={name}
              className="glass-card p-7 flex flex-col gap-5 relative"
              style={highlight ? { border: `2px solid ${TEAL}`, boxShadow: `0 0 0 4px rgba(13,148,136,0.08)` } : {}}>
              {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: TEAL, color: '#fff' }}>
                  Most popular
                </span>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: TEAL }}>{name}</p>
                <p className="text-3xl font-bold mb-0.5" style={{ color: SLATE9 }}>
                  {price}
                  {price !== 'Custom' && <span className="text-sm font-normal" style={{ color: SLATE4 }}>/mo</span>}
                </p>
                <p className="text-sm" style={{ color: SLATE5 }}>{desc}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: SLATE5 }}>
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: TEAL }} /> {f}
                  </li>
                ))}
              </ul>

              <Link href={href}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: highlight ? TEAL : 'rgba(13,148,136,0.08)',
                  color: highlight ? '#fff' : TEAL,
                  border: highlight ? 'none' : `1px solid rgba(13,148,136,0.2)`,
                  minHeight: '44px',
                }}>
                {cta} {cta !== 'Contact us' && <ArrowRight className="w-4 h-4" />}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: SLATE4 }}>
          All prices exclude GST. Billed monthly.{' '}
          <Link href="/pricing" style={{ color: TEAL }}>Compare plans in detail →</Link>
        </p>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'Is patient data stored in India?',
    a: 'Yes. All data is stored on Indian servers through our infrastructure partner. No patient data leaves India.',
  },
  {
    q: 'Does Uyirly comply with the DPDP Act 2023?',
    a: 'We have built DPDP-aligned controls into the platform: patient consent capture, purpose-limited data access, audit trails, and a data erasure workflow. We review changes to DPDP rules and update accordingly.',
  },
  {
    q: 'Can I migrate data from our existing software?',
    a: 'Growth and Enterprise plans include assisted data migration for patient records and historical bills. We support CSV import and can work with exports from most Indian HIS systems.',
  },
  {
    q: 'What happens when the 14-day trial ends?',
    a: 'You'll receive reminders before the trial ends. If you don't subscribe, your data is retained for 30 days and then deleted. No automatic charges — you choose when to subscribe.',
  },
  {
    q: 'Does it work on mobile and tablets?',
    a: 'Yes. The web app is fully responsive and tested on 375px (phone), 768px (tablet), and 1280px (desktop). No native app download is required.',
  },
  {
    q: 'Can we run multiple branches or hospitals on one account?',
    a: 'The Enterprise plan supports multi-location: each branch gets its own subdomain and data isolation, but a super-admin can view cross-location reports.',
  },
  {
    q: 'How long does initial setup take?',
    a: 'The technical setup — registering your hospital, creating accounts, configuring departments — takes under 5 minutes. Adding your first patients and going live is typically done the same day.',
  },
  {
    q: 'What kind of support do you provide?',
    a: 'Starter includes email support (48h SLA). Growth adds priority email and chat support (12h SLA). Enterprise includes a dedicated onboarding manager and a custom SLA.',
  },
]

function FAQ() {
  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: SLATE9 }}>Frequently asked questions</h2>
          <p className="text-base" style={{ color: SLATE5 }}>
            Common questions from hospital administrators evaluating Uyirly.
          </p>
        </div>

        <div className="space-y-4">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-2" style={{ color: SLATE9 }}>{q}</h3>
              <p className="text-sm leading-relaxed" style={{ color: SLATE5 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6" style={{ borderTop: `1px solid ${BORDER}` }}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-3.5 h-3.5" style={{ color: TEAL }} />
          </div>
          <span className="text-sm font-bold" style={{ color: SLATE9 }}>Uyirly</span>
        </div>

        <nav className="flex items-center gap-6 text-sm" style={{ color: SLATE5 }}>
          <Link href="/pricing" className="hover:underline">Pricing</Link>
          <Link href="#" className="hover:underline">Terms</Link>
          <Link href="#" className="hover:underline">Privacy</Link>
          <a href="mailto:contact@uyirly.com" className="hover:underline">Contact</a>
        </nav>

        <p className="text-xs" style={{ color: SLATE4 }}>
          © {new Date().getFullYear()} Uyirly. Made in India.
        </p>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <Nav />
      <Hero />
      <Features />
      <Trust />
      <HowItWorks />
      <PricingTeaser />
      <FAQ />
      <Footer />
    </>
  )
}
