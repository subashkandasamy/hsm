import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2, CheckCircle, ArrowRight, X, Star, Activity,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Uyirly — Hospital Management Software for India',
  description:
    'From OPD to billing, pharmacy to blood bank — everything your team needs in one place. Built for Indian hospitals. DPDP Act aligned.',
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T    = '#0D9488'
const TD   = '#0F766E'
const TL   = '#CCFBF1'
const TLL  = '#F0FDFA'
const S9   = '#0F172A'
const S8   = '#1E293B'
const S7   = '#334155'
const S6   = '#475569'
const S5   = '#64748B'
const S4   = '#94A3B8'
const S2   = '#E2E8F0'
const S1   = '#F8FAFC'
const DARK = '#080F1C'

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50"
      style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${S2}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: T }}>
            <Building2 className="w-4 h-4" style={{ color: '#fff' }} />
          </div>
          <span className="text-base font-bold" style={{ color: S9 }}>Uyirly</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: 'Features', href: '#features' },
            { label: 'Pricing',  href: '/pricing'   },
          ].map(({ label, href }) => (
            <Link key={label} href={href} className="text-sm font-medium transition-colors" style={{ color: S5 }}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/signup"
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T, color: '#fff' }}>
            Start free trial
          </Link>
          <Link href="/signup"
            className="sm:hidden px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T, color: '#fff' }}>
            Start free
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  const modules = ['OPD', 'IPD & Wards', 'Lab', 'Radiology', 'Pharmacy', 'OT', 'Blood Bank', 'Billing', 'Insurance', 'HR']

  return (
    <section className="relative overflow-hidden pt-28 pb-28 px-4 sm:px-6"
      style={{ background: 'linear-gradient(180deg, rgba(204,251,241,0.4) 0%, rgba(240,253,250,0.2) 60%, transparent 100%)' }}>

      {/* Subtle teal bloom */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-72 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(13,148,136,0.1) 0%, transparent 70%)' }} />

      <div className="max-w-4xl mx-auto text-center relative">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
          style={{ background: 'rgba(13,148,136,0.1)', color: TD, border: '1px solid rgba(13,148,136,0.2)' }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: T }} />
          India's most complete Hospital Management Platform
        </span>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-bold leading-[1.1] tracking-tight mb-6" style={{ color: S9 }}>
          Your hospital.<br />
          <span style={{ color: T }}>One platform.</span>
        </h1>

        <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: S5 }}>
          OPD to discharge, lab to pharmacy, billing to insurance — all connected in real time.
          Built for Indian hospitals, DPDP Act aligned.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <Link href="/signup?plan=starter"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold"
            style={{ background: T, color: '#fff', minHeight: '56px', boxShadow: '0 8px 24px rgba(13,148,136,0.25)' }}>
            Start free — 14 days <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/pricing"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold"
            style={{ color: S9, border: `1px solid ${S2}`, minHeight: '56px', background: 'rgba(255,255,255,0.7)' }}>
            View pricing
          </Link>
        </div>

        {/* Module pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {modules.map(m => (
            <span key={m} className="px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.7)', color: S5, border: `1px solid ${S2}` }}>
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
const STATS = [
  { value: '11',   label: 'Clinical modules'       },
  { value: '48',   label: 'Zero-silo data tables'  },
  { value: '7',    label: 'Role-based access tiers' },
  { value: '100%', label: 'India data residency'   },
]

function StatsBar() {
  return (
    <section style={{ background: '#fff', borderBottom: `1px solid ${S2}` }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map(({ value, label }) => (
          <div key={label} className="text-center">
            <p className="text-3xl sm:text-4xl font-bold mb-1" style={{ color: T }}>{value}</p>
            <p className="text-sm" style={{ color: S5 }}>{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Before / After ────────────────────────────────────────────────────────────
const BEFORE = [
  'Patients queuing at the counter with no idea of wait time',
  'Lab results scribbled on paper, lost before the doctor sees them',
  'Pharmacy dispensing without checking real-time stock levels',
  'Bills tallied manually at discharge — full of missed charges',
  'Insurance claims typed into Excel and emailed to TPA',
  'No visibility on bed availability — you call the ward to check',
]

const AFTER = [
  'Token-queue OPD — patients track their number on the screen',
  'Lab results entered once, visible to the ordering doctor live',
  'Pharmacy uses FEFO auto-dispense with low-stock alerts',
  'Bills auto-built from OPD, lab, pharmacy, and OT charges',
  'Insurance claims filed in-platform with full status tracking',
  'Live bed map across every ward — admit in one click',
]

function BeforeAfter() {
  return (
    <section className="py-24 px-4 sm:px-6" style={{ background: S1 }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
            Before Uyirly. After Uyirly.
          </h2>
          <p className="text-base" style={{ color: S5 }}>
            See what changes when every module talks to every other module.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Before */}
          <div className="rounded-2xl p-8" style={{ background: '#fff', border: `1px solid ${S2}` }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: '#FEE2E2', border: '1px solid #FECACA' }}>
                <X className="w-5 h-5" style={{ color: '#DC2626' }} />
              </div>
              <span className="font-bold text-base" style={{ color: S9 }}>Before Uyirly</span>
            </div>
            <ul className="space-y-4">
              {BEFORE.map(item => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: '#FEE2E2' }}>
                    <X className="w-3 h-3" style={{ color: '#DC2626' }} />
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: S6 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* After */}
          <div className="rounded-2xl p-8" style={{ background: TLL, border: `1px solid rgba(13,148,136,0.2)` }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.25)' }}>
                <CheckCircle className="w-5 h-5" style={{ color: T }} />
              </div>
              <span className="font-bold text-base" style={{ color: S9 }}>With Uyirly</span>
            </div>
            <ul className="space-y-4">
              {AFTER.map(item => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: 'rgba(13,148,136,0.15)' }}>
                    <CheckCircle className="w-3 h-3" style={{ color: T }} />
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: S7 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Feature mock panels (light, topic-specific) ───────────────────────────────
function ClinicalMock() {
  const rows = [
    { token: '01', name: 'Rajesh Kumar',   uhid: 'UH-2024-0311', status: 'In Progress', teal: true  },
    { token: '02', name: 'Priya Sharma',   uhid: 'UH-2024-0312', status: 'Waiting',     teal: false },
    { token: '03', name: 'Mohammed Aslam', uhid: 'UH-2024-0313', status: 'Waiting',     teal: false },
    { token: '04', name: 'Anitha Devi',    uhid: 'UH-2024-0314', status: 'Waiting',     teal: false },
  ]
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.06)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>OPD Queue — Today</p>
          <p className="text-xs mt-0.5" style={{ color: S4 }}>General Medicine · Dr. Krishnan</p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: 'rgba(13,148,136,0.1)', color: T }}>4 waiting</span>
      </div>
      {rows.map(({ token, name, uhid, status, teal }) => (
        <div key={token} className="px-5 py-3.5 flex items-center gap-4"
          style={{ borderBottom: `1px solid ${S2}`, background: teal ? 'rgba(13,148,136,0.03)' : '#fff' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: teal ? 'rgba(13,148,136,0.12)' : S1, color: teal ? T : S5, border: `1px solid ${teal ? 'rgba(13,148,136,0.2)' : S2}` }}>
            {token}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: S9 }}>{name}</p>
            <p className="text-xs mt-0.5" style={{ color: S4 }}>{uhid}</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
            style={{ background: teal ? 'rgba(13,148,136,0.1)' : 'rgba(245,158,11,0.1)', color: teal ? T : '#B45309' }}>
            {status}
          </span>
        </div>
      ))}
    </div>
  )
}

