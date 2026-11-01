import { createServiceClient } from '@/lib/supabase/service'
import { catchUpDailyCharges, istDate, type DailyBillAdmission } from '@/lib/ipdDailyBilling'
import { planHasModule, type PlanKey, type TenantStatus } from '@/lib/plans'

interface TenantRow {
  id: string
  status: string
  plan: string
  trial_ends_at: string | null
  override_access_until: string | null
}

/** Admissions fetched per page. Pages, so there is no silent ceiling. */
const ADMISSION_PAGE = 500

/**
 * How long the sweep may run before it stops and says so.
 *
 * The route's `maxDuration` is 300s. Being killed by the platform mid-loop is
 * the one outcome worth avoiding, because a killed run reports nothing at all —
 * the partial pass becomes invisible (F-37). Stopping ourselves a little early
 * trades a few tenants for a result that names them.
 */
const TIME_BUDGET_MS = 240_000

export interface DailyBillingRunResult {
  /** False when the time budget stopped the sweep before every tenant. */
  complete: boolean
  /** Tenants never reached because the budget ran out. Billed by tomorrow's catch-up. */
  tenantsNotReached: number
  durationMs: number
  tenantsTotal: number
  tenantsBilled: number
  tenantsSkippedReadOnly: number
  /** Plan without IPD (e.g. Starter) — no IPD charges generated. */
  tenantsSkippedNoIpd: number
  tenantsNoActor: number
  admissionsProcessed: number
  /** Missed past days billed by the catch-up. */
  daysBackfilled: number
  /** Unbilled days older than the catch-up window, left for staff review. */
  olderDaysSkipped: number
  errors: { tenantId: string; error: string }[]
}

/**
 * The headless read-only test: a tenant the app would render read-only must NOT
 * have new charges generated (matching how page-load billing is blocked by
 * requireWriteAccess).
 *
 * NOT a mirror of proxy.computeIsReadOnly, and must not be made one (F-38).
 * This used to call itself a mirror, which invited exactly the wrong edit. The
 * two deliberately disagree on one status:
 *
 *   status === 'suspended'  →  proxy returns FALSE, this returns TRUE
 *
 * The proxy returns false because a suspended tenant is hard-blocked earlier in
 * the request, so "read-only" would be a weaker statement than the truth. Here
 * there is no request to block, so suspension has to mean "generate nothing".
 * Both are right for their own caller; syncing them would either start billing
 * suspended hospitals or stop billing live ones.
 *
 * `currentPeriodEnd` comes from the tenant's subscription row (may be absent).
 */
function isReadOnly(tenant: TenantRow, currentPeriodEnd: string | null): boolean {
  const now = new Date()
  if (tenant.override_access_until && new Date(tenant.override_access_until) > now) return false
  if (tenant.status === 'suspended') return true // hard-blocked in-app → skip billing
  if (tenant.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) <= now) return true
  if (tenant.status === 'cancelled') {
    const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null
    if (periodEnd && periodEnd <= now) return true
  }
  return false
}

/**
 * Generate the day's missing IPD daily charges for every active tenant.
 *
 * Runs headless (no request session): uses the service-role client, resolves a
 * per-tenant system actor (the tenant's earliest active admin, for a valid
 * `created_by`), and skips tenants the app treats as read-only. Idempotent —
 * safe to run more than once a day thanks to the generator's dedup keys.
 */
