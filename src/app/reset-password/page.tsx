import { headers } from 'next/headers'
import ResetPasswordForm from './_components/ResetPasswordForm'

export const metadata = {
  title: 'Reset Password — Uyirly',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage() {
  const hdrs = await headers()
  const hospitalName = hdrs.get('x-tenant-name')
  return <ResetPasswordForm hospitalName={hospitalName} />
}
