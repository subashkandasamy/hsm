import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2, CheckCircle, ArrowRight, X, Star, Activity,
  Stethoscope, BedDouble, FlaskConical, Scan, Pill, Scissors,
  Droplets, Receipt, ShieldPlus, Package, Users, Mic,
  Smartphone, Bell, LayoutGrid, Siren, FileText, IndianRupee,
} from 'lucide-react'
import ScrollReveal from '@/components/ui/ScrollReveal'

export const metadata: Metadata = {
  title: 'Uyirly — Hospital Management Software for India',
  description:
    'All-in-one hospital management software for Indian hospitals, nursing homes and clinics. Manage OPD, IPD, pharmacy, lab, radiology, OT, blood bank, billing and insurance from one cloud platform. DPDP Act aligned, data stored in India, native mobile app. Start a 30-day free trial — no credit card.',
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    title: 'Uyirly — Hospital Management Software for India',
    description:
      'Run your entire hospital on one platform — OPD to discharge, lab to pharmacy, billing to insurance. Built for Indian hospitals. DPDP Act aligned. 30-day free trial.',
  },
}

// ── Design tokens ──────────────────────────────────────────────────────────────
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

// ── Nav ────────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50"
      style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${S2}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: T }}>
            <Building2 className="w-4 h-4" style={{ color: '#fff' }} />
          </div>
          <span className="text-base font-bold" style={{ color: S9 }}>Uyirly</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: 'Features', href: '#features' },
            { label: 'Modules',  href: '#modules'  },
            { label: 'Pricing',  href: '/pricing'  },
          ].map(({ label, href }) => (
            <Link key={label} href={href}
              className="text-sm font-medium"
              style={{ color: S5, transition: 'color 0.2s' }}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/find-hospital" className="inline-flex text-sm font-medium px-2 sm:px-4 py-2 rounded-xl"
            style={{ color: S6 }}>
            Sign in
          </Link>
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: T, color: '#fff', boxShadow: '0 4px 14px rgba(13,148,136,0.3)', transition: 'box-shadow 0.2s' }}>
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ───────────────────────────────────────────────────────────────────────
function Hero() {
  const modules = ['OPD', 'IPD & Wards', 'Emergency', 'Lab', 'Radiology', 'Pharmacy', 'OT', 'Blood Bank', 'Billing', 'Insurance', 'HR', 'Inventory']

  return (
    <section className="relative overflow-hidden px-4 sm:px-6" style={{ paddingTop: '80px', paddingBottom: '100px', background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdfa 40%, #ffffff 100%)' }}>
      {/* Gradient overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(13,148,136,0.07) 0%, transparent 60%)' }} />

      {/* Floating orbs */}
      <div className="absolute top-16 left-[10%] w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.12) 0%, transparent 70%)', animation: 'floatY 7s ease-in-out infinite' }} />
      <div className="absolute top-32 right-[8%] w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)', animation: 'floatYSlow 9s ease-in-out infinite 1.5s' }} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-64 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(13,148,136,0.07) 0%, transparent 70%)' }} />

      <div className="max-w-4xl mx-auto text-center relative">
        {/* Animated badge */}
        <div style={{ animation: 'fadeInUp 0.6s ease both' }}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
            style={{ background: 'rgba(13,148,136,0.1)', color: TD, border: '1px solid rgba(13,148,136,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: T, animation: 'pulseDot 2s ease-in-out infinite' }} />
            India's most complete Hospital Management Platform
          </span>
        </div>

        {/* Headline */}
        <div style={{ animation: 'fadeInUp 0.6s ease 0.1s both' }}>
          <h1 className="font-bold tracking-tight mb-6" style={{ color: S9, fontSize: 'clamp(3.5rem, 8vw, 6.5rem)', lineHeight: 1.06 }}>
            Your hospital.<br />
            <span style={{
              background: `linear-gradient(135deg, ${T} 0%, #06B6D4 50%, ${T} 100%)`,
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradientMove 4s ease infinite',
            }}>
              One platform.
            </span>
          </h1>
        </div>

        <div style={{ animation: 'fadeInUp 0.6s ease 0.2s both' }}>
          <p className="max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: S5, fontSize: 'clamp(1.1rem, 2vw, 1.35rem)' }}>
            OPD to discharge, lab to pharmacy, billing to insurance — all connected in real time.
            Built for Indian hospitals. DPDP Act aligned. Native mobile app included.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14"
          style={{ animation: 'fadeInUp 0.6s ease 0.3s both' }}>
          <Link href="/signup?plan=starter"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold"
            style={{ background: T, color: '#fff', minHeight: '56px', boxShadow: '0 8px 28px rgba(13,148,136,0.35)', transition: 'transform 0.2s, box-shadow 0.2s' }}>
            Start free — 30 days <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/pricing"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold"
            style={{ color: S9, border: `1px solid ${S2}`, minHeight: '56px', background: 'rgba(255,255,255,0.8)', transition: 'border-color 0.2s' }}>
            View pricing
          </Link>
        </div>

        {/* Module pills — staggered */}
        <div className="flex flex-wrap justify-center gap-2" style={{ animation: 'fadeInUp 0.6s ease 0.4s both' }}>
          {modules.map((m, i) => (
            <span key={m}
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(255,255,255,0.75)',
                color: S5,
                border: `1px solid ${S2}`,
                backdropFilter: 'blur(8px)',
                animationDelay: `${0.45 + i * 0.04}s`,
              }}>
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Stats bar ──────────────────────────────────────────────────────────────────
const STATS = [
  { value: '15',   label: 'Integrated modules',       suffix: '' },
  { value: '50+',  label: 'Connected data tables',    suffix: '' },
  { value: '7',    label: 'Role-based access tiers',  suffix: '' },
  { value: '100%', label: 'India data residency',     suffix: '' },
]

function StatsBar() {
  return (
    <section style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)', borderTop: `1px solid rgba(13,148,136,0.1)`, borderBottom: `1px solid rgba(13,148,136,0.1)` }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map(({ value, label }, i) => (
          <ScrollReveal key={label} delay={i * 80}>
            <div className="text-center">
              <p className="text-3xl sm:text-4xl font-bold mb-1" style={{ color: T }}>{value}</p>
              <p className="text-sm" style={{ color: S5 }}>{label}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}

// ── All Modules grid ───────────────────────────────────────────────────────────
const ALL_MODULES = [
  { icon: <Stethoscope className="w-5 h-5" />, name: 'OPD',           desc: 'Appointments, queues, prescriptions, ICD codes' },
  { icon: <BedDouble className="w-5 h-5" />,   name: 'IPD & Wards',   desc: 'Bed management, ward board, daily notes' },
  { icon: <Siren className="w-5 h-5" />,        name: 'Emergency',     desc: 'Triage, rapid registration, case tracking' },
  { icon: <FlaskConical className="w-5 h-5" />, name: 'Laboratory',    desc: 'Orders, results, abnormal flagging' },
  { icon: <Scan className="w-5 h-5" />,         name: 'Radiology',     desc: 'X-ray, CT, MRI ordering and reporting' },
  { icon: <Pill className="w-5 h-5" />,         name: 'Pharmacy',      desc: 'FEFO dispensing, POS billing, stock alerts' },
  { icon: <Scissors className="w-5 h-5" />,     name: 'Operation Theatre', desc: 'Scheduling, consumables, OT records' },
  { icon: <Droplets className="w-5 h-5" />,     name: 'Blood Bank',    desc: 'Inventory, cross-matching, issue tracking' },
  { icon: <Receipt className="w-5 h-5" />,      name: 'Billing',       desc: 'Auto-bills, advance deposits, combined bills' },
  { icon: <ShieldPlus className="w-5 h-5" />,   name: 'Insurance',     desc: 'TPA claims, pre-auth, status tracking' },
  { icon: <Package className="w-5 h-5" />,      name: 'Inventory',     desc: 'Stock levels, reorder alerts, FEFO logic' },
  { icon: <Users className="w-5 h-5" />,        name: 'HR & Payroll',  desc: 'Staff management, attendance, shifts' },
  { icon: <Bell className="w-5 h-5" />,         name: 'Notifications', desc: 'WhatsApp & SMS alerts to patients & staff' },
  { icon: <Mic className="w-5 h-5" />,          name: 'Speech-to-Text', desc: 'Dictate clinical notes hands-free in OPD & IPD' },
  { icon: <Smartphone className="w-5 h-5" />,   name: 'Mobile App',    desc: 'Native iOS & Android via Capacitor' },
]

function ModulesGrid() {
  return (
    <section id="modules" className="py-24 px-4 sm:px-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f0fdfa 60%, #ecfdf5 100%)' }}>
      {/* Subtle teal glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-48 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(13,148,136,0.1) 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto relative">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-widest mb-3 block" style={{ color: T }}>
              Everything in one place
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
              15 modules. Zero silos.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: S5 }}>
              Every department connected. Data flows automatically so your team never enters the same thing twice.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ALL_MODULES.map(({ icon, name, desc }, i) => (
            <ScrollReveal key={name} delay={i * 40}>
              <div className="hover-lift rounded-2xl p-4"
                style={{
                  background: '#fff',
                  border: `1px solid ${S2}`,
                  boxShadow: '0 2px 8px rgba(13,148,136,0.05)',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(13,148,136,0.1)', color: T, border: '1px solid rgba(13,148,136,0.2)' }}>
                  {icon}
                </div>
                <p className="text-sm font-semibold mb-1" style={{ color: S9 }}>{name}</p>
                <p className="text-xs leading-relaxed" style={{ color: S5 }}>{desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Before / After ─────────────────────────────────────────────────────────────
const BEFORE = [
  'Patients queuing with no idea of wait time',
  'Lab results on paper, lost before the doctor sees them',
  'Pharmacy dispensing without checking real-time stock',
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
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 50%, #ffffff 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(13,148,136,0.06) 0%, transparent 60%)' }} />

      <div className="max-w-6xl mx-auto relative">
        <ScrollReveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
              Before Uyirly. After Uyirly.
            </h2>
            <p className="text-base" style={{ color: S5 }}>
              See what changes when every module talks to every other module.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ScrollReveal direction="left">
            <div className="hover-lift rounded-2xl p-8 h-full"
              style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
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
          </ScrollReveal>

          <ScrollReveal direction="right">
            <div className="hover-lift rounded-2xl p-8 h-full"
              style={{ background: TLL, border: '1px solid rgba(13,148,136,0.2)', boxShadow: '0 2px 16px rgba(13,148,136,0.08)' }}>
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
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}

// ── Feature mock panels ────────────────────────────────────────────────────────
function ClinicalMock() {
  const rows = [
    { token: '01', name: 'Rajesh Kumar',    uhid: 'UH-2024-0311', status: 'In Progress', active: true  },
    { token: '02', name: 'Priya Sharma',    uhid: 'UH-2024-0312', status: 'Waiting',     active: false },
    { token: '03', name: 'Mohammed Aslam',  uhid: 'UH-2024-0313', status: 'Waiting',     active: false },
    { token: '04', name: 'Anitha Devi',     uhid: 'UH-2024-0314', status: 'Waiting',     active: false },
  ]
  return (
    <div className="hover-lift rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.07)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>OPD Queue — Today</p>
          <p className="text-xs mt-0.5" style={{ color: S4 }}>General Medicine · Dr. Krishnan</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: 'rgba(13,148,136,0.1)', color: T }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: T, animation: 'pulseDot 2s ease-in-out infinite' }} />
          4 waiting
        </span>
      </div>
      {rows.map(({ token, name, uhid, status, active }) => (
        <div key={token} className="px-5 py-3.5 flex items-center gap-4"
          style={{ borderBottom: `1px solid ${S2}`, background: active ? 'rgba(13,148,136,0.03)' : '#fff' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: active ? 'rgba(13,148,136,0.12)' : S1, color: active ? T : S5, border: `1px solid ${active ? 'rgba(13,148,136,0.2)' : S2}` }}>
            {token}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: S9 }}>{name}</p>
            <p className="text-xs mt-0.5" style={{ color: S4 }}>{uhid}</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
            style={{ background: active ? 'rgba(13,148,136,0.1)' : 'rgba(245,158,11,0.1)', color: active ? T : '#B45309' }}>
            {status}
          </span>
        </div>
      ))}
    </div>
  )
}

function DiagnosticsMock() {
  const tests = [
    { name: 'Haemoglobin',     value: '13.2 g/dL', range: '13–17',   ok: true  },
    { name: 'Fasting Glucose', value: '118 mg/dL',  range: '70–100',  ok: false },
    { name: 'Serum Creatinine',value: '0.9 mg/dL',  range: '0.7–1.3', ok: true  },
    { name: 'WBC Count',       value: '7.4 K/µL',   range: '4–11',    ok: true  },
  ]
  return (
    <div className="hover-lift rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.07)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>Lab Report</p>
          <p className="text-xs mt-0.5" style={{ color: S4 }}>Priya Sharma · UH-2024-0312 · Blood Panel</p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: '#FEF3C7', color: '#B45309' }}>
          1 abnormal
        </span>
      </div>
      {tests.map(({ name, value, range, ok }) => (
        <div key={name} className="px-5 py-3.5 grid grid-cols-3 gap-2 items-center"
          style={{ borderBottom: `1px solid ${S2}`, background: ok ? '#fff' : '#FFFBEB' }}>
          <div>
            <p className="text-xs font-medium" style={{ color: S9 }}>{name}</p>
            <p className="text-xs mt-0.5" style={{ color: S4 }}>Ref: {range}</p>
          </div>
          <p className="text-sm font-bold text-center" style={{ color: ok ? S9 : '#D97706' }}>{value}</p>
          <span className="text-xs font-semibold text-right" style={{ color: ok ? T : '#D97706' }}>
            {ok ? 'Normal' : 'High'}
          </span>
        </div>
      ))}
    </div>
  )
}

function BillingMock() {
  const lines = [
    { label: 'OPD Consultation',        qty: '1',  amount: '₹500'   },
    { label: 'Blood Panel (6 tests)',    qty: '6',  amount: '₹1,200' },
    { label: 'Pharmacy — Metformin 500', qty: '30', amount: '₹180'   },
    { label: 'Radiology — Chest X-ray', qty: '1',  amount: '₹650'   },
  ]
  return (
    <div className="hover-lift rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.07)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>Invoice #BILL-2024-00183</p>
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
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ background: 'rgba(13,148,136,0.04)', borderTop: '2px solid rgba(13,148,136,0.15)' }}>
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

function SpeechMock() {
  return (
    <div className="hover-lift rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 4px 32px rgba(0,0,0,0.07)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: S1, borderBottom: `1px solid ${S2}` }}>
        <div>
          <p className="text-xs font-bold" style={{ color: S9 }}>OPD Consultation — Clinical Notes</p>
          <p className="text-xs mt-0.5" style={{ color: S4 }}>Dr. Krishnan · Rajesh Kumar · UH-2024-0311</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', animation: 'pulseDot 1.2s ease-in-out infinite' }}>
          <Mic className="w-3 h-3" /> Recording
        </span>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: S4 }}>CHIEF COMPLAINT</p>
          <p className="text-sm" style={{ color: S9 }}>Patient presents with persistent cough for 5 days, mild fever and sore throat.</p>
        </div>
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: S4 }}>DIAGNOSIS</p>
          <p className="text-sm" style={{ color: S9 }}>Upper respiratory tract infection — J06.9</p>
        </div>
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: S4 }}>NOTES</p>
          <p className="text-sm" style={{ color: S9 }}>
            Prescribed antibiotic course for 5 days.{' '}
            <span className="italic" style={{ color: T }}>🎤 Review after 3 days if no improvement…</span>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Feature rows ───────────────────────────────────────────────────────────────
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
      <ScrollReveal className="w-full md:w-1/2" direction={reverse ? 'right' : 'left'}>
        {visual}
      </ScrollReveal>
      <ScrollReveal className="w-full md:w-1/2" direction={reverse ? 'left' : 'right'} delay={100}>
        <div>
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
      </ScrollReveal>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 relative" style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f0fdfa 50%, #ecfdf5 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(13,148,136,0.04) 0%, transparent 50%)' }} />

      <div className="max-w-6xl mx-auto space-y-28 relative">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
              Every department. One system.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: S5 }}>
              Modules built around real clinical workflows — not retrofitted from generic SaaS.
            </p>
          </div>
        </ScrollReveal>

        <FeatureRow
          visual={<ClinicalMock />}
          eyebrow="Clinical Core"
          heading="Registration to discharge — no double entry"
          body="Patients get a permanent UHID on first visit. Doctors record vitals, diagnoses, ICD codes, and prescriptions in one screen. Full clinical timeline per patient — every visit, lab result, admission, and allergy in one place."
          tags={['OPD Queue', 'Patient UHID', 'IPD Admission', 'Discharge Summary', 'Clinical Timeline', 'Allergy Tracking']}
        />

        <FeatureRow
          visual={<DiagnosticsMock />}
          eyebrow="Diagnostics & Treatment"
          heading="Lab, radiology, pharmacy — all talking to each other"
          body="Doctors order from the visit screen. Lab enters results once — visible to everyone with access. Pharmacy dispenses with FEFO logic and live stock. OT scheduling prevents room conflicts. Blood bank tracks inventory and cross-match results."
          tags={['Lab Orders', 'Radiology Reports', 'FEFO Dispensing', 'OT Scheduling', 'Blood Bank', 'Stock Alerts']}
          reverse
        />

        <FeatureRow
          visual={<BillingMock />}
          eyebrow="Billing & Finance"
          heading="Bills that build themselves"
          body="Consultation fees, lab charges, pharmacy items, OT time, room rent — pulled automatically into a single combined bill. Advance deposits tracked per admission. Insurance claims file in-platform with full TPA tracking."
          tags={['Auto Billing', 'Combined Bills', 'Advance Deposits', 'Insurance Claims', 'TPA Integration', 'POS Pharmacy']}
        />

        <FeatureRow
          visual={<SpeechMock />}
          eyebrow="Clinical Intelligence"
          heading="Dictate notes hands-free"
          body="Doctors can speak their clinical notes directly into the system — chief complaint, diagnosis, and clinical notes transcribe in real time. No typing while maintaining eye contact with patients. Works in OPD and IPD progress notes."
          tags={['Speech-to-Text', 'Real-time Transcription', 'OPD Notes', 'IPD Progress Notes', 'Discharge Summary', 'Chrome & Android']}
          reverse
        />
      </div>
    </section>
  )
}

// ── Mobile section ─────────────────────────────────────────────────────────────
function MobileSection() {
  const points = [
    { icon: <Stethoscope className="w-4 h-4" />, text: 'Full OPD & IPD access from the ward' },
    { icon: <Bell className="w-4 h-4" />,        text: 'Push notifications for orders and alerts' },
    { icon: <FileText className="w-4 h-4" />,    text: 'Dictate notes on the go with speech-to-text' },
    { icon: <IndianRupee className="w-4 h-4" />, text: 'Billing and advance collection at bedside' },
    { icon: <LayoutGrid className="w-4 h-4" />,  text: 'Live ward board — bed status at a glance' },
  ]
  return (
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 60%, #ecfdf5 100%)' }}>
      <div className="absolute top-1/2 right-0 w-96 h-96 -translate-y-1/2 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto relative">
        <div className="flex flex-col md:flex-row items-center gap-14">

          {/* Left: content */}
          <ScrollReveal className="w-full md:w-1/2" direction="left">
            <span className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: T }}>
              <Smartphone className="w-3.5 h-3.5" /> Native Mobile App
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: S9 }}>
              Your HMS in your pocket
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: S5 }}>
              Uyirly ships as a native iOS and Android app. Nurses check vitals at the bedside.
              Doctors review labs between consultations. Everything syncs in real time.
            </p>
            <ul className="space-y-3 mb-8">
              {points.map(({ icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(13,148,136,0.1)', color: T, border: `1px solid rgba(13,148,136,0.2)` }}>
                    {icon}
                  </div>
                  <span className="text-sm" style={{ color: S6 }}>{text}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 flex-wrap">
              {['🍎 iOS', '🤖 Android', '🌐 Web'].map(label => (
                <span key={label} className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(13,148,136,0.08)', color: TD, border: '1px solid rgba(13,148,136,0.18)' }}>
                  {label}
                </span>
              ))}
            </div>
          </ScrollReveal>

          {/* Right: phone mockup */}
          <ScrollReveal className="w-full md:w-1/2" direction="right" delay={100}>
            <div className="relative mx-auto" style={{ maxWidth: '340px' }}>
              <div className="rounded-3xl p-1 mx-auto"
                style={{ background: `linear-gradient(145deg, ${TL}, rgba(204,251,241,0.3))`, border: `1px solid rgba(13,148,136,0.2)`, boxShadow: '0 24px 64px rgba(13,148,136,0.12)', animation: 'floatYSlow 5s ease-in-out infinite' }}>
                <div className="rounded-2xl overflow-hidden" style={{ background: '#fff' }}>
                  {/* Phone status bar */}
                  <div className="px-5 py-3 flex items-center justify-between"
                    style={{ background: TLL, borderBottom: `1px solid ${S2}` }}>
                    <span className="text-xs font-bold" style={{ color: T }}>Uyirly</span>
                    <span className="text-xs" style={{ color: S4 }}>9:41 AM</span>
                  </div>
                  {/* Mini ward board */}
                  <div className="p-4 space-y-2" style={{ background: S1 }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: S4 }}>Ward Board — ICU</p>
                    {[
                      { bed: 'ICU-1', name: 'R. Kumar',   status: 'Critical',  color: '#DC2626' },
                      { bed: 'ICU-2', name: 'P. Sharma',  status: 'Stable',    color: T },
                      { bed: 'ICU-3', name: 'M. Aslam',   status: 'Improving', color: '#F59E0B' },
                      { bed: 'ICU-4', name: '—',           status: 'Available', color: S4 },
                    ].map(({ bed, name, status, color }) => (
                      <div key={bed} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        style={{ background: '#fff', border: `1px solid ${S2}` }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: S9 }}>{bed} · {name}</p>
                        </div>
                        <span className="text-xs font-medium" style={{ color }}>{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}

// ── Social proof ───────────────────────────────────────────────────────────────
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
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 50%, #ecfdf5 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(13,148,136,0.08) 0%, transparent 60%)' }} />

      <div className="max-w-6xl mx-auto relative">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: S9 }}>
              Hospitals running on Uyirly
            </h2>
            <p className="text-base" style={{ color: S5 }}>Real teams, real clinical environments.</p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ quote, name, role, stars }, i) => (
            <ScrollReveal key={name} delay={i * 100}>
              <div className="hover-lift rounded-2xl p-7 flex flex-col gap-5 h-full"
                style={{ background: '#fff', border: `1px solid ${S2}`, boxShadow: '0 2px 16px rgba(13,148,136,0.06)' }}>
                <div className="flex gap-1">
                  {Array.from({ length: stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-current" style={{ color: '#F59E0B' }} />
                  ))}
                </div>
                <p className="text-sm leading-relaxed flex-1" style={{ color: S6 }}>"{quote}"</p>
                <div>
                  <p className="text-sm font-bold" style={{ color: S9 }}>{name}</p>
                  <p className="text-xs mt-0.5" style={{ color: S4 }}>{role}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Demo strip ─────────────────────────────────────────────────────────────────
function DemoStrip() {
  return (
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${T} 0%, #0891B2 50%, ${TD} 100%)`, backgroundSize: '200% 200%', animation: 'gradientMove 6s ease infinite' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
      <ScrollReveal>
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
              style={{ background: '#fff', color: TD, minHeight: '52px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', transition: 'transform 0.2s' }}>
              Start free trial <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="mailto:contact@uyirly.com"
              className="w-full sm:w-auto flex items-center justify-center px-8 py-4 rounded-2xl text-base font-semibold"
              style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)', minHeight: '52px', transition: 'background 0.2s' }}>
              Talk to us
            </a>
          </div>
        </div>
      </ScrollReveal>
    </section>
  )
}

// ── Trust pillars ──────────────────────────────────────────────────────────────
const TRUST_ITEMS = [
  { emoji: '🇮🇳', title: 'India data residency',   desc: 'All patient data on Indian servers. No cross-border transfer.' },
  { emoji: '🔒',  title: 'Encrypted end-to-end',   desc: 'AES-256 at rest, TLS 1.3 in transit. Managed key rotation.' },
  { emoji: '📋',  title: 'DPDP Act aligned',        desc: 'Consent flags, purpose limitation, and erasure support built in.' },
  { emoji: '📊',  title: 'Tamper-proof audit trail', desc: 'Every change logged with actor and timestamp. Immutable.' },
]

function Trust() {
  return (
    <section className="py-20 px-4 sm:px-6" style={{ background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdfa 50%, #ffffff 100%)' }}>
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Security without compromise</h2>
            <p className="text-base max-w-lg mx-auto" style={{ color: S5 }}>
              Compliance isn't an add-on. It's in the foundation.
            </p>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TRUST_ITEMS.map(({ emoji, title, desc }, i) => (
            <ScrollReveal key={title} delay={i * 80}>
              <div className="hover-lift rounded-2xl p-6 text-center h-full"
                style={{ background: S1, border: `1px solid ${S2}`, transition: 'border-color 0.2s' }}>
                <div className="text-4xl mb-4">{emoji}</div>
                <h3 className="font-bold text-sm mb-2" style={{ color: S9 }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: S5 }}>{desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ───────────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', title: 'Sign up',           desc: 'Register your hospital, pick a plan, and get your own subdomain — in under 2 minutes.' },
  { num: '02', title: 'Onboard your team', desc: 'Add doctors, nurses, and support staff with role-based access. Each role sees only what they need.' },
  { num: '03', title: 'Go live',           desc: 'Start booking appointments, recording visits, dispensing medicines, and generating bills the same day.' },
]

function HowItWorks() {
  return (
    <section className="py-20 px-4 sm:px-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f0fdfa 50%, #ecfdf5 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(13,148,136,0.06) 0%, transparent 60%)' }} />

      <div className="max-w-4xl mx-auto relative">
        <ScrollReveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Three steps to go live</h2>
            <p className="text-base" style={{ color: S5 }}>From sign-up to seeing patients — no IT team required.</p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-7 left-[calc(16.666%+28px)] right-[calc(16.666%+28px)] h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${TL}, ${TL}, transparent)` }} />

          {STEPS.map(({ num, title, desc }, i) => (
            <ScrollReveal key={num} delay={i * 120}>
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-xl font-bold relative z-10"
                  style={{ background: `linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.06))`, color: T, border: '1px solid rgba(13,148,136,0.2)', boxShadow: '0 4px 16px rgba(13,148,136,0.12)' }}>
                  {num}
                </div>
                <h3 className="font-bold text-lg mb-2" style={{ color: S9 }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: S5 }}>{desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal>
          <div className="text-center mt-12">
            <Link href="/signup"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold"
              style={{ background: T, color: '#fff', boxShadow: '0 4px 16px rgba(13,148,136,0.3)' }}>
              Get started now <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

// ── Pricing teaser ─────────────────────────────────────────────────────────────
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
    <section className="py-24 px-4 sm:px-6" style={{ background: 'linear-gradient(160deg, #f0fdfa 0%, #ffffff 50%, #ecfdf5 100%)' }}>
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Simple, flat pricing</h2>
            <p className="text-base" style={{ color: S5 }}>30-day free trial on all plans. No credit card required.</p>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(({ name, price, desc, features, href, cta, highlight }, i) => (
            <ScrollReveal key={name} delay={i * 80}>
              <div className="hover-lift rounded-2xl p-7 flex flex-col gap-5 relative h-full"
                style={{
                  background: '#fff',
                  border: highlight ? `2px solid ${T}` : `1px solid ${S2}`,
                  boxShadow: highlight ? `0 0 0 4px rgba(13,148,136,0.08), 0 8px 32px rgba(13,148,136,0.12)` : '0 2px 12px rgba(0,0,0,0.04)',
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
                    transition: 'opacity 0.2s',
                  }}>
                  {cta} {cta !== 'Contact us' && <ArrowRight className="w-4 h-4" />}
                </Link>
              </div>
            </ScrollReveal>
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

// ── FAQ ────────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Is patient data stored in India?',
    a: 'Yes. All data is stored on Indian servers through our infrastructure partner. No patient data leaves India.' },
  { q: 'Does Uyirly comply with the DPDP Act 2023?',
    a: 'We have built DPDP-aligned controls into the platform: patient consent capture, purpose-limited data access, audit trails, and a data erasure workflow.' },
  { q: 'Can I migrate data from our existing software?',
    a: 'Growth and Enterprise plans include assisted data migration for patient records and historical bills. We support CSV import and can work with exports from most Indian HIS systems.' },
  { q: 'What happens when the 30-day trial ends?',
    a: "You'll receive reminders before the trial ends. If you don't subscribe, your data is retained for 30 days and then deleted. No automatic charges." },
  { q: 'Does it work on mobile and tablets?',
    a: 'Yes. The web app is fully responsive. A native iOS and Android app is also available — the same system, optimised for mobile workflows like bedside nursing and ward rounds.' },
  { q: 'Can we run multiple branches on one account?',
    a: 'The Enterprise plan supports multi-location: each branch gets its own subdomain and data isolation, but a super-admin can view cross-location reports.' },
  { q: 'How long does initial setup take?',
    a: 'Technical setup takes under 5 minutes. Going live with your first patients is typically done the same day.' },
  { q: 'What support do you provide?',
    a: 'Starter includes email support (48h SLA). Growth adds priority email and chat (12h SLA). Enterprise includes a dedicated onboarding manager and custom SLA.' },
]

function FAQ() {
  return (
    <section className="py-20 px-4 sm:px-6" style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 50%, #ffffff 100%)' }}>
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3" style={{ color: S9 }}>Frequently asked questions</h2>
            <p className="text-base" style={{ color: S5 }}>Common questions from hospital administrators evaluating Uyirly.</p>
          </div>
        </ScrollReveal>
        <div className="space-y-3">
          {FAQS.map(({ q, a }, i) => (
            <ScrollReveal key={q} delay={i * 40}>
              <details className="group rounded-2xl overflow-hidden"
                style={{ background: '#fff', border: `1px solid ${S2}`, transition: 'border-color 0.2s' }}>
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none select-none">
                  <span className="font-semibold text-sm pr-4" style={{ color: S9 }}>{q}</span>
                  <span className="text-lg flex-shrink-0"
                    style={{ color: T, transition: 'transform 0.25s', display: 'inline-block' }}>
                    +
                  </span>
                </summary>
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed" style={{ color: S5 }}>{a}</p>
                </div>
              </details>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: 'linear-gradient(160deg, #f0fdfa 0%, #ecfdf5 100%)', borderTop: `1px solid rgba(13,148,136,0.12)` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: T }}>
                <Building2 className="w-4 h-4" style={{ color: '#fff' }} />
              </div>
              <span className="text-base font-bold" style={{ color: S9 }}>Uyirly</span>
            </Link>
            <p className="text-sm leading-relaxed mb-4 max-w-xs" style={{ color: S5 }}>
              Hospital management software built for Indian healthcare teams. 15 integrated modules. DPDP Act aligned.
            </p>
            <a href="mailto:contact@uyirly.com" className="text-sm font-medium" style={{ color: T }}>
              contact@uyirly.com
            </a>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: S4 }}>Product</p>
            <ul className="space-y-3">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Modules',  href: '#modules'  },
                { label: 'Pricing',  href: '/pricing'  },
                { label: 'Security', href: '/security' },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm" style={{ color: S5, transition: 'color 0.2s' }}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: S4 }}>Company</p>
            <ul className="space-y-3">
              {[
                { label: 'Terms',   href: '/terms'                    },
                { label: 'Privacy', href: '/privacy'                  },
                { label: 'Contact', href: 'mailto:contact@uyirly.com' },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm" style={{ color: S5, transition: 'color 0.2s' }}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: `1px solid ${S2}` }}>
          <p className="text-xs" style={{ color: S4 }}>© {new Date().getFullYear()} Uyirly. Made in India 🇮🇳</p>
          <p className="text-xs" style={{ color: S4 }}>30-day free trial · No credit card required</p>
        </div>
      </div>
    </footer>
  )
}

// ── Structured data (JSON-LD) ──────────────────────────────────────────────────
const SITE = 'https://uyirly.com'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Uyirly',
      url: SITE,
      logo: `${SITE}/icons/icon-512.png`,
      description:
        'All-in-one hospital management software built for Indian hospitals, nursing homes and clinics.',
      areaServed: { '@type': 'Country', name: 'India' },
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'contact@uyirly.com',
        contactType: 'sales',
        areaServed: 'IN',
        availableLanguage: ['English', 'Hindi', 'Tamil'],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'Uyirly',
      publisher: { '@id': `${SITE}/#organization` },
      inLanguage: 'en-IN',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#software`,
      name: 'Uyirly Hospital Management Software',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Hospital Management System',
      operatingSystem: 'Web, iOS, Android',
      url: SITE,
      publisher: { '@id': `${SITE}/#organization` },
      description:
        'Cloud hospital management software covering OPD, IPD, emergency, lab, radiology, pharmacy, operation theatre, blood bank, billing, insurance, HR and inventory. DPDP Act aligned, data stored in India.',
      featureList: [
        'OPD management', 'IPD & ward management', 'Emergency', 'Laboratory (LIS)',
        'Radiology', 'Pharmacy', 'Operation theatre', 'Blood bank',
        'Billing & GST invoicing', 'Insurance & TPA', 'HR & rostering', 'Inventory',
      ],
      offers: [
        {
          '@type': 'Offer',
          name: 'Starter',
          price: '2999',
          priceCurrency: 'INR',
          description: 'Flat monthly plan for small hospitals and clinics. 30-day free trial.',
          url: `${SITE}/pricing`,
        },
        {
          '@type': 'Offer',
          name: 'Growth',
          price: '7999',
          priceCurrency: 'INR',
          description: 'For growing multi-department hospitals. 30-day free trial.',
          url: `${SITE}/pricing`,
        },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE}/#faq`,
      mainEntity: FAQS.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ],
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main>
        <Hero />
        <StatsBar />
        <ModulesGrid />
        <BeforeAfter />
        <Features />
        <MobileSection />
        <SocialProof />
        <DemoStrip />
        <Trust />
        <HowItWorks />
        <PricingTeaser />
        <FAQ />
      </main>
      <Footer />
    </>
  )
}
