import { headers } from 'next/headers'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { getActorGrantedPermissions, getActorProfile } from '@/lib/server-utils'
import { canOpen } from '@/lib/routeAccess'
import { ROLE_LABEL, isGrantableRole } from '@/lib/access'

/**
 * Every dashboard page passes through here — on a typed address and on every
 * in-app navigation (a template, unlike a layout, renders again each time). A
 * person whose role, with anything an admin granted it, may not open this
 * area is told so, with a way home, instead of seeing the page or a server
 * error. (It used to send them to the dashboard without a word — BUG-005.)
 * The rules are in src/lib/routeAccess.ts.
 */
export default async function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get('x-pathname')
  if (path) {
    const actor = await getActorProfile().catch(() => null)
    if (actor && !canOpen(actor.role, path, await getActorGrantedPermissions().catch(() => []))) {
      const role = isGrantableRole(actor.role) ? ROLE_LABEL[actor.role] : actor.role
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <ShieldAlert className="w-6 h-6" style={{ color: '#B45309' }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: '#1E293B' }}>You don&apos;t have access to this page</h1>
          <p className="mt-2 text-sm max-w-md" style={{ color: '#64748B' }}>
            The {role} role can&apos;t open <span style={{ fontFamily: 'monospace' }}>{path}</span>. If your work needs it,
            ask your hospital admin to add it under Settings → Roles &amp; access.
          </p>
          <Link href="/dashboard" className="mt-5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#0D9488' }}>
            Go to my home page
          </Link>
        </div>
      )
    }
  }
  return <>{children}</>
}
