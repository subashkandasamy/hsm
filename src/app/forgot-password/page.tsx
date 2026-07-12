import { headers } from 'next/headers'
import ForgotPasswordForm from './_components/ForgotPasswordForm'

export const metadata = {
  title: 'Forgot Password — Uyirly',
  robots: { index: false, follow: false },
}

export default async function ForgotPasswordPage() {
  const hdrs = await headers()
  const hospitalName = hdrs.get('x-tenant-name')
  return <ForgotPasswordForm hospitalName={hospitalName} />
}
