'use client'

import { useState } from 'react'
import { Gift, Copy, Check, Share2, IndianRupee, Building2, Users, TrendingUp } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import PageHeader from '@/components/ui/PageHeader'
import type { ReferralOverview } from '@/lib/types'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; c: string; label: string }> = {
    trial:    { bg: '#EFF6FF', c: '#2563EB', label: 'On trial' },
    active:   { bg: '#DCFCE7', c: '#15803D', label: 'Paying' },
    past_due: { bg: '#FEF9C3', c: '#B45309', label: 'Past due' },
    suspended:{ bg: '#FEE2E2', c: '#DC2626', label: 'Suspended' },
    cancelled:{ bg: '#F1F5F9', c: '#94A3B8', label: 'Cancelled' },
    purged:   { bg: '#F1F5F9', c: '#94A3B8', label: 'Closed' },
  }
  const s = map[status] ?? { bg: '#F1F5F9', c: '#64748B', label: status }
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.c }}>{s.label}</span>
}

export default function ReferralsClient({ overview }: { overview: ReferralOverview }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try { await navigator.clipboard.writeText(overview.referral_link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }
  const shareWhatsApp = () => {
    const msg = `We run our hospital on Uyirly — OPD, IPD, pharmacy, lab & billing in one place. Start a free 30-day trial here: ${overview.referral_link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div>
      <PageHeader title="Refer & Earn" subtitle="Invite another hospital and earn a recurring reward" />

      {/* Hero */}
      <div className="rounded-2xl p-6 sm:p-8 mb-5 text-white" style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0891B2 100%)' }}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Gift className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight">Earn {overview.commission_pct}% — every month</h2>
            <p className="text-sm sm:text-base text-white/90 mt-1.5 max-w-xl leading-relaxed">
              Know another hospital, nursing home or clinic that still runs on paper or spreadsheets? Refer them to Uyirly
              and earn <strong>{overview.commission_pct}% of their subscription {overview.duration_label}</strong>. You help a fellow
              hospital go digital — and get rewarded for it, automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Referral link */}
      <GlassCard className="p-5 mb-5">
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: SLATE4 }}>Your referral link</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={overview.referral_link}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: SLATE9 }} />
          <div className="flex gap-2">
            <button onClick={copy} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold flex-1 sm:flex-none"
              style={{ background: copied ? '#DCFCE7' : TEAL, color: copied ? '#15803D' : '#fff', border: 'none', cursor: 'pointer' }}>
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
            <button onClick={shareWhatsApp} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold flex-1 sm:flex-none"
              style={{ background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Share2 className="w-4 h-4" /> WhatsApp
            </button>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: SLATE4 }}>Your code: <span className="font-semibold" style={{ color: SLATE6 }}>{overview.referral_code}</span></p>
      </GlassCard>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {[
          { icon: Building2, label: 'Hospitals referred', value: String(overview.referred_count), color: TEAL },
          { icon: Users,     label: 'Currently active',   value: String(overview.active_count),   color: '#2563EB' },
          { icon: IndianRupee, label: 'Total earned',     value: `₹${overview.total_earned.toLocaleString('en-IN')}`, color: '#15803D' },
        ].map(({ icon: Icon, label, value, color }) => (
          <GlassCard key={label} className="p-4">
            <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4" style={{ color }} /><span className="text-xs" style={{ color: SLATE6 }}>{label}</span></div>
            <p className="text-2xl font-bold" style={{ color: SLATE9 }}>{value}</p>
          </GlassCard>
        ))}
      </div>

      {/* How it works */}
      <GlassCard className="p-5 mb-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: SLATE9 }}>How it works</h3>
        <ol className="space-y-3">
          {[
            'Share your referral link with another hospital or clinic.',
            `They sign up and start their free trial — we automatically credit the referral to you.`,
            `Once they subscribe, you earn ${overview.commission_pct}% of their subscription ${overview.duration_label}.`,
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(13,148,136,0.1)', color: TEAL }}>{i + 1}</span>
              <span className="text-sm leading-relaxed" style={{ color: SLATE6 }}>{t}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(13,148,136,0.05)', color: SLATE6 }}>
          <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
          <span>Rewards are recurring — you keep earning each month for as long as the hospital you referred stays subscribed.</span>
        </div>
      </GlassCard>

      {/* Referred hospitals */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <h3 className="text-sm font-semibold" style={{ color: SLATE9 }}>Hospitals you&apos;ve referred</h3>
        </div>
        {overview.referrals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
            <p className="text-sm" style={{ color: SLATE6 }}>No referrals yet — share your link to get started.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {overview.referrals.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: SLATE9 }}>{r.name}</p>
                  <p className="text-xs" style={{ color: SLATE4 }}>Joined {new Date(r.signup_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
