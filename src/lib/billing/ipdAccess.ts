import { tenantHasModule } from '@/lib/tenantModule'

/**
 * Whether a tenant's plan includes IPD (trial includes everything). Every IPD
 * bill is created through autoIpdBill / syncNursingBillLine, which call this, so
 * a hospital on a plan without IPD (e.g. Starter after its trial) never gets IPD
 * charges — from the nightly job, the ward board, orders, OT, blood bank or
 * nursing.
 *
 * The general form now lives in `@/lib/tenantModule`, which the `/api/device/*`
 * ingest routes use for 'lab' and 'radiology' — those run headless too, and the
 * proxy skips them, so they cannot read the plan from a request header either.
 */
export async function tenantHasIpd(tenantId: string): Promise<boolean> {
  return tenantHasModule(tenantId, 'ipd')
}
