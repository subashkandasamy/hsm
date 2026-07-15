'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, CalendarDays, FlaskConical, Pill,
  Receipt, UserCog, ClipboardList, Settings, Building2, Stethoscope,
  LayoutGrid, BedDouble, Siren, Scan, Scissors, Droplets, ShieldPlus, Warehouse, Bell,
  ToggleLeft, CreditCard, BadgeDollarSign, Lock, CalendarClock,
  type LucideProps,
} from 'lucide-react'
import { NAV_CONFIG, hasPermission } from '@/lib/rbac'
import { planHasModule, isGrowthOnly } from '@/lib/plans'
import type { Role, Permission } from '@/lib/types'
import type { PlanKey, TenantStatus } from '@/lib/plans'

type IconComp = React.ComponentType<LucideProps>

const ICON_MAP: Record<string, IconComp> = {
  LayoutDashboard, Users, CalendarDays, FlaskConical, Pill,
  Receipt, UserCog, ClipboardList, Settings, Stethoscope,
  LayoutGrid, BedDouble, Siren, Scan, Scissors, Droplets, ShieldPlus,
  Bell, Warehouse, ToggleLeft, CreditCard, Building2, BadgeDollarSign, CalendarClock,
}

function NavIcon({ name }: { name: string }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon className="w-4 h-4" />
}

interface SidebarProps {
  role: Role
  tenantName: string
  enabledModules?: string[]
  plan?: PlanKey
  status?: TenantStatus
  drawerOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({
  role, tenantName, enabledModules,
  plan = 'starter', status = 'trial',
  drawerOpen = false, onClose,
}: SidebarProps) {
  const pathname = usePathname()

  useEffect(() => { onClose?.() }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen, onClose])

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 border-b"
        style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))', paddingBottom: '1.25rem', borderColor: '#E2E8F0' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
          <Building2 className="w-4 h-4" style={{ color: '#0D9488' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#0F172A' }}>{tenantName}</p>
          <p className="text-xs truncate" style={{ color: '#64748B' }}>Hospital Management</p>
        </div>
      </div>

      {/* Plan badge */}
      {status !== 'trial' && (
        <div className="mx-3 mt-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.15)' }}>
            <span className="text-xs font-semibold capitalize" style={{ color: '#0D9488' }}>
              {plan} plan
            </span>
            {plan === 'starter' && (
              <Link href="/account/subscription"
                className="text-xs font-bold px-2 py-0.5 rounded-lg"
                style={{ background: '#0D9488', color: '#fff' }}>
                Upgrade
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_CONFIG.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!hasPermission(role, item.requiredPermission as Permission)) return false
            if (item.moduleKey && enabledModules && !enabledModules.includes(item.moduleKey)) return false
            return true
          })
          if (visibleItems.length === 0) return null

          return (
            <div key={group.label}>
              <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#94A3B8' }}>
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive  = pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))

                  // Plan-locked: growth-only module, tenant is on starter (non-trial)
                  const isLocked = !!(
                    item.moduleKey &&
                    isGrowthOnly(item.moduleKey) &&
                    !planHasModule(plan, status, item.moduleKey)
                  )

                  if (isLocked) {
                    return (
                      <li key={item.href}>
                        <Link
                          href="/account/subscription?upgrade=1"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px]"
                          style={{ color: '#CBD5E1', border: '1px solid transparent', opacity: 0.7 }}
                          title="Upgrade to Growth plan to unlock">
                          <span style={{ color: '#CBD5E1' }}>
                            <NavIcon name={item.icon} />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          <Lock className="w-3 h-3 flex-shrink-0" style={{ color: '#94A3B8' }} />
                        </Link>
                      </li>
                    )
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px]"
                        style={isActive
                          ? { background: 'rgba(13,148,136,0.10)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.15)' }
                          : { color: '#475569', border: '1px solid transparent' }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'rgba(226,232,240,0.6)'
                            e.currentTarget.style.color = '#0F172A'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = '#475569'
                          }
                        }}>
                        <span style={isActive ? { color: '#0D9488' } : { color: '#94A3B8' }}>
                          <NavIcon name={item.icon} />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      <aside className="glass-sidebar fixed left-0 top-0 h-full w-60 flex-col z-40 hidden lg:flex">
        {navContent}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`glass-sidebar fixed left-0 top-0 h-full w-72 flex flex-col z-50 lg:hidden transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        {navContent}
      </aside>
    </>
  )
}
