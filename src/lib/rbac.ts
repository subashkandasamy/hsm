import type { Role, Permission, NavGroup } from './types'

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  admin: [
    'admin:all',
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'opd:visit:start', 'opd:read', 'opd:write', 'opd:vitals',
    'wards:manage',
    'ipd:read', 'ipd:write', 'ipd:notes',
    'emergency:read', 'emergency:register', 'emergency:triage',
    'lab:read', 'lab:order', 'lab:process', 'lab:verify', 'lab:manage',
    'radiology:read', 'radiology:order', 'radiology:process', 'radiology:verify', 'radiology:manage',
    'pcpndt:record', 'pcpndt:report',
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
    'emr:file:read',
  ],
  doctor: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'opd:visit:start', 'opd:read', 'opd:write', 'opd:vitals',
    'ipd:read', 'ipd:write', 'ipd:notes', 'ipd:nursing',
    'emergency:read', 'emergency:register', 'emergency:triage',
    'lab:read', 'lab:order', 'lab:verify',
    'radiology:read', 'radiology:order', 'radiology:verify',
    'pcpndt:record',
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
    'emr:file:read',
  ],
  nurse: [
    'patients:read', 'patients:write',
    'appointments:read',
    'opd:visit:start', 'opd:read', 'opd:vitals',
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
    'emr:file:read',
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
    'emr:file:read',
  ],
  lab_tech: [
    'patients:read',
    // A small hospital's lab is often one technician, so verification is granted
    // here by default — the gate is that releasing is a deliberate act, not that
    // it is a second person. A larger hospital can hold these to a senior role.
    'lab:read', 'lab:process', 'lab:verify',
    'radiology:read', 'radiology:process', 'radiology:verify',
    'bloodbank:read', 'bloodbank:manage', 'bloodbank:issue', 'bloodbank:screen',
    'emr:read',
    'barcode:print:sample',
    'leave:request',
    'dashboard:read',
    'emr:file:read',
  ],
  pharmacist: [
    'patients:read',
    'pharmacy:read', 'pharmacy:dispense', 'pharmacy:manage', 'pharmacy:sale',
    'emr:read',
    'leave:request',
    'dashboard:read',
  ],
  // A non-clinical manager: attendance, leave, the duty roster, and the
  // hospital's shape through aggregate figures. No clinical screen at all —
  // "read-only everywhere" would hand them every diagnosis in the building,
  // plus the MTP and PC&PNDT registers, whose confidentiality is statutory.
  // The dashboard is safe here because it reads counts, never a patient name.
  hr: [
    'hr:read', 'hr:manage', 'hr:attendance',
    'scheduling:read', 'scheduling:manage',
    'leave:request', 'leave:approve',
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
      // Its own entry rather than a tab inside Emergency: the register outlives
      // the casualty visit by years, and a police requisition arriving in 2029
      // should not have to be answered by reopening last night's board.
      { label: 'Accident Register', href: '/emergency/mlc', icon: 'Gavel',      requiredPermission: 'emergency:read',  moduleKey: 'emergency' },
    ],
  },
  {
    label: 'Diagnostics & Treatment',
    items: [
      { label: 'Laboratory',        href: '/lab',       icon: 'FlaskConical', requiredPermission: 'lab:read',        moduleKey: 'lab' },
      { label: 'Radiology',         href: '/radiology', icon: 'Scan',         requiredPermission: 'radiology:read',  moduleKey: 'radiology' },
      // Sits beside radiology because that is where the scans are, but behind
      // its own permission because the register holds far more than a scan does.
      { label: 'Form F (PC&PNDT)',  href: '/pcpndt',    icon: 'ShieldCheck',  requiredPermission: 'pcpndt:record',   moduleKey: 'radiology' },
      // A separate Act and a separate return, so a separate entry rather than
      // a tab — a hospital that does no terminations should not have to learn
      // that this is hidden inside the scan register.
      { label: 'MTP Register',      href: '/pcpndt/mtp', icon: 'ClipboardList', requiredPermission: 'pcpndt:record',  moduleKey: 'radiology' },
      // Behind pcpndt:report, so it only appears for whoever actually files.
      { label: 'Monthly Returns',   href: '/pcpndt/returns', icon: 'FileText',  requiredPermission: 'pcpndt:report',  moduleKey: 'radiology' },
      { label: 'Pharmacy',          href: '/pharmacy',  icon: 'Pill',         requiredPermission: 'pharmacy:read',   moduleKey: 'pharmacy' },
      { label: 'Operation Theatre', href: '/ot',        icon: 'Scissors',     requiredPermission: 'ot:read',         moduleKey: 'ot' },
      { label: 'Blood Bank',        href: '/blood',     icon: 'Droplets',     requiredPermission: 'bloodbank:read',  moduleKey: 'bloodbank' },
    ],
  },
  {
    label: 'Billing & Insurance',
    items: [
      { label: 'Billing',    href: '/billing',    icon: 'Receipt',    requiredPermission: 'billing:read' },
      { label: 'Estimates',  href: '/billing/estimates', icon: 'FileText', requiredPermission: 'billing:read' },
      { label: 'Cash Book',  href: '/billing/cash-book', icon: 'BookOpen',  requiredPermission: 'billing:read' },
      { label: 'Accounts',   href: '/accounts',   icon: 'Calculator', requiredPermission: 'billing:read' },
      { label: 'Discount Approvals', href: '/billing/discount-approvals', icon: 'Percent', requiredPermission: 'billing:manage' },
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
      { label: 'Getting Started',  href: '/getting-started',      icon: 'Rocket',          requiredPermission: 'settings:modules' },
      { label: 'Departments',      href: '/settings/departments', icon: 'Building2',       requiredPermission: 'departments:manage' },
      { label: 'Tariffs & Fees',   href: '/settings/tariffs',     icon: 'BadgeDollarSign', requiredPermission: 'tariffs:manage' },
      { label: 'Note Phrases',     href: '/settings/phrases',     icon: 'ListPlus',        requiredPermission: 'opd:write' },
      { label: 'Analyzers',        href: '/settings/devices',     icon: 'Microscope',      requiredPermission: 'lab:process', moduleKey: 'lab' },
      { label: 'IPD Billing',      href: '/settings/ipd-billing', icon: 'BedDouble',       requiredPermission: 'ipd:config', moduleKey: 'ipd' },
      { label: 'Billing & Collections', href: '/settings/billing', icon: 'CreditCard',  requiredPermission: 'settings:write' },
      { label: 'Hospital Profile', href: '/settings/profile',     icon: 'Building2',       requiredPermission: 'settings:write' },
      { label: 'Module Settings',  href: '/settings/modules',     icon: 'ToggleLeft',      requiredPermission: 'settings:modules' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Refer & Earn',  href: '/referrals',            icon: 'Gift',          requiredPermission: 'account:subscription' },
      { label: 'Subscription', href: '/account/subscription', icon: 'CreditCard',    requiredPermission: 'account:subscription' },
      { label: 'Audit Log',    href: '/audit',                icon: 'ClipboardList', requiredPermission: 'audit:read' },
    ],
  },
]