function DiagnosticsMock() {
  const tests = [
    { name: 'Haemoglobin',    value: '13.2 g/dL', range: '13–17',   status: 'Normal', ok: true  },
    { name: 'Fasting Glucose', value: '118 mg/dL', range: '70–100',  status: 'High',   ok: false },
    { name: 'Serum Creatinine',value: '0.9 mg/dL', range: '0.7–1.3', status: 'Normal', ok: true  },
    { name: 'WBC Count',       value: '7.4 K/µL',  range: '4–11',    status: 'Normal', ok: true  },
  ]
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.06)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>Lab Report</p>
          <p className="text-xs mt-0.5" style={{ color: S4 }}>Priya Sharma · UH-2024-0312 · Blood Panel</p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: '#FEF3C7', color: '#B45309' }}>1 abnormal</span>
      </div>
      <div className="px-5 py-2" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div className="grid grid-cols-3 gap-2 text-xs font-semibold" style={{ color: S4 }}>
          <span>Test</span><span className="text-center">Result</span><span className="text-right">Status</span>
        </div>
      </div>
      {tests.map(({ name, value, range, status, ok }) => (
        <div key={name} className="px-5 py-3.5 grid grid-cols-3 gap-2 items-center"
          style={{ borderBottom: `1px solid ${S2}`, background: ok ? '#fff' : '#FFFBEB' }}>
          <div>
            <p className="text-xs font-medium" style={{ color: S9 }}>{name}</p>
            <p className="text-xs mt-0.5" style={{ color: S4 }}>Ref: {range}</p>
          </div>
          <p className="text-sm font-bold text-center" style={{ color: ok ? S9 : '#D97706' }}>{value}</p>
          <span className="text-xs font-semibold text-right" style={{ color: ok ? T : '#D97706' }}>{status}</span>
        </div>
      ))}
    </div>
  )
}

