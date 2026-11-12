// Every role against every screen: the ones it should reach, it reaches; the
// rest send it away. Expected map = the 12 Nov 2026 run (no leaks found).
import { as, go, bodyText } from '../lib/browser'
import { ROLES, type Role } from '../lib/env'
import type { Flow } from '../lib/run'

const A: Role[] = ['admin']
const ALL: Role[] = [...ROLES]
export const ACCESS: Record<string, Role[]> = {
  '/dashboard': ['admin', 'doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'hr'],
  '/patients': ['admin', 'doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist'],
  '/appointments': ['admin', 'doctor', 'nurse', 'receptionist'],
  '/opd': ['admin', 'doctor', 'nurse'], '/wards': ['admin', 'doctor', 'nurse'], '/ipd': ['admin', 'doctor', 'nurse'], '/ot': ['admin', 'doctor', 'nurse'],
  '/emergency': ['admin', 'doctor', 'nurse', 'receptionist'], '/emergency/mlc': ['admin', 'doctor', 'nurse', 'receptionist'],
  '/lab': ['admin', 'doctor', 'nurse', 'lab_tech'], '/radiology': ['admin', 'doctor', 'nurse', 'lab_tech'], '/blood': ['admin', 'doctor', 'nurse', 'lab_tech'],
  '/pcpndt': ['admin', 'doctor'], '/pcpndt/mtp': ['admin', 'doctor'], '/pcpndt/returns': A, '/pcpndt/setup': A,
  '/pharmacy': ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist'], '/pharmacy/receive': ['admin', 'pharmacist'],
  '/billing': ['admin', 'doctor', 'receptionist', 'accountant'], '/billing/estimates': ['admin', 'doctor', 'receptionist', 'accountant'],
  '/billing/cash-book': ['admin', 'doctor', 'receptionist', 'accountant'], '/billing/discount-approvals': ['admin', 'accountant'],
  '/accounts': ['admin', 'doctor', 'receptionist', 'accountant'], '/insurance': ['admin', 'doctor', 'receptionist', 'accountant'],
  '/inventory': ['admin', 'nurse', 'accountant'], '/staff': ['admin', 'hr'], '/scheduling': ['admin', 'doctor', 'nurse', 'hr'],
  '/notifications': ['admin', 'doctor', 'receptionist', 'accountant'], '/getting-started': A, '/referrals': A, '/audit': A,
  '/account/subscription': A, '/account/pin': ALL,
  '/settings/departments': A, '/settings/tariffs': A, '/settings/phrases': ['admin', 'doctor'], '/settings/devices': ['admin', 'lab_tech'],
  '/settings/ipd-billing': A, '/settings/billing': A, '/settings/access': A, '/settings/counters': A, '/settings/profile': A, '/settings/modules': A,
}

export default {
  name: 'access', title: '02 Who can open what',
  async run(r) {
    for (const role of ROLES) {
      const s = await as(role); const page = s.page
      try {
        const leaks: string[] = []; const blocked: string[] = []; let silent = 0
        for (const [route, who] of Object.entries(ACCESS)) {
          const before = s.errors.length
          const res = await go(page, route)
          const body = await bodyText(page)
          const denied = /don.t have access to this page/i.test(body)
          const reached = res.path === route && !denied
          const should = who.includes(role)
          if (reached && !should) leaks.push(route)
          if (!reached && should) blocked.push(`${route}→${denied ? 'no access' : res.path}`)
          // The accountant's home is Accounts: /dashboard forwards there by design.
          const home = role === 'accountant' && route === '/dashboard' && res.path === '/accounts'
          if (!reached && !should && !denied && !home && !/not allowed|no access|permission/i.test(body)) silent++
          if (reached && s.errors.slice(before).some((e) => /#418|Hydration/i.test(e))) r.check({ id: `A-418-${role}-${route}`, role, screen: route, title: `No React hydration error (#418) on ${route}`, ok: false, bug: 'BUG-003', detail: s.errors.slice(before).find((e) => /#418|Hydration/i.test(e)) })
        }
        r.check({ id: `A-01-${role}`, role, screen: 'all screens', title: `${role}: no screen it should not see`, ok: leaks.length === 0, detail: leaks.join(', ') || 'no leaks' })
        r.check({ id: `A-02-${role}`, role, screen: 'all screens', title: `${role}: every screen it needs opens`, ok: blocked.length === 0, detail: blocked.join(', ') || 'all open' })
        r.check({ id: `A-03-${role}`, role, screen: 'redirects', title: `${role}: a blocked screen says why instead of a silent redirect`, ok: silent === 0, bug: 'BUG-005', detail: `${silent} silent redirects` })
        if (role === 'accountant') {
          await go(page, '/accounts')
          const dash = page.locator('nav a, aside a').filter({ hasText: /^Dashboard$/ }).first()
          const href = await dash.getAttribute('href').catch(() => null)
          r.check({ id: 'A-04', role, screen: 'menu', title: 'Accountant\'s menu has no "Dashboard" that only bounces to Accounts', ok: !href, bug: 'BUG-004', detail: href ? `Dashboard → ${href}` : 'no Dashboard item' })
        }
      } finally { await s.close() }
    }
  },
} satisfies Flow
