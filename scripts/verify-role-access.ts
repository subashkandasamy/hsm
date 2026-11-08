/**
 * Access an admin adds to a role (src/lib/access.ts, migration 0271).
 *
 *   npm run verify:role-access
 *
 * The rules that matter: a reserved permission can never be granted; a grant
 * adds exactly its group and nothing more; and the code and the database agree
 * on which groups and roles exist.
 */

import fs from 'fs'
import { ACCESS_GROUPS, ACCESS_GROUP_KEYS, GRANTABLE_ROLES, NEVER_GRANTED, permissionsFromGroups } from '../src/lib/access'
import { hasPermission, PERMISSION_MATRIX } from '../src/lib/rbac'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nNothing reserved can be granted')
const all = ACCESS_GROUPS.flatMap((g) => g.permissions as readonly string[])
for (const p of NEVER_GRANTED) check(!all.includes(p), `${p} is in no group`)
check(!all.some((p) => p.endsWith(':verify')), 'no ":verify" (signing) permission in any group')

console.log('\nA grant adds its group, and only that')
const billing = permissionsFromGroups(['billing'])
check(hasPermission('hr', 'billing:write', billing), 'HR + billing can take payments')
check(!hasPermission('hr', 'billing:manage', billing), 'HR + billing cannot cancel bills or approve discounts')
check(!hasPermission('hr', 'patients:write', billing), 'HR + billing cannot register patients')
check(!hasPermission('hr', 'billing:write'), 'HR without the grant cannot take payments')
check(!hasPermission('hr', 'billing:write', []) && !hasPermission('hr', 'billing:write', null), 'an empty or missing grant list adds nothing')
check(permissionsFromGroups(['nonsense', 'lab']).every((p) => (ACCESS_GROUPS.find((g) => g.key === 'lab')!.permissions as readonly string[]).includes(p)), 'unknown group keys are ignored')
const labOnly = permissionsFromGroups(['lab'])
check(hasPermission('nurse', 'lab:process', labOnly) && !hasPermission('nurse', 'lab:verify', labOnly), 'nurse + lab can process, never sign')
check(hasPermission('admin', 'pcpndt:report'), 'admin keeps everything')
check(hasPermission('pharmacist', 'pharmacy:manage', []), 'grants never take away a built-in permission')

console.log('\nThe code and the database agree (0271)')
const sql = fs.readFileSync('supabase/migrations/0271_role_access_grants.sql', 'utf8')
const list = (col: string) => (sql.match(new RegExp(`${col}\\s+text NOT NULL CHECK \\(${col} IN \\(([^)]*)\\)\\)`))?.[1] ?? '')
  .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean).sort()
check(JSON.stringify(list('access_group')) === JSON.stringify([...ACCESS_GROUP_KEYS].sort()), 'same access groups', list('access_group'))
check(JSON.stringify(list('role')) === JSON.stringify([...GRANTABLE_ROLES].sort()), 'same grantable roles', list('role'))
check(!GRANTABLE_ROLES.includes('admin' as never), 'admin is not a grantable role')
check(GRANTABLE_ROLES.every((r) => r in PERMISSION_MATRIX), 'every grantable role exists')

console.log(failed ? `\n${failed} FAILED\n` : '\nGrants add exactly what they say, and never the reserved things.\n')
process.exit(failed ? 1 : 0)