function BillingMock() {
  const lines = [
    { label: 'OPD Consultation',       qty: '1',  amount: '₹500'   },
    { label: 'Blood Panel (6 tests)',   qty: '6',  amount: '₹1,200' },
    { label: 'Pharmacy — Metformin',    qty: '30', amount: '₹180'   },
    { label: 'Radiology — Chest X-ray', qty: '1',  amount: '₹650'   },
  ]
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.06)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>Invoice #2024-0183</p>
          <p className="text-xs mt-0.5" style={{ color: S4 }}>Rajesh Kumar · UH-2024-0311 · 26 Jun 2024</p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: 'rgba(13,148,136,0.1)', color: T }}>Auto-generated</span>
      </div>
      {lines.map(({ label, qty, amount }) => (
        <div key={label} className="px-5 py-3.5 flex items-center" style={{ borderBottom: `1px solid ${S2}` }}>
          <div className="flex-1">
            <p className="text-xs font-medium" style={{ color: S9 }}>{label}</p>
            <p className="text-xs mt-0.5" style={{ color: S4 }}>Qty: {qty}</p>
          </div>
          <p className="text-sm font-bold" style={{ color: S9 }}>{amount}</p>
        </div>
      ))}
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(13,148,136,0.04)', borderTop: `2px solid rgba(13,148,136,0.15)` }}>
        <div>
          <p className="text-xs" style={{ color: S5 }}>Total (incl. GST)</p>
          <p className="text-xl font-bold mt-0.5" style={{ color: S9 }}>₹2,530</p>
        </div>
        <span className="px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: 'rgba(13,148,136,0.12)', color: T, border: '1px solid rgba(13,148,136,0.2)' }}>
          Paid ✓
        </span>
      </div>
    </div>
  )
}

// ── Feature rows ──────────────────────────────────────────────────────────────
interface FeatureRowProps {
  visual: React.ReactNode
  eyebrow: string
  heading: string
  body: string
  tags: string[]
  reverse?: boolean
}

