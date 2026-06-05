import { createClient } from './supabase/server'

export async function logAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId ?? null,
    meta: meta ?? null,
  })
}
