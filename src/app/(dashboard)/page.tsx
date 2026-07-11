export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'

export default function RootDashboardRedirect() {
  redirect('/dashboard')
}
