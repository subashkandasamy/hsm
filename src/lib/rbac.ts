import type { Role, Permission, NavGroup } from './types'

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  admin: [
    'admin:all',
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'opd:read', 'opd:write', 'opd:vitals',
    'wards:manage',
    'ipd:read', 'ipd:write', 'ipd:notes',
    'emergency:read', 'emergency:register', 'emergency:triage',
    'lab:read', 'lab:order', 'lab:process', 'lab:manage',
    'radiology:read', 'radiology:order', 'radiology:process', 'radiology:manage',
    'pharmacy:read', 'pharmacy:dispense', 'pharmacy:manage',
    'ot:read', 'ot:schedule', 'ot:record', 'ot:manage',
    'bloodbank:read', 'bloodbank:manage', 'bloodbank:request', 'bloodbank:issue', 'bloodbank:screen', 'bloodbank:transfuse',
    'billing:read', 'billing:write', 'billing:manage',
    'insurance:read', 'insurance:write',
    'inventory:read', 'inventory:manage',
    'hr:read', 'hr:manage', 'hr:attendance',
    'notifications:send', 'notifications:manage',
    'emr:read', 'emr:allergy:write', 'emr:document:upload', 'emr:document:delete',
    'audit:read', 'account:subscription',
    'settings:read', 'settings:write',
    'departments:manage', 'settings:modules',
    'dental:read', 'dental:write',
    'ophthalmology:write',
    'tariffs:manage', 'billing:advance', 'pharmacy:sale',
    'ipd:config', 'ipd:nursing',
    'barcode:print:patient', 'barcode:print:sample',
    'scheduling:read', 'scheduling:manage', 'leave:request', 'leave:approve',
    'dashboard:read',
  ],
  doctor: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'opd:read', 'opd:write', 'opd:vitals',
    'ipd:read', 'ipd:write', 'ipd:notes', 'ipd:nursing',
    'emergency:read', 'emergency:register', 'emergency:triage',
    'lab:read', 'lab:order',
    'radiology:read', 'radiology:order',
    'pharmacy:read',
    'ot:read', 'ot:schedule', 'ot:record',
    'bloodbank:read', 'bloodbank:request', 'bloodbank:transfuse',
    'billing:read',
    'insurance:read',
    'notifications:send',
    'emr:read', 'emr:allergy:write', 'emr:document:upload',
    'dental:read', 'dental:write',
    'ophthalmology:write',
    'scheduling:read', 'leave:request',
    'dashboard:read',
  ],
  nurse: [
    'patients:read', 'patients:write',
    'appointments:read',
    'opd:read', 'opd:vitals',
    'ipd:read', 'ipd:notes', 'ipd:nursing',
    'emergency:read', 'emergency:register', 'emergency:triage',
    'lab:read',
    'radiology:read',
    'pharmacy:read',
    'ot:read', 'ot:record',
    'bloodbank:read', 'bloodbank:request', 'bloodbank:transfuse',
    'inventory:read',
    'emr:read', 'emr:allergy:write', 'emr:document:upload',
    'dental:read', 'dental:write',
    'barcode:print:patient', 'barcode:print:sample',
    'scheduling:read', 'leave:request',
    'dashboard:read',
  ],
  receptionist: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'emergency:read', 'emergency:register',
    'billing:read', 'billing:write',
    'billing:advance',
    'insurance:read',
    'notifications:send',
    'emr:document:upload',
    'pharmacy:read',
    'barcode:print:patient',
    'leave:request',
    'dashboard:read',
  ],
  lab_tech: [
    'patients:read',
    'lab:read', 'lab:process',
    'radiology:read', 'radiology:process',
    'bloodbank:read', 'bloodbank:manage', 'bloodbank:issue', 'bloodbank:screen',
    'emr:read',
    'barcode:print:sample',
    'leave:request',
    'dashboard:read',
  ],
  pharmacist: [
    'patients:read',
    'pharmacy:read', 'pharmacy:dispense', 'pharmacy:manage', 'pharmacy:sale',
    'emr:read',
    'leave:request',
    'dashboard:read',
  ],
  accountant: [
    'billing:read', 'billing:write', 'billing:manage',
    'billing:advance',
    'insurance:read', 'insurance:write',
    'inventory:read', 'inventory:manage',
    'notifications:send',
    'leave:request',
    'dashboard:read',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = PERMISSION_MATRIX[role] ?? []
  return perms.includes('admin:all') || perms.includes(permission)
}