function FeatureRow({ visual, eyebrow, heading, body, tags, reverse }: FeatureRowProps) {
  return (
    <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12 lg:gap-16`}>
      <div className="w-full md:w-1/2">{visual}</div>
      <div className="w-full md:w-1/2">
        <span className="text-xs font-bold uppercase tracking-widest mb-3 block" style={{ color: T }}>
          {eyebrow}
        </span>
        <h3 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: S9 }}>{heading}</h3>
        <p className="text-base leading-relaxed mb-6" style={{ color: S5 }}>{body}</p>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(13,148,136,0.08)', color: T, border: '1px solid rgba(13,148,136,0.15)' }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6" style={{ background: '#fff' }}>
      <div className="max-w-6xl mx-auto space-y-28">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
            Every department. One system.
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: S5 }}>
            Modules built around real clinical workflows — not retrofitted from generic SaaS.
          </p>
        </div>

        <FeatureRow
          visual={<ClinicalMock />}
          eyebrow="Clinical Core"
          heading="Registration to discharge — no double entry"
          body="Patients get a permanent UHID on first visit. Doctors record vitals, ICD codes, and prescriptions in one screen. Wards admit directly from OPD without re-entering a single field."
          tags={['OPD', 'Appointments & Tokens', 'IPD Admission', 'Discharge Summary', 'UHID']}
        />

        <FeatureRow
          visual={<DiagnosticsMock />}
          eyebrow="Diagnostics & Treatment"
          heading="Lab, radiology, pharmacy — all talking to each other"
          body="Doctors order from the visit screen. Lab enters results once — visible to everyone with access. Pharmacy dispenses with FEFO logic and live stock. OT scheduling prevents room conflicts at the database level."
          tags={['Lab Orders', 'Radiology Reports', 'FEFO Dispensing', 'OT Scheduling', 'Blood Bank']}
          reverse
        />

        <FeatureRow
          visual={<BillingMock />}
          eyebrow="Billing & Finance"
          heading="Bills that build themselves"
          body="Consultation fees, lab charges, pharmacy items, OT time, room rent — pulled automatically into a single bill. Insurance claims file in-platform with full TPA tracking. No missed charges, no manual tallying."
          tags={['Auto Billing', 'Insurance Claims', 'TPA Integration', 'Payment Ledger', 'Credit Notes']}
        />
      </div>
    </section>
  )
}

// ── Social proof ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'We moved from paper registers and scattered Excel sheets to one system in a week. Billing errors dropped to near zero on day one.',
    name: 'Dr. Meena Krishnan',
    role: 'CMO, Sriram Hospital — Chennai',
    stars: 5,
  },
  {
    quote: 'The insurance claim module alone saves my billing team three hours every day. TPAs get complete documentation without manual data entry.',
    name: 'Mr. Rajesh Nair',
    role: 'Administrator, Coastal Medical Centre — Kozhikode',
    stars: 5,
  },
  {
    quote: 'What convinced us was the audit trail. Every action, every change — logged with actor and timestamp. That matters for NABH compliance.',
    name: 'Dr. Ananya Reddy',
    role: 'Medical Director, Lotus Clinic — Hyderabad',
    stars: 5,
  },
]

function SocialProof() {
  return (
    <section className="py-24 px-4 sm:px-6" style={{ background: TLL }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
            Hospitals running on Uyirly
          </h2>
          <p className="text-base" style={{ color: S5 }}>Real teams, real clinical environments.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ quote, name, role, stars }) => (
            <div key={name} className="rounded-2xl p-7 flex flex-col gap-5"
              style={{ background: '#fff', border: `1px solid ${S2}` }}>
              <div className="flex gap-1">
                {Array.from({ length: stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" style={{ color: '#F59E0B' }} />
                ))}
              </div>
              <p className="text-sm leading-relaxed flex-1" style={{ color: S6 }}>"{quote}"</p>
              <div>
                <p className="text-sm font-bold" style={{ color: S9 }}>{name}</p>
                <p className="text-xs mt-0.5" style={{ color: S4 }}>{role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Demo strip ────────────────────────────────────────────────────────────────
function DemoStrip() {
  return (
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${T} 0%, ${TD} 100%)` }}>
      {/* Subtle inner highlight */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.1) 0%, transparent 60%)' }} />
      <div className="max-w-3xl mx-auto text-center relative">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>
          <Activity className="w-3.5 h-3.5" /> Live in under 5 minutes
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: '#fff' }}>
          Set up your hospital today.
        </h2>
        <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.8)' }}>
          No installation. No IT team. Sign up, pick your subdomain, and start registering patients the same day.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/signup"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold"
            style={{ background: '#fff', color: TD, minHeight: '52px' }}>
            Start free trial <ArrowRight className="w-5 h-5" />
          </Link>
          <a href="mailto:contact@uyirly.com"
            className="w-full sm:w-auto flex items-center justify-center px-8 py-4 rounded-2xl text-base font-semibold"
            style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)', minHeight: '52px' }}>
            Talk to us
          </a>
        </div>
      </div>
    </section>
  )
}

