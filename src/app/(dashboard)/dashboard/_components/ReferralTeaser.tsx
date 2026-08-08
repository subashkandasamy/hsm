'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, ArrowRight } from 'lucide-react'
import { getMyReferralOverview } from '@/app/actions/referrals'
import { DEFAULT_COMMISSION_PCT } from '@/lib/referral'
import type { ReferralOverview } from '@/lib/types'

// Dashboard teaser — a tempting nudge with quick analytics that links to the
// full /referrals page. Keeps the dashboard itself free of the referral tooling.
export default function ReferralTeaser() {
  const [o, setO] = useState<ReferralOverview | null>(null)

  useEffect(() => {
    let active = true
    getMyReferralOverview().then((d) => { if (active) setO(d) }).catch(() => {})
    return () => { active = false }
  }, [])

  const pct = o?.commission_pct ?? DEFAULT_COMMISSION_PCT

  return (
    <Link href="/referrals" className="block mb-5">
      <div className="rounded-2xl p-5 text-white transition-transform hover:-translate-y-0.5"
        style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0891B2 100%)', boxShadow: '0 8px 24px rgba(13,148,136,0.25)' }}>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Gift className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base sm:text-lg font-bold leading-snug">Earn {pct}% every month — refer another hospital</p>
            <p className="text-sm text-white/90 mt-0.5">
              {o && o.referred_count > 0
                ? `You've referred ${o.referred_count} hospital${o.referred_count > 1 ? 's' : ''}${o.active_count > 0 ? ` · ${o.active_count} active` : ''}. Invite more and keep earning.`
                : `Invite a hospital or clinic to Uyirly and earn a recurring reward for as long as they stay.`}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
            style={{ background: '#fff', color: '#0D9488' }}>
            Refer &amp; earn <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}
