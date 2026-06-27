import { headers } from 'next/headers'
import OtpEntryForm from './_components/OtpEntryForm'

export const metadata = { title: 'Verify Identity — Uyirly' }

interface Props {
  searchParams: Promise<{ phone?: string }>
}

export default async function VerifyOtpPage({ searchParams }: Props) {
  const hdrs = await headers()
  const hospitalName = hdrs.get('x-tenant-name')
  const { phone } = await searchParams
  return <OtpEntryForm hospitalName={hospitalName} maskedPhone={phone} />
}
