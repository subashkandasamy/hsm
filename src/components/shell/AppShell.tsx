'use client'

import { useState, useCallback } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import type { Role } from '@/lib/types'

interface AppShellProps {
  role: Role
  fullName: string
  tenantName: string
  enabledModules?: string[]
  children: React.ReactNode
}

export default function AppShell({ role, fullName, tenantName, enabledModules, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  return (
    <div className="min-h-screen">
      <Sidebar role={role} tenantName={tenantName} enabledModules={enabledModules} drawerOpen={drawerOpen} onClose={closeDrawer} />
      <TopBar fullName={fullName} role={role} tenantName={tenantName} onMenuClick={() => setDrawerOpen(true)} />
      {/* Main content: full-width on mobile, offset by sidebar on lg+ */}
      <main className="lg:ml-60 min-h-screen pb-16 md:pb-0"
        style={{ background: 'transparent', paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomTabBar role={role} enabledModules={enabledModules} />
    </div>
  )
}
