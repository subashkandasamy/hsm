export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import { NAV_CONFIG } from '@/lib/rbac'
import { canOpen } from '@/lib/routeAccess'
import { getActorGrantedPermissions, getActorProfile } from '@/lib/server-utils'

// Was a "Coming in a later phase" placeholder (BUG-069). Every settings screen
// this person may open, from the same list the menu uses.
export default async function SettingsPage() {
  const actor = await getActorProfile()
  const granted = await getActorGrantedPermissions().catch(() => [])
  const items = NAV_CONFIG.flatMap((g) => g.items)
    .filter((i) => i.href.startsWith('/settings/') && canOpen(actor.role, i.href, granted))

  return (
    <div>
      <PageHeader title="Settings" subtitle="How this hospital is set up" />
      <GlassCard className="p-2">
        {items.length === 0 ? (
          <p className="text-sm p-6 text-center" style={{ color: '#64748B' }}>There are no settings your role can change.</p>
        ) : (
          <ul>
            {items.map((i, n) => (
              <li key={i.href} style={{ borderTop: n ? '1px solid #F1F5F9' : 'none' }}>
                <Link href={i.href} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
                  style={{ color: '#0F172A', minHeight: '44px' }}>
                  <span className="text-sm font-medium">{i.label}</span>
                  <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  )
}
