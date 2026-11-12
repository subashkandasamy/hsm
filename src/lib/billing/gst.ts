// Shared GST stamping used by every bill-creation path (manual generateBill,
// IPD autoIpdBill, OPD pharmacy). Keeps per-line GST + bill totals consistent
// regardless of which flow created the bill.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillItemSource } from '@/lib/types'
import { summarizeBillGst, computeRoundOff, mayChargeGst, isGstRegistered } from '@/lib/gst'

export interface GstConfig {
  /** GST invoicing switched on for this hospital. */
  enabled: boolean
  /** Registered under the composition scheme — registered, but may not tax. */
  composition: boolean
  pharmacyRate: number
}

/** True when this hospital may put tax on a bill at all. */
export const canTax = (cfg: GstConfig) =>
  mayChargeGst({ gst_enabled: cfg.enabled, gst_composition: cfg.composition })

/** True when the bill is a GST document at all (tax invoice or bill of supply). */
export const isRegistered = (cfg: GstConfig) =>
  isGstRegistered({ gst_enabled: cfg.enabled, gst_composition: cfg.composition })

// Per-source GST treatment. Healthcare services are GST-exempt; pharmacy is
// billed at MRP (GST-inclusive); consumables sold to the patient are taxable on
// top. Everything is 0% when the hospital hasn't enabled GST invoicing — or
// when it is a composition dealer, which may not collect tax at any rate.
export function gstForSource(
  source: BillItemSource,
  cfg: GstConfig,
): { rate: number; inclusive: boolean } {
  if (!canTax(cfg)) return { rate: 0, inclusive: false }
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

// ── In-patient room rent ─────────────────────────────────────────────────────
// Healthcare is GST-exempt, but room rent is not, above a threshold: 5% without
// input tax credit on a non-ICU room charged above ₹5,000 per day (47th GST
// Council; notification effective 18 July 2022, and still in force — checked
// against the September 2025 rate rationalisation, which changed medicines and
// devices, not room rent).
//
// Two details that are easy to get wrong and both matter in rupees:
//
//  - The threshold is "above ₹5,000", so a room at exactly ₹5,000 is exempt.
//    One live ward sits on exactly that number.
//  - The 5% applies to the WHOLE room charge, not only the part above ₹5,000:
//    a ₹6,000 room is taxed ₹300, not ₹50.
//
// ICU / CCU / ICCU / NICU are excluded at any rate.
export const ROOM_RENT_GST_THRESHOLD = 5000
export const ROOM_RENT_GST_RATE = 5

/**
 * The GST rate for one day of room rent. Returns a rate, not a tax amount —
 * whether the hospital charges GST at all is decided downstream by
 * `resolveLineGst`, which ignores any rate when the tenant has GST disabled.
 *
 * `isIcu` is deliberately checked for `=== false` rather than falsiness: a room
 * whose type is unknown is treated as exempt. The two failure directions are
 * not symmetric — wrongly taxing a patient's ICU bill takes money from a family
 * and appears on the invoice they are handed, whereas wrongly omitting it is
 * the hospital's own exposure and is recoverable. Every ward currently has a
 * room type, so this branch is a guard rather than a live path; the
 * `verify:gst-rooms` check reports any ward that reaches it.
 */
export function roomRentGstRate(room: { dailyRate: number; isIcu: boolean | null | undefined }): number {
  if (room.isIcu !== false) return 0
  return room.dailyRate > ROOM_RENT_GST_THRESHOLD ? ROOM_RENT_GST_RATE : 0
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
  // The override is the one route by which tax could reach a composition
  // dealer's bill: a pharmacy line inherits its batch's gst_rate, and those
  // batches carry 5% or 12% from the goods receipt whatever the hospital's own
  // registration is. So the override is only consulted when the hospital may
  // charge tax at all — `canTax`, not `enabled`.
  const rate = canTax(cfg) && override?.gst_rate != null ? override.gst_rate : defRate
  // HSN is shown on a bill of supply too, so this follows registration rather
  // than the right to tax.
  const hsn = isRegistered(cfg) ? (override?.hsn_sac ?? null) : null
  return { rate, inclusive, hsn }
}

export async function getTenantGstConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<GstConfig> {
  const { data } = await supabase
    .from('tenant_profiles')
    .select('gst_enabled, gst_composition, pharmacy_default_gst_rate')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return {
    enabled: !!data?.gst_enabled,
    composition: !!data?.gst_composition,
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
  const discount = (bill?.discount as number) ?? 0
  const gst = summarizeBillGst((items ?? []).map((i) => ({
    amount: (i.amount as number) ?? 0,
    gst_rate: (i.gst_rate as number) ?? 0,
    tax_inclusive: !!i.tax_inclusive,
  })), discount)
  const { roundOff, total } = computeRoundOff(Math.max(0, gst.subtotal - discount + gst.taxTotal))
  await supabase.from('bills').update({
    subtotal: gst.subtotal, tax: gst.taxTotal, cgst: gst.cgst, sgst: gst.sgst, round_off: roundOff, total,
  }).eq('id', billId)
  return total
}
