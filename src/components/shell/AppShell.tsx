'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import type { Role } from '@/lib/types'
import type { PlanKey, TenantStatus } from '@/lib/plans'

interface AppShellProps {
  role: Role
  fullName: string
  tenantName: string
  enabledModules?: string[]
  plan?: PlanKey
  status?: TenantStatus
  children: React.ReactNode
}

export default function AppShell({
  role, fullName, tenantName, enabledModules,
  plan = 'starter', status = 'trial', children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  return (
    <div className="min-h-screen">
      <Sidebar
        role={role} tenantName={tenantName}
        enabledModules={enabledModules} plan={plan} status={status}
        drawerOpen={drawerOpen} onClose={closeDrawer}
      />
      <TopBar fullName={fullName} role={role} tenantName={tenantName} onMenuClick={() => setDrawerOpen(true)} />

      <main className="lg:ml-60 min-h-screen pb-safe-nav"
        style={{ background: 'transparent', paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>

        {/* Status banners */}
        {status === 'past_due' && (
          <div className="mx-4 md:mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#B45309' }}>
            ⚠️&nbsp;Your last payment failed.&nbsp;
            <Link href="/account/subscription" className="font-semibold underline">Update payment</Link>
            &nbsp;to avoid suspension.
          </div>
        )}
        {status === 'trial' && (
          <div className="mx-4 md:mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.18)', color: '#0F766E' }}>
            🎉&nbsp;Free trial — full access to all modules.&nbsp;
            <Link href="/account/subscription" className="font-semibold underline">Subscribe to keep access</Link>.
          </div>
        )}

        <div className="p-4 md:p-6">{children}</div>
      </main>

      <BottomTabBar role={role} enabledModules={enabledModules} />
    </div>
  )
}
