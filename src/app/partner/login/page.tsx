import PartnerLoginClient from './_components/PartnerLoginClient'

export const metadata = { title: 'Partner Sign-in — Uyirly', robots: { index: false, follow: false } }

export default async function PartnerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <PartnerLoginClient hadError={!!error} />
}
