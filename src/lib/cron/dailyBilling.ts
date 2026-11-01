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

export interface DailyBillingRunResult {
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
 * Mirror of proxy.computeIsReadOnly, but for a headless context: a tenant that
 * the app would render read-only must NOT have new charges generated (matches
 * how page-load billing is blocked by requireWriteAccess for those tenants).
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
  const result: DailyBillingRunResult = {
    tenantsTotal: 0, tenantsBilled: 0, tenantsSkippedReadOnly: 0, tenantsSkippedNoIpd: 0,
    tenantsNoActor: 0, admissionsProcessed: 0, daysBackfilled: 0, olderDaysSkipped: 0, errors: [],
  }

  const { data: tenants, error: tenantsErr } = await service
    .from('tenants')
    .select('id, status, plan, trial_ends_at, override_access_until')
  if (tenantsErr) {
    result.errors.push({ tenantId: '*', error: `tenants query: ${tenantsErr.message}` })
    return result
  }
  result.tenantsTotal = tenants?.length ?? 0
  if (!tenants?.length) return result

  // Subscription period-ends, keyed by tenant (for the cancelled-tenant check).
  const { data: subs } = await service
    .from('subscriptions')
    .select('tenant_id, current_period_end')
  const periodEndByTenant = new Map<string, string | null>(
    (subs ?? []).map((s) => [s.tenant_id as string, (s.current_period_end as string | null) ?? null])
  )

  for (const tenant of tenants as TenantRow[]) {
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
      const { data: rows } = await service
        .from('admissions')
        .select('id, patient_id, admitting_doctor_id, admitted_at, ward:wards(name, daily_rate, room_type:ward_room_types(is_icu))')
        .eq('tenant_id', tenant.id)
        .eq('status', 'admitted')
        .limit(1000)

      const admissions: DailyBillAdmission[] = (rows ?? []).map((a) => ({
        id: a.id as string,
        patient_id: a.patient_id as string,
        admitting_doctor_id: (a.admitting_doctor_id as string | null) ?? null,
        admitted_at: (a.admitted_at as string | null) ?? null,
        ward: (a.ward as unknown as { name: string; daily_rate: number; room_type?: { is_icu: boolean | null } | null }) ?? { name: '', daily_rate: 0 },
      }))
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

  return result
}
