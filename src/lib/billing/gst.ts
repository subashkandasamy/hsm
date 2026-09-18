// Shared GST stamping used by every bill-creation path (manual generateBill,
// IPD autoIpdBill, OPD pharmacy). Keeps per-line GST + bill totals consistent
// regardless of which flow created the bill.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillItemSource } from '@/lib/types'
import { summarizeBillGst, computeRoundOff } from '@/lib/gst'

export interface GstConfig {
  enabled: boolean
  pharmacyRate: number
}

// Per-source GST treatment. Healthcare services are GST-exempt; pharmacy is
// billed at MRP (GST-inclusive); consumables sold to the patient are taxable on
// top. Everything is 0% when the hospital hasn't enabled GST invoicing.
export function gstForSource(
  source: BillItemSource,
  cfg: GstConfig,
): { rate: number; inclusive: boolean } {
  if (!cfg.enabled) return { rate: 0, inclusive: false }
  switch (source) {
    case 'pharmacy':
    case 'ipd_pharmacy':
    case 'pharmacy_sale_item':
    case 'vaccine':
      return { rate: cfg.pharmacyRate, inclusive: true }
    case 'ot_consumable':
      return { rate: 12, inclusive: false }
    default:
      return { rate: 0, inclusive: false }
  }
}

/**
 * Resolves the effective GST rate / inclusivity / HSN for a line: an explicit
 * per-line override (e.g. a pharmacy line inheriting its batch's rate + HSN)
 * wins over the per-source default.
 */
export function resolveLineGst(
  source: BillItemSource,
  cfg: GstConfig,
  override?: { gst_rate?: number | null; hsn_sac?: string | null },
): { rate: number; inclusive: boolean; hsn: string | null } {
  const { rate: defRate, inclusive } = gstForSource(source, cfg)
  const rate = cfg.enabled && override?.gst_rate != null ? override.gst_rate : defRate
  const hsn = cfg.enabled ? (override?.hsn_sac ?? null) : null
  return { rate, inclusive, hsn }
}

export async function getTenantGstConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<GstConfig> {
  const { data } = await supabase
    .from('tenant_profiles')
    .select('gst_enabled, pharmacy_default_gst_rate')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return {
    enabled: !!data?.gst_enabled,
    pharmacyRate: Number(data?.pharmacy_default_gst_rate ?? 12),
  }
}

/**
 * Recomputes a bill's GST aggregates (subtotal, CGST/SGST, tax, round-off,
 * total) from its line items and current discount. Returns the new total.
 */
export async function recomputeBillGstTotals(
  supabase: SupabaseClient,
  billId: string,
): Promise<number> {
  const { data: bill } = await supabase.from('bills').select('discount').eq('id', billId).single()
  const { data: items } = await supabase
    .from('bill_items').select('amount, gst_rate, tax_inclusive').eq('bill_id', billId)
  const gst = summarizeBillGst((items ?? []).map((i) => ({
    amount: (i.amount as number) ?? 0,
    gst_rate: (i.gst_rate as number) ?? 0,
    tax_inclusive: !!i.tax_inclusive,
  })))
  const discount = (bill?.discount as number) ?? 0
  const { roundOff, total } = computeRoundOff(Math.max(0, gst.subtotal - discount + gst.taxTotal))
  await supabase.from('bills').update({
    subtotal: gst.subtotal, tax: gst.taxTotal, cgst: gst.cgst, sgst: gst.sgst, round_off: roundOff, total,
  }).eq('id', billId)
  return total
}
