import { createClient } from './supabase/server'

export async function logAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  if (!actorId) return

  const supabase = await createClient()

  // Resolve tenant_id from the actor's profile (PK lookup — no extra round-trip cost).
  // audit_logs.tenant_id is NOT NULL with RLS WITH CHECK, so we must supply it.
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', actorId)
    .single()

  if (!profile?.tenant_id) return

  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    tenant_id: profile.tenant_id,
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId ?? null,
    meta: meta ?? null,
  })
}
