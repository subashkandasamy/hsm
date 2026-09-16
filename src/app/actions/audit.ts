'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { istDayStartISO, istDayEndISO } from '@/lib/istDate'

export interface AuditLog {
  id: string; actor_id: string | null; action: string; entity: string
  entity_id: string | null; meta: Record<string, unknown> | null; created_at: string
  actor?: { id: string; full_name: string } | null
}

export async function listAuditLogs(params?: {
  actorId?: string
  entity?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}): Promise<AuditLog[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'audit:read')

  const supabase = await createClient()
  let q = supabase
    .from('audit_logs')
    .select('*, actor:profiles(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 100)

  if (params?.offset) q = q.range(params.offset, params.offset + (params?.limit ?? 100) - 1)
  if (params?.actorId)  q = q.eq('actor_id', params.actorId)
  if (params?.entity)   q = q.eq('entity', params.entity)
  if (params?.dateFrom) q = q.gte('created_at', istDayStartISO(params.dateFrom))
  if (params?.dateTo)   q = q.lte('created_at', istDayEndISO(params.dateTo))

  const { data } = await q
  return (data ?? []) as unknown as AuditLog[]
}

export async function listActors(): Promise<{ id: string; full_name: string }[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'audit:read')
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name').order('full_name')
  return (data ?? []) as { id: string; full_name: string }[]
}
