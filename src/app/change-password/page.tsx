import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getCachedUser } from '@/lib/supabase/cached-user'
import ChangePasswordForm from './_components/ChangePasswordForm'

export const metadata = {
  title: 'Set your password — Uyirly',
  robots: { index: false, follow: false },
}

export default async function ChangePasswordPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const hdrs = await headers()
  const hospitalName = hdrs.get('x-tenant-name')
  return <ChangePasswordForm hospitalName={hospitalName} />
}
