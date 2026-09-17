import type { SupabaseClient } from '@supabase/supabase-js'
import { getTenantGstConfig } from '@/lib/billing/gst'
import { reconcileBill } from '@/lib/billing/reconcile'
import { stampBillItem, type IpdBillLineItem } from '@/lib/ipdBilling'
import { istToday } from '@/lib/istDate'

export type ServiceBillSource = 'consultation' | 'lab' | 'radiology' | 'ot' | 'blood' | 'manual'

/**
 * Raises a standalone bill for a service (e.g. a consultation fee at booking or
 * an ER consultation), following the same rules as every other bill:
 * - invoice number from the tenant's series (tenant passed explicitly, so it also
 *   works with the service-role client used by the patient app),
 * - billing_date (IST) and bill_source set,
 * - GST-stamped lines, totals derived from the lines,
 * - a bill whose lines fail to save is voided, never left with a total and no lines,
 * - paid/status derived by reconcileBill.
 */
export async function createServiceBill(
  supabase: SupabaseClient,
  params: {
    tenantId: string
    patientId: string
    actorId: string | null
    billSource: ServiceBillSource
    lines: IpdBillLineItem[]
    visitId?: string | null
    appointmentId?: string | null
    admissionId?: string | null
    billingDate?: string
  },
): Promise<{ billId: string; billNo: string } | { error: string }> {
  const lines = params.lines.filter((l) => l.qty > 0 && l.unit_price > 0)
  if (!lines.length) return { error: 'Nothing to bill' }

  const { data: billNo, error: noErr } = await supabase.rpc('get_next_bill_no', { p_tenant_id: params.tenantId })
  if (noErr || !billNo) return { error: 'Failed to generate bill number' }

  const billId = crypto.randomUUID()
  const { error: billErr } = await supabase.from('bills').insert({
    id: billId,
    tenant_id: params.tenantId,
    patient_id: params.patientId,
    visit_id: params.visitId ?? null,
    appointment_id: params.appointmentId ?? null,
    admission_id: params.admissionId ?? null,
    bill_no: billNo as string,
    billing_date: params.billingDate ?? istToday(),
    bill_source: params.billSource,
    subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0,
    status: 'unpaid',
    created_by: params.actorId,
  })
  if (billErr) {
    console.error('[createServiceBill] bill insert failed', { source: params.billSource, error: billErr.message })
    return { error: billErr.message }
  }

  const cfg = await getTenantGstConfig(supabase, params.tenantId)
  const { error: itemErr } = await supabase.from('bill_items').insert(
    lines.map((l) => stampBillItem(l, { tenantId: params.tenantId, billId, cfg })),
  )
  if (itemErr) {
    console.error('[createServiceBill] bill line insert failed', { source: params.billSource, error: itemErr.message })
    // Void, don't delete: the invoice number is already issued and must stay in sequence.
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
    return { error: itemErr.message }
  }

  await reconcileBill(supabase, billId)
  return { billId, billNo: billNo as string }
}