export async function requirePermission(
  role: Role | null | undefined,
  permission: Permission
): Promise<void> {
  if (!role || !hasPermission(role, permission)) throw new Error('FORBIDDEN')
}

export const NAV_CONFIG: NavGroup[] = [
  {
    label: 'Clinical',
    items: [
      { label: 'Dashboard',    href: '/dashboard',    icon: 'LayoutDashboard', requiredPermission: 'dashboard:read' },
      { label: 'Patients',     href: '/patients',     icon: 'Users',           requiredPermission: 'patients:read' },
      { label: 'Appointments', href: '/appointments', icon: 'CalendarDays',    requiredPermission: 'appointments:read' },
      { label: 'OPD',          href: '/opd',          icon: 'Stethoscope',     requiredPermission: 'opd:read' },
      { label: 'Ward Board',   href: '/wards',        icon: 'LayoutGrid',      requiredPermission: 'ipd:read',        moduleKey: 'ipd' },
      { label: 'IPD',          href: '/ipd',          icon: 'BedDouble',       requiredPermission: 'ipd:read',        moduleKey: 'ipd' },
      { label: 'Emergency',    href: '/emergency',    icon: 'Siren',           requiredPermission: 'emergency:read',  moduleKey: 'emergency' },
    ],
  },
  {
    label: 'Diagnostics & Treatment',
    items: [
      { label: 'Laboratory',        href: '/lab',       icon: 'FlaskConical', requiredPermission: 'lab:read',        moduleKey: 'lab' },
      { label: 'Radiology',         href: '/radiology', icon: 'Scan',         requiredPermission: 'radiology:read',  moduleKey: 'radiology' },
      { label: 'Pharmacy',          href: '/pharmacy',  icon: 'Pill',         requiredPermission: 'pharmacy:read',   moduleKey: 'pharmacy' },
      { label: 'Operation Theatre', href: '/ot',        icon: 'Scissors',     requiredPermission: 'ot:read',         moduleKey: 'ot' },
      { label: 'Blood Bank',        href: '/blood',     icon: 'Droplets',     requiredPermission: 'bloodbank:read',  moduleKey: 'bloodbank' },
    ],
  },
  {
    label: 'Billing & Insurance',
    items: [
      { label: 'Billing',    href: '/billing',    icon: 'Receipt',    requiredPermission: 'billing:read' },
      { label: 'Insurance',  href: '/insurance',  icon: 'ShieldPlus', requiredPermission: 'insurance:read', moduleKey: 'insurance' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Inventory',     href: '/inventory',    icon: 'Warehouse',     requiredPermission: 'inventory:read', moduleKey: 'inventory' },
      { label: 'Staff & HR',    href: '/staff',        icon: 'UserCog',       requiredPermission: 'hr:read',        moduleKey: 'hr' },
      { label: 'Scheduling',    href: '/scheduling',   icon: 'CalendarClock', requiredPermission: 'scheduling:read' },
      { label: 'Notifications', href: '/notifications', icon: 'Bell',         requiredPermission: 'notifications:send' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Departments',      href: '/settings/departments', icon: 'Building2',       requiredPermission: 'departments:manage' },
      { label: 'Tariffs & Fees',   href: '/settings/tariffs',     icon: 'BadgeDollarSign', requiredPermission: 'tariffs:manage' },
      { label: 'IPD Billing',      href: '/settings/ipd-billing', icon: 'BedDouble',       requiredPermission: 'ipd:config' },
      { label: 'Hospital Profile', href: '/settings/profile',     icon: 'Building2',       requiredPermission: 'settings:write' },
      { label: 'Module Settings',  href: '/settings/modules',     icon: 'ToggleLeft',      requiredPermission: 'settings:modules' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Subscription', href: '/account/subscription', icon: 'CreditCard',    requiredPermission: 'account:subscription' },
      { label: 'Audit Log',    href: '/audit',                icon: 'ClipboardList', requiredPermission: 'audit:read' },
    ],
  },
]