export async function runDailyBillingForAllTenants(): Promise<DailyBillingRunResult> {
  const service = createServiceClient()
  const startedAt = Date.now()
  const result: DailyBillingRunResult = {
    complete: true, tenantsNotReached: 0, durationMs: 0,
    tenantsTotal: 0, tenantsBilled: 0, tenantsSkippedReadOnly: 0, tenantsSkippedNoIpd: 0,
    tenantsNoActor: 0, admissionsProcessed: 0, daysBackfilled: 0, olderDaysSkipped: 0, errors: [],
  }

  const { data: tenants, error: tenantsErr } = await service
    .from('tenants')
    .select('id, status, plan, trial_ends_at, override_access_until')
  if (tenantsErr) {
    result.errors.push({ tenantId: '*', error: `tenants query: ${tenantsErr.message}` })
    result.durationMs = Date.now() - startedAt
    return result
  }
  result.tenantsTotal = tenants?.length ?? 0
  if (!tenants?.length) {
    result.durationMs = Date.now() - startedAt
    return result
  }

  // Subscription period-ends, keyed by tenant (for the cancelled-tenant check).
  const { data: subs } = await service
    .from('subscriptions')
    .select('tenant_id, current_period_end')
  const periodEndByTenant = new Map<string, string | null>(
    (subs ?? []).map((s) => [s.tenant_id as string, (s.current_period_end as string | null) ?? null])
  )

  const queue = tenants as TenantRow[]
  for (let idx = 0; idx < queue.length; idx++) {
    const tenant = queue[idx]

    // Stop on our own terms rather than the platform's. A tenant left here is
    // not a lost charge: tomorrow's run backfills the missed day via
    // catchUpDailyCharges. What was missing was any record that it happened.
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      result.complete = false
      result.tenantsNotReached = queue.length - idx
      break
    }

    try {
      if (tenant.status === 'purged') continue

      // Blocked hospitals get no IPD charges. Record the day as blocked (when
      // there are admitted patients) so a later catch-up never back-bills it.
      const readOnly = isReadOnly(tenant, periodEndByTenant.get(tenant.id) ?? null)
      const noIpd = !planHasModule((tenant.plan ?? 'starter') as PlanKey, tenant.status as TenantStatus, 'ipd')
      if (readOnly || noIpd) {
        if (readOnly) result.tenantsSkippedReadOnly++
        else result.tenantsSkippedNoIpd++
        const { count: admitted } = await service
          .from('admissions').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'admitted')
        if ((admitted ?? 0) > 0) {
          await service.from('ipd_billing_blocked_days').upsert(
            { tenant_id: tenant.id, day: istDate(), reason: readOnly ? 'readonly' : 'plan' },
            { onConflict: 'tenant_id,day', ignoreDuplicates: true },
          )
        }
        continue
      }

      // Resolve a system actor: the tenant's earliest active admin (for created_by).
      const { data: admin } = await service
        .from('profiles')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!admin?.id) {
        result.tenantsNoActor++
        continue
      }

      // Active admissions for this tenant, in the shape the generator expects.
      // Paged rather than `.limit(1000)` (F-37): a flat limit meant that beyond
      // it, charges were silently not generated — no error, no counter, nothing
      // in the result. The ceiling was absurd headroom for a 15-bed hospital,
      // but a silent revenue stop is the wrong failure mode at any size, and
      // the page loop removes the ceiling rather than raising it.
      const admissions: DailyBillAdmission[] = []
      for (let from = 0; ; from += ADMISSION_PAGE) {
        const { data: rows, error: admErr } = await service
          .from('admissions')
          .select('id, patient_id, admitting_doctor_id, admitted_at, ward:wards(name, daily_rate, room_type:ward_room_types(is_icu))')
          .eq('tenant_id', tenant.id)
          .eq('status', 'admitted')
          .order('id', { ascending: true })
          .range(from, from + ADMISSION_PAGE - 1)
        if (admErr) throw new Error(`admissions query: ${admErr.message}`)
        for (const a of rows ?? []) {
          admissions.push({
            id: a.id as string,
            patient_id: a.patient_id as string,
            admitting_doctor_id: (a.admitting_doctor_id as string | null) ?? null,
            admitted_at: (a.admitted_at as string | null) ?? null,
            ward: (a.ward as unknown as { name: string; daily_rate: number; room_type?: { is_icu: boolean | null } | null }) ?? { name: '', daily_rate: 0 },
          })
        }
        if ((rows?.length ?? 0) < ADMISSION_PAGE) break
      }
      if (!admissions.length) continue

      const catchUp = await catchUpDailyCharges(service, admin.id as string, tenant.id, admissions)
      result.daysBackfilled += catchUp.backfilled.length
      result.olderDaysSkipped += catchUp.skippedOlder.reduce((n, s) => n + s.days, 0)
      result.tenantsBilled++
      result.admissionsProcessed += admissions.length
    } catch (e) {
      result.errors.push({ tenantId: tenant.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  result.durationMs = Date.now() - startedAt
  return result
}
