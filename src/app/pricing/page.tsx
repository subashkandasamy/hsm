import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle, ArrowRight, Mail } from 'lucide-react'
import MarketingNav from '@/components/marketing/MarketingNav'

export const metadata: Metadata = {
  title: 'Pricing — Hospital Management Software from ₹2,999/mo | Uyirly',
  description:
    'Transparent flat pricing for hospital management software in India. Starter ₹2,999/mo, Growth ₹7,999/mo, and custom Enterprise plans. No per-bed fees, no per-user metering. 30-day free trial, no credit card.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    url: '/pricing',
    title: 'Uyirly Pricing — Hospital Management Software from ₹2,999/mo',
    description:
      'Flat monthly pricing for Indian hospitals. Starter, Growth and Enterprise plans. No per-bed fees. 30-day free trial, no credit card.',
  },
}

const TEAL   = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE5 = '#64748B'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

// ── Plan data ─────────────────────────────────────────────────────────────────
type PlanDef = {
  key: 'starter' | 'growth' | 'enterprise'
  name: string
  price: string
  period: string
  tagline: string
  highlight: boolean
  badge: string | null
  cta: { label: string; href: string; style: 'primary' | 'secondary' | 'outline' }
  sections: { heading: string; items: string[] }[]
}

const PLANS: PlanDef[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: '₹2,999',
    period: '/month',
    tagline: 'Core clinical for small clinics and single-specialty practices.',
    highlight: false,
    badge: null,
    cta: { label: 'Start free trial', href: '/signup?plan=starter', style: 'secondary' },
    sections: [
      {
        heading: 'Clinical',
        items: [
          'Patient registration with UHID',
          'OPD visits — vitals, diagnosis, ICD codes',
          'Appointment booking with token queue',
          'Basic IPD admission',
          'Prescriptions',
          'Pharmacy with FEFO dispense',
        ],
      },
      {
        heading: 'Financial',
        items: [
          'Integrated billing',
          'Cash & UPI payment recording',
          'Basic billing reports',
        ],
      },
      {
        heading: 'Platform',
        items: [
          'Up to 5 staff accounts',
          'Role-based access (7 roles)',
          'Audit trail',
          'Email support (48h SLA)',
        ],
      },
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    price: '₹7,999',
    period: '/month',
    tagline: 'Full clinical suite for multi-specialty hospitals with insurance billing.',
    highlight: true,
    badge: 'Most popular',
    cta: { label: 'Start free trial', href: '/signup?plan=growth', style: 'primary' },
    sections: [
      {
        heading: 'Everything in Starter, plus:',
        items: [
          'Full IPD with ward board and daily notes',
          'Emergency triage (ESI 1–5)',
          'Lab orders and result entry',
          'Radiology orders and report upload',
          'OT scheduling with overlap prevention',
          'Blood bank — cross-match and issue',
        ],
      },
      {
        heading: 'Financial',
        items: [
          'Insurance policy + claim lifecycle',
          'Pre-auth and settlement workflow',
          'Bed, drug, lab, radiology line items',
        ],
      },
      {
        heading: 'Platform',
        items: [
          'Unlimited staff accounts',
          'WhatsApp & SMS notifications',
          'Inventory and purchase orders',
          'Priority email + chat support (12h SLA)',
        ],
      },
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'Multi-location networks, custom SLAs, and dedicated onboarding.',
    highlight: false,
    badge: null,
    cta: { label: 'Contact us', href: 'mailto:contact@uyirly.com', style: 'outline' },
    sections: [
      {
        heading: 'Everything in Growth, plus:',
        items: [
          'Multi-location with cross-branch reports',
          'Custom domain (your-hospital.com)',
          'Dedicated onboarding manager',
          'Custom data migration',
          'Priority phone support',
          'Custom SLA (99.9% uptime)',
          'Custom integrations (HL7, ABDM)',
        ],
      },
    ],
  },
]

// ── Comparison table ──────────────────────────────────────────────────────────
const COMPARE_ROWS: { label: string; starter: string | boolean; growth: string | boolean; enterprise: string | boolean }[] = [
  { label: 'Staff accounts',           starter: 'Up to 5',    growth: 'Unlimited',   enterprise: 'Unlimited' },
  { label: 'OPD & Appointments',       starter: true,         growth: true,          enterprise: true },
  { label: 'IPD',                      starter: 'Basic',      growth: 'Full',        enterprise: 'Full' },
  { label: 'Emergency triage',         starter: false,        growth: true,          enterprise: true },
  { label: 'Lab & Radiology',          starter: false,        growth: true,          enterprise: true },
  { label: 'Pharmacy (FEFO)',          starter: true,         growth: true,          enterprise: true },
  { label: 'OT scheduling',            starter: false,        growth: true,          enterprise: true },
  { label: 'Blood bank',               starter: false,        growth: true,          enterprise: true },
  { label: 'Insurance claims',         starter: false,        growth: true,          enterprise: true },
  { label: 'WhatsApp notifications',   starter: false,        growth: true,          enterprise: true },
  { label: 'Multi-location',           starter: false,        growth: false,         enterprise: true },
  { label: 'Custom domain',            starter: false,        growth: false,         enterprise: true },
  { label: 'Support SLA',             starter: '48h email',  growth: '12h priority', enterprise: 'Custom' },
]

function CellValue({ v }: { v: string | boolean }) {
  if (v === true)  return <CheckCircle className="w-5 h-5 mx-auto" style={{ color: TEAL }} />
  if (v === false) return <span style={{ color: SLATE4 }}>—</span>
  return <span className="text-sm" style={{ color: SLATE5 }}>{v}</span>
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Is the free trial really free?', a: 'Yes — 30 days, full access, no credit card required. You only pay when you choose to subscribe after the trial.' },
  { q: 'Can I switch plans later?', a: 'Yes, you can upgrade from Starter to Growth at any time. Billing is prorated for the remaining billing period.' },
  { q: 'Are prices inclusive of GST?', a: 'No. Prices shown are exclusive of GST. GST at 18% is added at checkout.' },
  { q: 'What payment methods are accepted?', a: 'Credit card, debit card, UPI, and net banking via Razorpay. Invoices are available for corporate accounts.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel from the billing portal at any time. No lock-in, no cancellation fees. Remaining days on the current billing period are not refunded.' },
]

// ── Structured data (JSON-LD) ──────────────────────────────────────────────────
const SITE = 'https://www.uyirly.com'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Pricing', item: `${SITE}/pricing` },
      ],
    },
    {
      '@type': 'Product',
      name: 'Uyirly Hospital Management Software',
      description:
        'Cloud hospital management software for Indian hospitals, nursing homes and clinics — OPD, IPD, pharmacy, lab, billing, insurance and more.',
      brand: { '@type': 'Brand', name: 'Uyirly' },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: '2999',
        highPrice: '7999',
        offerCount: 3,
        offers: [
          { '@type': 'Offer', name: 'Starter', price: '2999', priceCurrency: 'INR', url: `${SITE}/pricing` },
          { '@type': 'Offer', name: 'Growth', price: '7999', priceCurrency: 'INR', url: `${SITE}/pricing` },
          { '@type': 'Offer', name: 'Enterprise', priceCurrency: 'INR', url: `${SITE}/pricing`, description: 'Custom pricing for multi-location hospital groups.' },
        ],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ],
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav ctaLabel="Start free trial" />

      <main className="pt-28">
        {/* Header */}
        <section className="py-16 px-4 sm:px-6 text-center"
          style={{ background: 'linear-gradient(180deg, rgba(204,251,241,0.3) 0%, transparent 100%)' }}>
          <div className="max-w-2xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: SLATE9 }}>
              Simple, flat pricing
            </h1>
            <p className="text-lg mb-3" style={{ color: SLATE5 }}>
              No per-bed fees. No per-user metering. One flat monthly rate.
            </p>
            <p className="text-sm" style={{ color: SLATE4 }}>
              30-day free trial on all self-serve plans · No credit card required
            </p>
          </div>
        </section>

        {/* Plan cards */}
        <section className="py-12 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => (
              <div key={plan.key}
                className="glass-card p-7 flex flex-col gap-6 relative"
                style={plan.highlight
                  ? { border: `2px solid ${TEAL}`, boxShadow: '0 0 0 4px rgba(13,148,136,0.08)' }
                  : {}}>

                {plan.badge && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                    style={{ background: TEAL, color: '#fff' }}>
                    {plan.badge}
                  </span>
                )}

                {/* Price */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: TEAL }}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-4xl font-bold" style={{ color: SLATE9 }}>{plan.price}</span>
                    {plan.period && (
                      <span className="text-sm mb-1.5" style={{ color: SLATE4 }}>{plan.period}</span>
                    )}
                  </div>
                  <p className="text-sm leading-snug" style={{ color: SLATE5 }}>{plan.tagline}</p>
                </div>

                {/* CTA */}
                <Link href={plan.cta.href}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: plan.cta.style === 'primary' ? TEAL : plan.cta.style === 'secondary' ? 'rgba(13,148,136,0.08)' : 'transparent',
                    color: plan.cta.style === 'primary' ? '#fff' : TEAL,
                    border: plan.cta.style === 'outline' ? `1.5px solid rgba(13,148,136,0.4)` : 'none',
                    minHeight: '48px',
                  }}>
                  {plan.cta.style === 'outline' ? <Mail className="w-4 h-4" /> : null}
                  {plan.cta.label}
                  {plan.cta.style !== 'outline' && <ArrowRight className="w-4 h-4" />}
                </Link>

                {/* Features */}
                <div className="space-y-5 flex-1">
                  {plan.sections.map(({ heading, items }) => (
                    <div key={heading}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: SLATE4 }}>
                        {heading}
                      </p>
                      <ul className="space-y-2">
                        {items.map(item => (
                          <li key={item} className="flex items-start gap-2 text-sm" style={{ color: SLATE5 }}>
                            <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: TEAL }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison table */}
        <section className="py-16 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8" style={{ color: SLATE9 }}>
              Compare plans
            </h2>
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <th className="text-left px-5 py-4 font-semibold" style={{ color: SLATE9 }}>Feature</th>
                    {['Starter', 'Growth', 'Enterprise'].map(n => (
                      <th key={n} className="px-5 py-4 text-center font-bold" style={{ color: n === 'Growth' ? TEAL : SLATE9 }}>
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map(({ label, starter, growth, enterprise }, i) => (
                    <tr key={label}
                      style={{ borderBottom: i < COMPARE_ROWS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                      <td className="px-5 py-3.5" style={{ color: SLATE5 }}>{label}</td>
                      <td className="px-5 py-3.5 text-center"><CellValue v={starter} /></td>
                      <td className="px-5 py-3.5 text-center"><CellValue v={growth} /></td>
                      <td className="px-5 py-3.5 text-center"><CellValue v={enterprise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4 sm:px-6"
          style={{ background: 'linear-gradient(180deg, rgba(240,253,250,0.5) 0%, transparent 100%)' }}>
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8" style={{ color: SLATE9 }}>
              Pricing FAQ
            </h2>
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

        {/* CTA strip */}
        <section className="py-16 px-4 sm:px-6 text-center">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold mb-3" style={{ color: SLATE9 }}>
              Ready to get started?
            </h2>
            <p className="text-base mb-8" style={{ color: SLATE5 }}>
              Pick a plan and have your hospital live today. No lock-in, cancel anytime.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup?plan=starter"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
                style={{ background: 'rgba(13,148,136,0.08)', color: TEAL, border: '1px solid rgba(13,148,136,0.2)', minHeight: '52px' }}>
                Starter — ₹2,999/mo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/signup?plan=growth"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
                style={{ background: TEAL, color: '#fff', minHeight: '52px' }}>
                Growth — ₹7,999/mo <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-10 px-4 sm:px-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm" style={{ color: SLATE5 }}>
            <Link href="/" className="hover:underline">Home</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/security" className="hover:underline">Security</Link>
            <a href="mailto:contact@uyirly.com" className="hover:underline">contact@uyirly.com</a>
          </div>
          <p className="mt-4 text-xs" style={{ color: SLATE4 }}>
            © {new Date().getFullYear()} Uyirly. All prices in INR, exclusive of GST.
          </p>
        </footer>
      </main>
    </>
  )
}
