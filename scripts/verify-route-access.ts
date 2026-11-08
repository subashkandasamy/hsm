/**
 * Which pages a person may open (src/lib/routeAccess.ts).
 *
 *   npm run verify:route-access
 *
 * The rule that matters most: nobody is locked out of a page their own menu
 * shows them — with or without what an admin granted. Then: the pages that
 * leaked stay shut, and a grant opens exactly its area.
 */

import { canOpen, ruleFor } from '../src/lib/routeAccess'
import { NAV_CONFIG, hasPermission, PERMISSION_MATRIX } from '../src/lib/rbac'
import { ACCESS_GROUPS, permissionsFromGroups } from '../src/lib/access'
import type { Permission, Role } from '../src/lib/types'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

const roles = Object.keys(PERMISSION_MATRIX) as Role[]
const allGroups = permissionsFromGroups(ACCESS_GROUPS.map((g) => g.key))

console.log('\nNobody is locked out of their own menu')
const lockouts: string[] = []
for (const role of roles) {
  for (const granted of [[] as Permission[], allGroups]) {
    for (const group of NAV_CONFIG) for (const item of group.items) {
      if (hasPermission(role, item.requiredPermission as Permission, granted) && !canOpen(role, item.href, granted)) {
        lockouts.push(`${role}${granted.length ? '+grants' : ''} → ${item.href}`)
      }
    }
  }
}
check(lockouts.length === 0, `every menu item every role can see opens (${roles.length} roles, with and without grants)`, lockouts)

console.log('\nThe pages that leaked stay shut')
check(!canOpen('lab_tech', '/billing'), 'lab technician cannot open Billing (day totals, all bills)')
check(!canOpen('nurse', '/billing') && !canOpen('nurse', '/billing/cash-book') && !canOpen('nurse', '/accounts'), 'nurse cannot open Billing, Cash Book or Accounts')
check(!canOpen('pharmacist', '/staff') && !canOpen('pharmacist', '/hr'), 'pharmacist cannot open the staff directory')
check(!canOpen('receptionist', '/lab') && !canOpen('lab_tech', '/pharmacy'), 'pages that crashed now turn the person away')
check(!canOpen('accountant', '/opd') && !canOpen('accountant', '/settings/profile'), 'accountant: no OPD worklist, no hospital settings')
check(!canOpen('doctor', '/settings') && !canOpen('doctor', '/inventory'), 'doctor: no settings home, no inventory')

console.log('\nWhat should stay open')
check(canOpen('nurse', '/billing/95eeea65-2ac9-4de6-995b-3964fc91c479'), 'a nurse can open a bill from a patient’s Bills tab')
check(canOpen('lab_tech', '/billing/combined/patient/abc'), 'and a patient’s combined bill')
check(ruleFor('/dashboard') === null && ruleFor('/account/pin') === null, 'the dashboard and your own PIN are open to everyone')
check(canOpen('admin', '/settings/access') && canOpen('admin', '/pcpndt/returns'), 'admin opens everything')
check(canOpen('doctor', '/pcpndt/mtp') && !canOpen('doctor', '/pcpndt/returns'), 'doctor: Form F and MTP yes, monthly returns (report) no')

console.log('\nA grant opens exactly its area')
const billing = permissionsFromGroups(['billing'])
check(canOpen('lab_tech', '/billing', billing) && canOpen('lab_tech', '/billing/cash-book', billing), 'lab technician + billing opens Billing and Cash Book')
check(!canOpen('lab_tech', '/billing/discount-approvals', billing), '…but not Discount approvals (billing:manage is never granted)')
check(!canOpen('lab_tech', '/staff', billing), '…and nothing else')
check(canOpen('pharmacist', '/emergency/mlc', permissionsFromGroups(['mlc'])), 'pharmacist + accident register opens the MLC register')

console.log(failed ? `\n${failed} FAILED\n` : '\nEvery page opens for exactly the people it should.\n')
process.exit(failed ? 1 : 0)
