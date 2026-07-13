import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tenant-scoping helpers for **service-role** clients.
 *
 * The service-role client (`createServiceClient()` / `getReadClient()`) BYPASSES
 * Row-Level Security. Any query it runs against a tenant-owned table therefore
 * MUST filter by `tenant_id` in code — a forgotten filter is a silent
 * cross-tenant data leak. Materialized views (`mv_*_by_tenant`) have no RLS at
 * all and must always be filtered too.
 *
 * Prefer these helpers over a bare `service.from(table)` whenever the table has
 * a `tenant_id` column, so the tenant filter cannot be omitted by accident.
 *
 * @example
 *   const { data } = await selectForTenant(service, 'bills', tenantId, 'id,total')
 *     .eq('status', 'unpaid')
 *     .order('created_at', { ascending: false })
 *
 *   await insertForTenant(service, 'payments', tenantId, { bill_id, amount, method })
 */

/** SELECT from a tenant table, pre-filtered by tenant_id. Chain further filters. */
export function selectForTenant(
  service: SupabaseClient,
  table: string,
  tenantId: string,
  columns = '*',
) {
  return service.from(table).select(columns).eq('tenant_id', tenantId)
}

/** UPDATE a tenant table, constrained to the given tenant. Chain more `.eq()`s. */
export function updateForTenant(
  service: SupabaseClient,
  table: string,
  tenantId: string,
  values: Record<string, unknown>,
) {
  return service.from(table).update(values).eq('tenant_id', tenantId)
}

/** DELETE from a tenant table, constrained to the given tenant. Chain more `.eq()`s. */
export function deleteForTenant(
  service: SupabaseClient,
  table: string,
  tenantId: string,
) {
  return service.from(table).delete().eq('tenant_id', tenantId)
}

/** INSERT into a tenant table, forcing tenant_id onto every row. */
export function insertForTenant(
  service: SupabaseClient,
  table: string,
  tenantId: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
) {
  const withTid = Array.isArray(rows)
    ? rows.map((r) => ({ ...r, tenant_id: tenantId }))
    : { ...rows, tenant_id: tenantId }
  return service.from(table).insert(withTid)
}