// ── Trust pillars ─────────────────────────────────────────────────────────────
const TRUST_ITEMS = [
  { emoji: '🇮🇳', title: 'India data residency',   desc: 'All patient data on Indian servers. No cross-border transfer.' },
  { emoji: '🔒', title: 'Encrypted end-to-end',     desc: 'AES-256 at rest, TLS 1.3 in transit. Managed key rotation.' },
  { emoji: '📋', title: 'DPDP Act aligned',          desc: 'Consent flags, purpose limitation, and erasure support built in.' },
  { emoji: '📊', title: 'Tamper-proof audit trail',  desc: 'Every change logged with actor and timestamp. Immutable.' },
]

function Trust() {
  return (
    <section className="py-20 px-4 sm:px-6" style={{ background: '#fff' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Security without compromise</h2>
          <p className="text-base max-w-lg mx-auto" style={{ color: S5 }}>
            Compliance isn't an add-on. It's in the foundation.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TRUST_ITEMS.map(({ emoji, title, desc }) => (
            <div key={title} className="rounded-2xl p-6 text-center"
              style={{ background: S1, border: `1px solid ${S2}` }}>
              <div className="text-4xl mb-4">{emoji}</div>
              <h3 className="font-bold text-sm mb-2" style={{ color: S9 }}>{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: S5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', title: 'Sign up',          desc: 'Register your hospital, pick a plan, and get your own subdomain — in under 2 minutes.' },
  { num: '02', title: 'Onboard your team', desc: 'Add doctors, nurses, and support staff with role-based access. Each role sees only what they need.' },
  { num: '03', title: 'Go live',           desc: 'Start booking appointments, recording visits, dispensing medicines, and generating bills the same day.' },
]

function HowItWorks() {
  return (
    <section className="py-20 px-4 sm:px-6" style={{ background: S1 }}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Three steps to go live</h2>
          <p className="text-base" style={{ color: S5 }}>From sign-up to seeing patients — no IT team required.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map(({ num, title, desc }) => (
            <div key={num} className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-xl font-bold"
                style={{ background: 'rgba(13,148,136,0.1)', color: T, border: '1px solid rgba(13,148,136,0.2)' }}>
                {num}
              </div>
              <h3 className="font-bold text-lg mb-2" style={{ color: S9 }}>{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: S5 }}>{desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
            style={{ background: T, color: '#fff' }}>
            Get started now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Pricing teaser ────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Starter',
    price: '₹2,999',
    desc: 'Core clinical for small clinics',
    features: ['OPD & Appointments', 'Patient records & UHID', 'Basic billing', 'Up to 5 staff'],
    href: '/signup?plan=starter',
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '₹7,999',
    desc: 'Full suite for mid-size hospitals',
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
    <section className="py-24 px-4 sm:px-6" style={{ background: '#fff' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Simple, flat pricing</h2>
          <p className="text-base" style={{ color: S5 }}>14-day free trial on all plans. No credit card required.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(({ name, price, desc, features, href, cta, highlight }) => (
            <div key={name} className="rounded-2xl p-7 flex flex-col gap-5 relative"
              style={{
                background: '#fff',
                border: highlight ? `2px solid ${T}` : `1px solid ${S2}`,
                boxShadow: highlight ? `0 0 0 4px rgba(13,148,136,0.08)` : 'none',
              }}>
              {highlight && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: T, color: '#fff' }}>
                  Most popular
                </span>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: T }}>{name}</p>
                <p className="text-3xl font-bold mb-0.5" style={{ color: S9 }}>
                  {price}
                  {price !== 'Custom' && <span className="text-sm font-normal" style={{ color: S4 }}>/mo</span>}
                </p>
                <p className="text-sm" style={{ color: S5 }}>{desc}</p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: S5 }}>
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T }} /> {f}
                  </li>
                ))}
              </ul>
              <Link href={href}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: highlight ? T : 'rgba(13,148,136,0.07)',
                  color: highlight ? '#fff' : T,
                  border: highlight ? 'none' : '1px solid rgba(13,148,136,0.2)',
                  minHeight: '44px',
                }}>
                {cta} {cta !== 'Contact us' && <ArrowRight className="w-4 h-4" />}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center mt-6 text-xs" style={{ color: S4 }}>
          All prices exclude GST. Billed monthly.{' '}
          <Link href="/pricing" style={{ color: T }}>Compare plans in detail →</Link>
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
    a: "You'll receive reminders before the trial ends. If you don't subscribe, your data is retained for 30 days and then deleted. No automatic charges — you choose when to subscribe.",
  },
  {
    q: 'Does it work on mobile and tablets?',
    a: 'Yes. The web app is fully responsive and tested on phones, tablets, and desktops. No native app download required.',
  },
  {
    q: 'Can we run multiple branches on one account?',
    a: 'The Enterprise plan supports multi-location: each branch gets its own subdomain and data isolation, but a super-admin can view cross-location reports.',
  },
  {
    q: 'How long does initial setup take?',
    a: 'Technical setup — registering your hospital, creating accounts, configuring departments — takes under 5 minutes. Going live with your first patients is typically done the same day.',
  },
  {
    q: 'What support do you provide?',
    a: 'Starter includes email support (48h SLA). Growth adds priority email and chat (12h SLA). Enterprise includes a dedicated onboarding manager and custom SLA.',
  },
]

