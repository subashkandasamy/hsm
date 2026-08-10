import PatientResetForm from './PatientResetForm'

export const metadata = { title: 'Reset password — Uyirly', robots: { index: false, follow: false } }

export default async function PatientResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <PatientResetForm token={token ?? ''} />
}
