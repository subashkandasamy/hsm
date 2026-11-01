import { createServiceClient } from './supabase/service'
import { createTtlCache } from './ttlCache'

// A profile's tenant does not change, so re-reading it on every audited action
// was a round trip for a constant (F-19 counted this as the fifth). Thirty
// minutes, bounded, and a miss simply costs the lookup it used to always do.
const actorTenantCache = createTtlCache<string>({ ttlMs: 30 * 60 * 1000, max: 2000 })

/**
 * Record one entry in the audit trail.
 *
 * Returns void and is awaited at 337 call sites that do not inspect a result,
 * which is deliberate: a clinician's action must not fail because a log row
 * did not persist. But "cannot fail the caller" was previously implemented as
 * "cannot be noticed" — the insert's error was never read, so an RLS
 * rejection, a constraint violation or an outage lost the record with no
 * signal at all, in the one table whose entire purpose is to prove who did
 * what. Both early returns dropped entries silently too.
 *
 * Two changes, neither of which touches a call site:
 *
 * 1. Every path that drops an entry now says so, with enough context
 *    (actor, action, entity, id) to reconstruct what was lost.
 *
 * 2. The writes go through the SERVICE client rather than the caller's. An
 *    audit entry is not the caller's data to be permitted or refused — it is
 *    the record of what they did, and it is exactly when something unusual is
 *    happening that the caller's own visibility is least trustworthy. The
 *    tenant is still derived from the actor's own profile, so nothing
 *    cross-tenant can be written, and `audit_logs` carries no UPDATE or DELETE
 *    policy, so this remains append-only. It also means logAudit no longer
 *    depends on a request-scoped cookie client, so a future headless caller
 *    (a cron job) records properly instead of throwing.
 */
export async function logAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  if (!actorId) {
    console.error('[audit] entry dropped — no actor id', { action, entity, entityId })
    return
  }

  const service = createServiceClient()

  // Resolve tenant_id from the actor's profile.
  // audit_logs.tenant_id is NOT NULL with RLS WITH CHECK, so we must supply it.
  let tenantId = actorTenantCache.get(actorId)
  if (!tenantId) {
    const { data: profile, error: profileErr } = await service
      .from('profiles')
      .select('tenant_id')
      .eq('id', actorId)
      .maybeSingle()

    if (profileErr || !profile?.tenant_id) {
      console.error('[audit] entry dropped — could not resolve the actor\'s tenant', {
        actorId, action, entity, entityId, error: profileErr?.message ?? 'no profile or no tenant_id',
      })
      return
    }
    tenantId = profile.tenant_id as string
    actorTenantCache.set(actorId, tenantId)
  }

  const { error } = await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId ?? null,
    meta: meta ?? null,
  })

  if (error) {
    console.error('[audit] FAILED to record an action', {
      actorId, action, entity, entityId, tenantId, error: error.message,
    })
  }
}
