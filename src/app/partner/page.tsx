export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Gift } from 'lucide-react'
import { getPartnerPortalData, signOutPartner } from '@/app/actions/partnerAuth'
import ReferralsClient from '@/app/(dashboard)/referrals/_components/ReferralsClient'
import PartnerBankDetails from './_components/PartnerBankDetails'

export const metadata = { title: 'Partner Dashboard — Uyirly', robots: { index: false, follow: false } }

export default async function PartnerPortalPage() {
  const data = await getPartnerPortalData()
  if (!data) redirect('/partner/login')

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <header className="flex items-center justify-between px-4 sm:px-6 py-3" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.1)' }}>
            <Gift className="w-5 h-5" style={{ color: '#0D9488' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Uyirly Partners</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>{data.name}</p>
          </div>
        </div>
        <form action={signOutPartner}>
          <button type="submit" className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Sign out</button>
        </form>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <ReferralsClient overview={data.overview} />
        <PartnerBankDetails owed={data.owed} paid={data.paid} payout={data.payout} />
      </main>
    </div>
  )
}
