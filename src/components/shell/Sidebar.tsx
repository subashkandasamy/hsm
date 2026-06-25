'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard, Users, CalendarDays, FlaskConical, Pill,
  Receipt, UserCog, ClipboardList, Settings, Building2, Stethoscope,
  LayoutGrid, BedDouble, Siren, Scan, Scissors, Droplets, ShieldPlus, Warehouse, Bell,
} from 'lucide-react'
import { NAV_CONFIG, hasPermission } from '@/lib/rbac'
import type { Role, Permission } from '@/lib/types'

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
  Users:           <Users className="w-4 h-4" />,
  CalendarDays:    <CalendarDays className="w-4 h-4" />,
  FlaskConical:    <FlaskConical className="w-4 h-4" />,
  Pill:            <Pill className="w-4 h-4" />,
  Receipt:         <Receipt className="w-4 h-4" />,
  UserCog:         <UserCog className="w-4 h-4" />,
  ClipboardList:   <ClipboardList className="w-4 h-4" />,
  Settings:        <Settings className="w-4 h-4" />,
  Stethoscope:     <Stethoscope className="w-4 h-4" />,
  LayoutGrid:      <LayoutGrid className="w-4 h-4" />,
  BedDouble:       <BedDouble className="w-4 h-4" />,
  Siren:           <Siren className="w-4 h-4" />,
  Scan:            <Scan className="w-4 h-4" />,
  Scissors:        <Scissors className="w-4 h-4" />,
  Droplets:        <Droplets className="w-4 h-4" />,
  ShieldPlus:      <ShieldPlus className="w-4 h-4" />,
  Bell:            <Bell className="w-4 h-4" />,
  Warehouse:       <Warehouse className="w-4 h-4" />,
}

interface SidebarProps {
  role: Role
  drawerOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ role, drawerOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()

  // Close drawer on route change
  useEffect(() => {
    onClose?.()
  }, [pathname]) // intentionally omit onClose to avoid re-runs; it's a stable callback

  // Close on Escape key
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen, onClose])

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: '#E2E8F0' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
          <Building2 className="w-4 h-4" style={{ color: '#0D9488' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#0F172A' }}>Uyirly</p>
          <p className="text-xs truncate" style={{ color: '#64748B' }}>Hospital Management</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_CONFIG.map((group) => {
          const visibleItems = group.items.filter((item) =>
            hasPermission(role, item.requiredPermission as Permission)
          )
          if (visibleItems.length === 0) return null
          return (
            <div key={group.label}>
              <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#94A3B8' }}>
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))
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
                        }}
                      >
                        <span style={isActive ? { color: '#0D9488' } : { color: '#94A3B8' }}>
                          {ICON_MAP[item.icon]}
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
      {/* Desktop: always-visible fixed sidebar (lg+) */}
      <aside className="glass-sidebar fixed left-0 top-0 h-full w-60 flex-col z-40 hidden lg:flex">
        {navContent}
      </aside>

      {/* Mobile/tablet: backdrop + drawer (< lg) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`glass-sidebar fixed left-0 top-0 h-full w-72 flex flex-col z-50 lg:hidden transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </aside>
    </>
  )
}