function FAQ() {
  return (
    <section className="py-20 px-4 sm:px-6" style={{ background: S1 }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Frequently asked questions</h2>
          <p className="text-base" style={{ color: S5 }}>
            Common questions from hospital administrators evaluating Uyirly.
          </p>
        </div>
        <div className="space-y-3">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group rounded-2xl overflow-hidden"
              style={{ background: '#fff', border: `1px solid ${S2}` }}>
              <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none select-none">
                <span className="font-semibold text-sm pr-4" style={{ color: S9 }}>{q}</span>
                <span className="text-lg flex-shrink-0 transition-transform group-open:rotate-45"
                  style={{ color: T }}>+</span>
              </summary>
              <div className="px-6 pb-5">
                <p className="text-sm leading-relaxed" style={{ color: S5 }}>{a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: '#fff', borderTop: `1px solid ${S2}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: T }}>
                <Building2 className="w-4 h-4" style={{ color: '#fff' }} />
              </div>
              <span className="text-base font-bold" style={{ color: S9 }}>Uyirly</span>
            </Link>
            <p className="text-sm leading-relaxed mb-4 max-w-xs" style={{ color: S5 }}>
              Hospital management software built for Indian healthcare teams. DPDP Act aligned. India data residency.
            </p>
            <a href="mailto:contact@uyirly.com" className="text-sm font-medium" style={{ color: T }}>
              contact@uyirly.com
            </a>
          </div>

          {/* Product */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: S4 }}>Product</p>
            <ul className="space-y-3">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Pricing',  href: '/pricing'  },
                { label: 'Security', href: '#'         },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm transition-colors" style={{ color: S5 }}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: S4 }}>Company</p>
            <ul className="space-y-3">
              {[
                { label: 'Terms',   href: '#'                        },
                { label: 'Privacy', href: '#'                        },
                { label: 'Contact', href: 'mailto:contact@uyirly.com' },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm transition-colors" style={{ color: S5 }}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: `1px solid ${S2}` }}>
          <p className="text-xs" style={{ color: S4 }}>© {new Date().getFullYear()} Uyirly. Made in India 🇮🇳</p>
          <p className="text-xs" style={{ color: S4 }}>14-day free trial · No credit card required</p>
        </div>
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
      <StatsBar />
      <BeforeAfter />
      <Features />
      <SocialProof />
      <DemoStrip />
      <Trust />
      <HowItWorks />
      <PricingTeaser />
      <FAQ />
      <Footer />
    </>
  )
}
