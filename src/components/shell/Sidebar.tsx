'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, CalendarDays, FlaskConical, Pill,
  Receipt, UserCog, ClipboardList, Settings, Building2, Stethoscope,
  LayoutGrid, BedDouble, Siren, Scan, Scissors, Droplets, ShieldPlus, Warehouse, Bell,
  ToggleLeft, CreditCard, BadgeDollarSign, Lock, CalendarClock, Gift, Rocket, FileText, BookOpen, Percent,
  PanelLeftClose, PanelLeftOpen, Microscope, ShieldCheck, Gavel,
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
  Bell, Warehouse, ToggleLeft, CreditCard, Building2, BadgeDollarSign, CalendarClock, Gift, Rocket, FileText, BookOpen, Percent,
  Microscope, ShieldCheck, Gavel,
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
  /** Desktop icons-only rail */
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function Sidebar({
  role, enabledModules,
  plan = 'starter', status = 'trial',
  drawerOpen = false, onClose,
  collapsed = false, onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname()

  useEffect(() => { onClose?.() }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen, onClose])

  // `iconsOnly` collapses labels/headers (desktop rail). Mobile drawer always false.
  function renderNav(iconsOnly: boolean) {
    return (
      <nav className={`flex-1 overflow-y-auto py-4 space-y-5 ${iconsOnly ? 'px-2' : 'px-3'}`}>
        {NAV_CONFIG.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!hasPermission(role, item.requiredPermission as Permission)) return false
            if (item.moduleKey && enabledModules && !enabledModules.includes(item.moduleKey)) return false
            return true
          })
          if (visibleItems.length === 0) return null

          return (
            <div key={group.label}>
              {!iconsOnly && (
                <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))

                  const isLocked = !!(
                    item.moduleKey &&
                    isGrowthOnly(item.moduleKey) &&
                    !planHasModule(plan, status, item.moduleKey)
                  )

                  const rowClass = `flex items-center rounded-xl text-sm font-medium transition-all min-h-[44px] py-2.5 ${
                    iconsOnly ? 'justify-center px-0' : 'gap-3 px-3'
                  }`

                  if (isLocked) {
                    return (
                      <li key={item.href}>
                        <Link
                          href="/account/subscription?upgrade=1"
                          className={rowClass}
                          style={{ color: '#CBD5E1', border: '1px solid transparent', opacity: 0.7 }}
                          title={iconsOnly ? `${item.label} — upgrade to unlock` : 'Upgrade to Growth plan to unlock'}>
                          <span style={{ color: '#CBD5E1' }}><NavIcon name={item.icon} /></span>
                          {!iconsOnly && <span className="flex-1 truncate">{item.label}</span>}
                          {!iconsOnly && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: '#94A3B8' }} />}
                        </Link>
                      </li>
                    )
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={rowClass}
                        title={iconsOnly ? item.label : undefined}
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
                        {!iconsOnly && item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    )
  }

  // Plan badge (hidden on the collapsed rail).
  const planBadge = status !== 'trial' && (
    <div className="mx-3 mt-3">
      <div className="flex items-center justify-between px-3 py-2 rounded-xl"
        style={{ background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.15)' }}>
        <span className="text-xs font-semibold capitalize" style={{ color: '#0D9488' }}>{plan} plan</span>
        {plan === 'starter' && (
          <Link href="/account/subscription" className="text-xs font-bold px-2 py-0.5 rounded-lg"
            style={{ background: '#0D9488', color: '#fff' }}>Upgrade</Link>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop rail — starts below the full-width top bar; collapsible */}
      <aside
        className={`glass-sidebar fixed left-0 top-14 bottom-0 flex-col z-30 hidden lg:flex transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}>
        {!collapsed && planBadge}
        {renderNav(collapsed)}
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 border-t px-3 py-3 text-xs font-medium transition-all"
          style={{ borderColor: '#E2E8F0', color: '#64748B', background: 'transparent', justifyContent: collapsed ? 'center' : 'flex-start' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(226,232,240,0.5)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer — slides in below the top bar (which stays on top) */}
      {drawerOpen && (
        <div className="fixed left-0 right-0 top-14 bottom-0 z-30 lg:hidden"
          style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`glass-sidebar fixed left-0 top-14 bottom-0 w-72 flex flex-col z-40 lg:hidden transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        {planBadge}
        {renderNav(false)}
      </aside>
    </>
  )
}
