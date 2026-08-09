import type { Metadata } from 'next'
import PartnerRegisterClient from './_components/PartnerRegisterClient'

const SITE = 'https://www.uyirly.com'

export const metadata: Metadata = {
  title: 'Become a Partner — Uyirly',
  description: 'Join the Uyirly partner program — refer hospitals and clinics and earn a recurring commission on every subscription.',
  alternates: { canonical: `${SITE}/partner/register` },
}

export default function PartnerRegisterPage() {
  return <PartnerRegisterClient />
}
