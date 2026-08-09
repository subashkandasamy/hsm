import PartnerResetClient from './_components/PartnerResetClient'
export const metadata = { title: 'Set password — Uyirly Partners', robots: { index: false, follow: false } }
export default async function PartnerResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <PartnerResetClient token={token ?? ''} />
}
