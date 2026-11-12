// Apply what is left of an admission's advance to its unpaid bills, oldest
// first — one bill at a time through apply_advance_to_bill (0241), which locks
// and recomputes the balance itself. Settling a stay took "Adjust Advance" on
// each of seven bills (BUG-053), and the discharge gate asked for the whole
// bill while ₹21,000 sat on deposit (BUG-052).
import type { SupabaseClient } from '@supabase/supabase-js'

export async function applyAdvanceToStayBills(
  supabase: SupabaseClient, admissionId: string,
): Promise<{ applied: number; bills: number; error?: string }> {
  const { data: bills } = await supabase
    .from('bills').select('id, total, paid, status')
    .eq('admission_id', admissionId).not('status', 'in', '(cancelled,paid)')
    .order('created_at', { ascending: true })
  let applied = 0, count = 0
  for (const b of bills ?? []) {
    if (Number(b.total) - Number(b.paid) <= 0.004) continue
    const { data, error } = await supabase.rpc('apply_advance_to_bill', { p_bill_id: b.id, p_admission_id: admissionId })
    if (error) return { applied, bills: count, error: error.message }
    const res = data as { ok: boolean; error?: string; applied?: number }
    // No advance left (or nothing to apply) ends the run; any other refusal is reported.
    if (!res?.ok) {
      if (/advance/i.test(res?.error ?? '')) break
      continue
    }
    applied += Number(res.applied ?? 0); count++
  }
  return { applied: Math.round(applied * 100) / 100, bills: count }
}
