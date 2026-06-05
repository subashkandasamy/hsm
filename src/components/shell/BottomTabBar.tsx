'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, CalendarDays, FlaskConical, Pill,
  Receipt, Stethoscope, BedDouble, Siren, Scan, Scissors, Droplets, ShieldPlus,
  Warehouse, UserCog,
} from 'lucide-react'
import { hasPermission } from '@/lib/rbac'
import type { Role, Permission } from '@/lib/types'

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Users:           <Users className="w-5 h-5" />,
  CalendarDays:    <CalendarDays className="w-5 h-5" />,
  FlaskConical:    <FlaskConical className="w-5 h-5" />,
  Pill:            <Pill className="w-5 h-5" />,
  Receipt:         <Receipt className="w-5 h-5" />,
  Stethoscope:     <Stethoscope className="w-5 h-5" />,
  BedDouble:       <BedDouble className="w-5 h-5" />,
  Siren:           <Siren className="w-5 h-5" />,
  Scan:            <Scan className="w-5 h-5" />,
  Scissors:        <Scissors className="w-5 h-5" />,
  Droplets:        <Droplets className="w-5 h-5" />,
  ShieldPlus:      <ShieldPlus className="w-5 h-5" />,
  Warehouse:       <Warehouse className="w-5 h-5" />,
  UserCog:         <UserCog className="w-5 h-5" />,
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
}

interface BottomTabBarProps { role: Role }

export default function BottomTabBar({ role }: BottomTabBarProps) {
  const pathname = usePathname()

  // Flatten all nav items for lookup
  const allItems = [
    { href: '/dashboard',    label: 'Home',     icon: 'LayoutDashboard', requiredPermission: 'dashboard:read' as Permission },
    { href: '/patients',     label: 'Patients', icon: 'Users',           requiredPermission: 'patients:read' as Permission },
    { href: '/appointments', label: 'Schedule', icon: 'CalendarDays',    requiredPermission: 'appointments:read' as Permission },
    { href: '/opd',          label: 'OPD',      icon: 'Stethoscope',     requiredPermission: 'opd:read' as Permission },
    { href: '/wards',        label: 'Wards',    icon: 'BedDouble',       requiredPermission: 'ipd:read' as Permission },
    { href: '/emergency',    label: 'ER',       icon: 'Siren',           requiredPermission: 'emergency:read' as Permission },
    { href: '/lab',          label: 'Lab',      icon: 'FlaskConical',    requiredPermission: 'lab:read' as Permission },
    { href: '/radiology',    label: 'Radiology',icon: 'Scan',            requiredPermission: 'radiology:read' as Permission },
    { href: '/pharmacy',     label: 'Pharmacy', icon: 'Pill',            requiredPermission: 'pharmacy:read' as Permission },
    { href: '/blood',        label: 'Blood',    icon: 'Droplets',        requiredPermission: 'bloodbank:read' as Permission },
    { href: '/ot',           label: 'OT',       icon: 'Scissors',        requiredPermission: 'ot:read' as Permission },
    { href: '/billing',      label: 'Billing',  icon: 'Receipt',         requiredPermission: 'billing:read' as Permission },
    { href: '/insurance',  label: 'Insurance', icon: 'ShieldPlus', requiredPermission: 'insurance:read' as Permission },
    { href: '/inventory',  label: 'Inventory', icon: 'Warehouse',  requiredPermission: 'inventory:read' as Permission },
    { href: '/staff',      label: 'Staff',     icon: 'UserCog',    requiredPermission: 'hr:read' as Permission },
  ]

  const priority = ROLE_PRIORITY[role] ?? ['/dashboard']
  const tabs = priority
    .map((href) => allItems.find((i) => i.href === href))
    .filter((item): item is NonNullable<typeof item> =>
      !!item && hasPermission(role, item.requiredPermission)
    )
    .slice(0, 5)

  if (tabs.length === 0) return null

  return (
    <nav
      className="glass-bottom-bar fixed bottom-0 left-0 right-0 z-30 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href ||
            (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[56px] min-h-[44px] justify-center"
              style={{ color: isActive ? '#0D9488' : '#94A3B8' }}
            >
              {ICON_MAP[tab.icon]}
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
