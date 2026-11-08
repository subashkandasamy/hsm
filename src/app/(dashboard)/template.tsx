import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getActorGrantedPermissions, getActorProfile } from '@/lib/server-utils'
import { canOpen } from '@/lib/routeAccess'

/**
 * Every dashboard page passes through here — on a typed address and on every
 * in-app navigation (a template, unlike a layout, renders again each time). A
 * person whose role, with anything an admin granted it, may not open this
 * area goes to their home page instead of seeing it or a server error.
 * The rules are in src/lib/routeAccess.ts.
 */
export default async function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get('x-pathname')
  if (path) {
    const actor = await getActorProfile().catch(() => null)
    if (actor && !canOpen(actor.role, path, await getActorGrantedPermissions().catch(() => []))) redirect('/dashboard')
  }
  return <>{children}</>
}
