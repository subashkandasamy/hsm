import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Why a dispense could not find a batch — and what the pharmacist should do.
 *
 * Both dispensing paths pick a batch with
 *
 *   .gt('expiry', today).gte('qty_available', qty).order('expiry').limit(1)
 *
 * which asks for ONE batch able to cover the whole quantity. When none can, the
 * caller said "Insufficient stock or no valid batch available" — and that is
 * wrong often enough to matter, because a pharmacy holding 5 of an older batch
 * and 8 of a newer one has 13 units on the shelf and is told it cannot dispense
 * 10. The medicine is there. The pharmacist is sent away from a prescription
 * they could fill in two movements.
 *
 * This does not make the dispense succeed — splitting one dispense across two
 * batches is a real change (`dispense_drug` takes a single `p_batch_id`, so it
 * would need either several non-atomic calls or a new RPC, and it multiplies the
 * dispense rows, labels and bill lines that follow). That is a product decision,
 * recorded as F-75 rather than taken here.
 *
 * What it does is tell the truth, so the next move is obvious instead of hidden:
 * name the total on the shelf and the largest single batch.
 */
export interface StockShortfall {
  /** Unexpired units across all batches. */
  total: number
  /** Largest single unexpired batch. */
  largest: number
  /** True when the shelf holds enough but no one batch does. */
  splitNeeded: boolean
  /** Ready to show the person at the counter. */
  message: string
}

export async function explainStockShortfall(
  supabase: SupabaseClient,
  drugRef: string,
  qty: number,
  today: string,
  label?: string | null,
): Promise<StockShortfall> {
  const what = label ? `${label}: ` : ''

  // No tenant filter, deliberately: this runs on the caller's RLS-scoped
  // client, so the rows are already confined to their hospital. Adding
  // `tenant_id` here would read as a second line of defence it is not.
  const { data } = await supabase
    .from('drug_batches')
    .select('qty_available')
    .or(`drug_master_id.eq.${drugRef},drug_id.eq.${drugRef}`)
    .gt('expiry', today)
    .gt('qty_available', 0)

  const quantities = (data ?? []).map((b) => Number(b.qty_available) || 0)
  const total = quantities.reduce((n, q) => n + q, 0)
  const largest = quantities.length ? Math.max(...quantities) : 0

  if (total === 0) {
    return { total, largest, splitNeeded: false, message: `${what}no unexpired stock — add stock before dispensing` }
  }
  if (total < qty) {
    return { total, largest, splitNeeded: false, message: `${what}only ${total} in stock, ${qty} needed` }
  }
  // Enough on the shelf, in more than one box.
  return {
    total, largest, splitNeeded: true,
    message:
      `${what}${total} in stock but no single batch holds ${qty} — the largest has ${largest}. ` +
      `Dispense ${largest} from it, then the remaining ${qty - largest} from the next batch.`,
  }
}
