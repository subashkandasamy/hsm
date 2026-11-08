'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission, PERMISSION_MATRIX } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { ACCESS_GROUPS, GRANTABLE_ROLES, isAccessGroupKey, isGrantableRole, type AccessGroupKey, type GrantableRole } from '@/lib/access'

type SimpleResult = { success: true } | { success: false; error: string }

export interface RoleAccessGrid {
  /** Groups an admin has added, per role. */
  granted: Record<GrantableRole, AccessGroupKey[]>
  /** Groups a role already has in full by its built-in permissions — shown as included, not tickable. */
  builtIn: Record<GrantableRole, AccessGroupKey[]>
  /** false when the grants could not be read (migration 0271 not applied). */
  readable: boolean
}

function builtInGroups(role: GrantableRole): AccessGroupKey[] {
  const perms = PERMISSION_MATRIX[role] as readonly string[]
  return ACCESS_GROUPS.filter((g) => g.permissions.every((p) => perms.includes(p))).map((g) => g.key)
}

/** The grid for Settings → Roles & access. */
export async function getRoleAccess(): Promise<RoleAccessGrid> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  const supabase = await createClient()
  const empty = () => Object.fromEntries(GRANTABLE_ROLES.map((r) => [r, [] as AccessGroupKey[]])) as Record<GrantableRole, AccessGroupKey[]>
  const builtIn = Object.fromEntries(GRANTABLE_ROLES.map((r) => [r, builtInGroups(r)])) as Record<GrantableRole, AccessGroupKey[]>

  const { data, error } = await supabase.from('role_access_grants')
    .select('role, access_group').eq('tenant_id', actor.tenant_id)
  if (error) {
    console.error('[roleAccess] read failed:', error.message)
    return { granted: empty(), builtIn, readable: false }
  }
  const granted = empty()
  for (const r of data ?? []) {
    if (isGrantableRole(r.role) && isAccessGroupKey(r.access_group)) granted[r.role].push(r.access_group)
  }
  return { granted, builtIn, readable: true }
}

/** Add an access group to a role, or take it away again. Admin only. */
export async function setRoleAccess(role: string, group: string, on: boolean): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  if (!isGrantableRole(role)) return { success: false, error: 'That role cannot be changed here' }
  if (!isAccessGroupKey(group)) return { success: false, error: 'Unknown access group' }
  if (typeof on !== 'boolean') return { success: false, error: 'Invalid value' }
  if (builtInGroups(role).includes(group)) return { success: false, error: 'This role already has that access.' }

  const supabase = await createClient()
  // .select() so a write RLS refused (a non-admin) is not reported as saved.
  const { data, error } = on
    ? await supabase.from('role_access_grants')
        .upsert({ tenant_id: actor.tenant_id, role, access_group: group, granted_by: actor.id }, { onConflict: 'tenant_id,role,access_group', ignoreDuplicates: true })
        .select('role')
    : await supabase.from('role_access_grants')
        .delete().eq('tenant_id', actor.tenant_id).eq('role', role).eq('access_group', group)
        .select('role')
  if (error) return { success: false, error: error.message }
  if (on && !data?.length) {
    // ignoreDuplicates returns no row when it was already granted — that is fine; refused is not.
    const { data: already } = await supabase.from('role_access_grants').select('role')
      .eq('tenant_id', actor.tenant_id).eq('role', role).eq('access_group', group).maybeSingle()
    if (!already) return { success: false, error: 'Not saved — only an active admin can change access.' }
  }
  if (!on && !data?.length) {
    const { data: still } = await supabase.from('role_access_grants').select('role')
      .eq('tenant_id', actor.tenant_id).eq('role', role).eq('access_group', group).maybeSingle()
    if (still) return { success: false, error: 'Not saved — only an active admin can change access.' }
  }

  // entity_id is a uuid column: the hospital is the thing whose access changed; role and group go in meta.
  await logAudit(actor.id, on ? 'grant' : 'revoke', 'role_access', actor.tenant_id, { role, access_group: group })
  return { success: true }
}
