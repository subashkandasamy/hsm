import type { Permission, Role } from '@/lib/types'
import { hasPermission } from '@/lib/rbac'

/**
 * Which pages a person may open, by address.
 *
 * The menus already hide what a role cannot use, but nothing stopped a page
 * being opened by typing its address: a lab technician could open Billing and
 * read the day's takings, a pharmacist the staff directory with phone numbers,
 * and pages whose data call refused the role crashed with a server error
 * instead of turning the person away. The dashboard template checks every page
 * against these rules — built-in permissions plus anything an admin granted in
 * Roles & access — and sends a person who may not open it to their home page.
 *
 * Rules are matched by the longest prefix. A page with no rule is open to any
 * signed-in member of staff (the dashboard, your own PIN). `anyOf`: holding any
 * one of the permissions is enough.
 *
 * Pure, so it can be tested: `npm run verify:route-access`.
 */

export interface RouteRule { prefix: string; anyOf: Permission[] }

export const ROUTE_RULES: RouteRule[] = [
  { prefix: '/patients',                   anyOf: ['patients:read'] },
  { prefix: '/appointments',               anyOf: ['appointments:read'] },
  { prefix: '/opd',                        anyOf: ['opd:read'] },
  { prefix: '/wards',                      anyOf: ['ipd:read'] },
  { prefix: '/ipd',                        anyOf: ['ipd:read'] },
  { prefix: '/emergency',                  anyOf: ['emergency:read'] },
  { prefix: '/lab',                        anyOf: ['lab:read'] },
  { prefix: '/radiology',                  anyOf: ['radiology:read'] },
  { prefix: '/pcpndt',                     anyOf: ['pcpndt:record', 'pcpndt:report'] },
  { prefix: '/pcpndt/returns',             anyOf: ['pcpndt:report'] },
  // The page sent anyone else back to /pcpndt without a word (BUG-005).
  { prefix: '/pcpndt/setup',               anyOf: ['pcpndt:report'] },
  { prefix: '/pharmacy',                   anyOf: ['pharmacy:read'] },
  { prefix: '/pharmacy/receive',           anyOf: ['pharmacy:manage'] },
  { prefix: '/ot',                         anyOf: ['ot:read'] },
  { prefix: '/blood',                      anyOf: ['bloodbank:read'] },
  // The hospital's money: the list and day totals, cash book, estimates, accounts.
  { prefix: '/billing',                    anyOf: ['billing:read'] },
  { prefix: '/accounts',                   anyOf: ['billing:read'] },
  { prefix: '/billing/discount-approvals', anyOf: ['billing:manage'] },
  // One bill, or one patient's combined bill, also opens for whoever can see
  // that patient — their profile's Bills tab lists exactly these.
  { prefix: '/billing/[id]',               anyOf: ['billing:read', 'patients:read'] },
  { prefix: '/billing/combined',           anyOf: ['billing:read', 'patients:read'] },
  { prefix: '/billing/advance-receipt',    anyOf: ['billing:read', 'patients:read'] },
  { prefix: '/insurance',                  anyOf: ['insurance:read'] },
  { prefix: '/inventory',                  anyOf: ['inventory:read'] },
  { prefix: '/staff',                      anyOf: ['hr:read'] },
  { prefix: '/hr',                         anyOf: ['hr:read'] },
  { prefix: '/scheduling',                 anyOf: ['scheduling:read'] },
  { prefix: '/notifications',              anyOf: ['notifications:send'] },
  { prefix: '/getting-started',            anyOf: ['settings:modules'] },
  { prefix: '/referrals',                  anyOf: ['account:subscription'] },
  { prefix: '/account/subscription',       anyOf: ['account:subscription'] },
  { prefix: '/audit',                      anyOf: ['audit:read'] },
  { prefix: '/settings',                   anyOf: ['settings:write'] },
  { prefix: '/settings/departments',       anyOf: ['departments:manage'] },
  { prefix: '/settings/tariffs',           anyOf: ['tariffs:manage'] },
  { prefix: '/settings/phrases',           anyOf: ['opd:write'] },
  { prefix: '/settings/devices',           anyOf: ['lab:process', 'lab:manage'] },
  { prefix: '/settings/ipd-billing',       anyOf: ['ipd:config'] },
  { prefix: '/settings/modules',           anyOf: ['settings:modules'] },
]

/** Billing sub-pages that are not a single bill's id. */
const BILLING_PAGES = new Set(['estimates', 'cash-book', 'discount-approvals', 'combined', 'advance-receipt'])

/** The rule for an address, or null when any signed-in member of staff may open it. */
export function ruleFor(pathname: string): RouteRule | null {
  let path = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/'
  // "/billing/<a bill>" is matched as "/billing/[id]".
  const m = /^\/billing\/([^/]+)$/.exec(path)
  if (m && !BILLING_PAGES.has(m[1])) path = '/billing/[id]'
  let best: RouteRule | null = null
  for (const r of ROUTE_RULES) {
    if ((path === r.prefix || path.startsWith(r.prefix + '/')) && (!best || r.prefix.length > best.prefix.length)) best = r
  }
  return best
}

export function canOpen(role: Role, pathname: string, granted?: readonly Permission[] | null): boolean {
  const rule = ruleFor(pathname)
  return !rule || rule.anyOf.some((p) => hasPermission(role, p, granted))
}
