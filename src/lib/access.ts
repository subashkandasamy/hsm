import type { Permission, Role } from '@/lib/types'

/**
 * Access groups an admin can add to a role (Settings → Roles & access, 0271).
 *
 * A group is a set of permissions that already exist — nothing here invents a
 * new kind of access. Grants only ADD to a role's built-in permissions
 * (PERMISSION_MATRIX in rbac.ts); they never remove any.
 *
 * Deliberately absent, so they can never be ticked — the hospital carries the
 * legal or money risk for each:
 *   prescribing (opd:write), signing reports (lab:verify, radiology:verify),
 *   PC&PNDT / MTP (pcpndt:*), cancelling bills and approving discounts
 *   (billing:manage), hospital settings and GST (settings:*), staff and roles
 *   (hr:manage), and admin:all.
 *
 * The database side of each group — which tables it opens for reading or
 * writing — is in migration 0271 and must stay in step with this list.
 *
 * Pure, so it can be tested: `npm run verify:role-access`.
 */

export const ACCESS_GROUPS = [
  {
    key: 'registration',
    label: 'Patient registration & appointments',
    description: 'Register patients, book appointments and check them in.',
    permissions: ['patients:read', 'patients:write', 'appointments:read', 'appointments:write', 'barcode:print:patient'],
  },
  {
    key: 'billing',
    label: 'Billing & cash book',
    description: 'Raise bills, take payments and advances. Not cancelling bills or approving discounts.',
    permissions: ['billing:read', 'billing:write', 'billing:advance', 'insurance:read'],
  },
  {
    key: 'lab',
    label: 'Lab work',
    description: 'Collect samples and enter results. Signing a report stays with the lab staff and doctors.',
    permissions: ['lab:read', 'lab:process', 'barcode:print:sample'],
  },
  {
    key: 'radiology',
    label: 'Radiology work',
    description: 'Perform scans and type findings. Signing a report stays with the doctor.',
    permissions: ['radiology:read', 'radiology:process'],
  },
  {
    key: 'pharmacy',
    label: 'Pharmacy counter',
    description: 'Sell and dispense medicines.',
    permissions: ['pharmacy:read', 'pharmacy:dispense', 'pharmacy:sale'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock and purchases.',
    permissions: ['inventory:read', 'inventory:manage'],
  },
  {
    key: 'mlc',
    label: 'Emergency & accident register',
    description: 'View and record emergency and accident (MLC) cases.',
    permissions: ['emergency:read', 'emergency:register'],
  },
] as const satisfies ReadonlyArray<{ key: string; label: string; description: string; permissions: readonly Permission[] }>

export type AccessGroupKey = typeof ACCESS_GROUPS[number]['key']
export const ACCESS_GROUP_KEYS: readonly AccessGroupKey[] = ACCESS_GROUPS.map((g) => g.key)

export function isAccessGroupKey(v: unknown): v is AccessGroupKey {
  return typeof v === 'string' && (ACCESS_GROUP_KEYS as readonly string[]).includes(v)
}

/** Every role but admin, which already has everything. */
export const GRANTABLE_ROLES = ['doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'accountant', 'hr'] as const satisfies readonly Role[]
export type GrantableRole = typeof GRANTABLE_ROLES[number]

export function isGrantableRole(v: unknown): v is GrantableRole {
  return typeof v === 'string' && (GRANTABLE_ROLES as readonly string[]).includes(v)
}

export const ROLE_LABEL: Record<GrantableRole, string> = {
  doctor: 'Doctor', nurse: 'Nurse', receptionist: 'Receptionist', lab_tech: 'Lab technician',
  pharmacist: 'Pharmacist', accountant: 'Accountant', hr: 'HR',
}

/** Permissions that may never be granted, whatever the list above says. Checked by the tests. */
export const NEVER_GRANTED: readonly Permission[] = [
  'admin:all', 'opd:write', 'lab:verify', 'radiology:verify', 'pcpndt:record', 'pcpndt:report',
  'billing:manage', 'settings:write', 'settings:modules', 'hr:manage', 'departments:manage', 'tariffs:manage',
  'account:subscription', 'audit:read',
]

/** The permissions a set of granted groups adds. Unknown keys are ignored. */
export function permissionsFromGroups(groups: readonly string[]): Permission[] {
  const out = new Set<Permission>()
  for (const g of ACCESS_GROUPS) if (groups.includes(g.key)) for (const p of g.permissions) out.add(p)
  return [...out]
}
