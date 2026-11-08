'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, CalendarDays, FlaskConical, Pill,
  Receipt, Stethoscope, BedDouble, Siren, Scan, Scissors, Droplets, ShieldPlus,
  Warehouse, UserCog, Bell,
  type LucideProps,
} from 'lucide-react'
import { hasPermission } from '@/lib/rbac'
import { useAuth } from '@/context/AuthContext'
import type { Role, Permission } from '@/lib/types'

type IconComp = React.ComponentType<LucideProps>

const ICON_MAP: Record<string, IconComp> = {
  LayoutDashboard,
  Users,
  CalendarDays,
  FlaskConical,
  Pill,
  Receipt,
  Stethoscope,
  BedDouble,
  Siren,
  Scan,
  Scissors,
  Droplets,
  ShieldPlus,
  Warehouse,
  UserCog,
  Bell,
}

function TabIcon({ name }: { name: string }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon className="w-5 h-5" />
}

// Priority order of destinations per role (pick first 5 that pass permission check)
const ROLE_PRIORITY: Record<Role, string[]> = {
  admin:        ['/dashboard', '/patients', '/staff', '/inventory', '/billing'],
  doctor:       ['/appointments', '/opd', '/patients', '/lab', '/wards'],
  nurse:        ['/opd', '/patients', '/emergency', '/wards', '/lab'],
  receptionist: ['/patients', '/appointments', '/billing', '/dashboard', '/emergency'],
  lab_tech:     ['/lab', '/radiology', '/blood', '/patients', '/dashboard'],
  pharmacist:   ['/pharmacy', '/patients', '/dashboard', '/lab', '/radiology'],
  accountant:   ['/billing', '/insurance', '/dashboard', '/patients'],
  // No clinical destination here by design — an HR manager has none.
  hr:           ['/staff', '/scheduling', '/dashboard'],
}

interface BottomTabBarProps { role: Role; enabledModules?: string[] }

export default function BottomTabBar({ role, enabledModules }: BottomTabBarProps) {
  const granted = useAuth().profile?.granted_permissions
  const pathname = usePathname()

  // Flatten all nav items for lookup (moduleKey matches NAV_CONFIG)
  const allItems = [
    { href: '/dashboard',    label: 'Home',     icon: 'LayoutDashboard', requiredPermission: 'dashboard:read' as Permission,      moduleKey: undefined },
    { href: '/patients',     label: 'Patients', icon: 'Users',           requiredPermission: 'patients:read' as Permission,       moduleKey: undefined },
    { href: '/appointments', label: 'Schedule', icon: 'CalendarDays',    requiredPermission: 'appointments:read' as Permission,   moduleKey: undefined },
    { href: '/opd',          label: 'OPD',      icon: 'Stethoscope',     requiredPermission: 'opd:read' as Permission,            moduleKey: undefined },
    { href: '/wards',        label: 'Wards',    icon: 'BedDouble',       requiredPermission: 'ipd:read' as Permission,            moduleKey: 'ipd' },
    { href: '/emergency',    label: 'ER',       icon: 'Siren',           requiredPermission: 'emergency:read' as Permission,      moduleKey: 'emergency' },
    { href: '/lab',          label: 'Lab',      icon: 'FlaskConical',    requiredPermission: 'lab:read' as Permission,            moduleKey: 'lab' },
    { href: '/radiology',    label: 'Radiology',icon: 'Scan',            requiredPermission: 'radiology:read' as Permission,      moduleKey: 'radiology' },
    { href: '/pharmacy',     label: 'Pharmacy', icon: 'Pill',            requiredPermission: 'pharmacy:read' as Permission,       moduleKey: 'pharmacy' },
    { href: '/blood',        label: 'Blood',    icon: 'Droplets',        requiredPermission: 'bloodbank:read' as Permission,      moduleKey: 'bloodbank' },
    { href: '/ot',           label: 'OT',       icon: 'Scissors',        requiredPermission: 'ot:read' as Permission,             moduleKey: 'ot' },
    { href: '/billing',      label: 'Billing',  icon: 'Receipt',         requiredPermission: 'billing:read' as Permission,        moduleKey: undefined },
    { href: '/insurance',    label: 'Insurance',icon: 'ShieldPlus',      requiredPermission: 'insurance:read' as Permission,      moduleKey: 'insurance' },
    { href: '/inventory',    label: 'Inventory',icon: 'Warehouse',       requiredPermission: 'inventory:read' as Permission,      moduleKey: 'inventory' },
    { href: '/staff',        label: 'Staff',    icon: 'UserCog',         requiredPermission: 'hr:read' as Permission,             moduleKey: 'hr' },
    { href: '/notifications',label: 'Notify',   icon: 'Bell',            requiredPermission: 'notifications:send' as Permission,  moduleKey: undefined },
  ]

  const priority = ROLE_PRIORITY[role] ?? ['/dashboard']
  const tabs = priority
    .map((href) => allItems.find((i) => i.href === href))
    .filter((item): item is NonNullable<typeof item> =>
      !!item &&
      hasPermission(role, item.requiredPermission, granted) &&
      (!item.moduleKey || !enabledModules || enabledModules.includes(item.moduleKey))
    )
    .slice(0, 5)

  const activeHref = tabs
    .map((t) => t.href)
    .filter((h) => pathname === h || (h !== '/dashboard' && pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0] ?? null

  if (tabs.length === 0) return null

  return (
    <nav
      className="glass-bottom-bar fixed bottom-0 left-0 right-0 z-30 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center h-16">
        {tabs.map((tab) => {
          // Longest match wins, as in the sidebar. These tabs are all top-level
          // so none can nest inside another, but the trailing slash still
          // matters: without it /billings would light up Billing.
          const isActive = tab.href === activeHref
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-2 rounded-xl min-h-[44px] justify-center"
              style={{ color: isActive ? '#0D9488' : '#94A3B8' }}
            >
              <TabIcon name={tab.icon} />
              <span className="text-[10px] font-medium leading-none truncate max-w-full">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
