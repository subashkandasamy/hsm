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
    <div className="min-h-screen overflow-x-hidden">
      <div className="print:hidden">
        <Sidebar
          role={role} tenantName={tenantName}
          enabledModules={enabledModules} plan={plan} status={status}
          drawerOpen={drawerOpen} onClose={closeDrawer}
        />
      </div>
      <div className="print:hidden">
        <TopBar fullName={fullName} role={role} tenantName={tenantName} onMenuClick={() => setDrawerOpen(true)} />
      </div>

      <main className="lg:ml-60 min-w-0 min-h-screen pb-safe-nav print:ml-0 print:pt-0 print:pb-0 print:min-h-0"
        style={{ background: 'transparent', paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>

        {/* Status banners */}
        <div className="print:hidden">
          {status === 'past_due' && (
            <div className="mx-4 md:mx-6 mt-4 flex flex-wrap items-center gap-x-1 gap-y-1 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#B45309' }}>
              <span>⚠️ Your last payment failed.</span>
              <Link href="/account/subscription" className="font-semibold underline">Update payment</Link>
              <span>to avoid suspension.</span>
            </div>
          )}
          {status === 'trial' && (
            <div className="mx-4 md:mx-6 mt-4 flex flex-wrap items-center gap-x-1 gap-y-1 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.18)', color: '#0F766E' }}>
              <span>🎉 Free trial — full access to all modules.</span>
              <Link href="/account/subscription" className="font-semibold underline">Subscribe to keep access</Link>
            </div>
          )}
        </div>

        <div className="p-4 md:p-6 print:p-0">{children}</div>
      </main>

      <div className="print:hidden">
        <BottomTabBar role={role} enabledModules={enabledModules} />
      </div>
    </div>
  )
}
