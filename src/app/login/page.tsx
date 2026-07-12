import { headers } from 'next/headers'
import LoginForm from './_components/LoginForm'

export const metadata = {
  title: 'Sign in — Uyirly',
  robots: { index: false, follow: false },
}

export default async function LoginPage() {
  const hdrs = await headers()
  const hospitalName = hdrs.get('x-tenant-name')

  if (hospitalName) {
    // Override the metadata title so the browser tab shows the hospital name
    // (Next.js metadata is evaluated at build/request time, so the dynamic
    //  hospital name is shown only in the rendered heading, not the <title> tag
    //  — acceptable for a subdomain SaaS.)
  }

  return <LoginForm hospitalName={hospitalName} />
}
