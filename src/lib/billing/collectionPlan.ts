import type { SupabaseClient } from '@supabase/supabase-js'
import { pageAll } from '@/lib/supabase/pageAll'
import { dueByAccount, MAIN, type PlanBill } from '@/lib/billing/collectionAccounts'
import type { CollectionAccountDue, InsuranceBankAccount } from '@/lib/types'

/**
 * The hospital's collection accounts as they stand: the main account (the UPI
 * id on the hospital profile), the other accounts, and which department goes
 * where. Read through RLS, so always the caller's own hospital.
 */
export async function loadCollectionSetup(supabase: SupabaseClient, tenantId: string): Promise<{
  main: { vpa: string | null; payeeName: string; hospitalName: string }
  accounts: InsuranceBankAccount[]
  routes: Record<string, string>
}> {
  const [{ data: profile }, { data: accounts, error: accErr }, { data: routes, error: routeErr }] = await Promise.all([
    supabase.from('tenant_profiles').select('name, upi_vpa, upi_payee_name').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('insurance_bank_accounts').select('*').eq('tenant_id', tenantId).order('account_name'),
    supabase.from('collection_account_routes').select('department, account_id').eq('tenant_id', tenantId),
  ])
  // Never quietly route everything to main because a read failed: say so.
  if (accErr) throw new Error(`Could not read the hospital's accounts: ${accErr.message}`)
  if (routeErr) throw new Error(`Could not read which account each department uses: ${routeErr.message}`)

  const hospitalName = (profile?.name as string | undefined) || 'Hospital'
  return {
    main: {
      vpa: (profile?.upi_vpa as string | null) ?? null,
      payeeName: (profile?.upi_payee_name as string | null) || hospitalName,
      hospitalName,
    },
    accounts: (accounts ?? []) as InsuranceBankAccount[],
    routes: Object.fromEntries((routes ?? []).map((r) => [r.department as string, r.account_id as string])),
  }
}

/**
 * What the given bills still owe each account, with the UPI id to collect it
 * into. Bills are taken oldest first, so a part payment into one account
 * clears its oldest bills first.
 */
export async function loadCollectionPlan(
  supabase: SupabaseClient, tenantId: string, billIds: string[],
): Promise<CollectionAccountDue[]> {
  const ids = [...new Set(billIds)]
  if (!ids.length) return []

  const [setup, { data: billRows, error: billErr }, items, payments] = await Promise.all([
    loadCollectionSetup(supabase, tenantId),
    supabase.from('bills').select('id, bill_no, total, status, created_at').in('id', ids),
    pageAll<{ bill_id: string; source: string | null; amount: number }>((f, t) =>
      supabase.from('bill_items').select('bill_id, source, amount').in('bill_id', ids).order('id').range(f, t)),
    pageAll<{ bill_id: string; amount: number; method: string | null; account_id: string | null }>((f, t) =>
      supabase.from('payments').select('bill_id, amount, method, account_id').in('bill_id', ids).order('id').range(f, t)),
  ])
  if (billErr) throw new Error(`Could not read the bills: ${billErr.message}`)

  const bills = ((billRows ?? []) as Array<{ id: string; bill_no: string; total: number; status: string; created_at: string }>)
    .filter((b) => b.status !== 'cancelled')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.bill_no.localeCompare(b.bill_no))
  const billNo = new Map(bills.map((b) => [b.id, b.bill_no]))

  const plan: PlanBill[] = bills.map((b) => ({
    id: b.id,
    total: Number(b.total),
    items: items.filter((i) => i.bill_id === b.id),
    payments: payments.filter((p) => p.bill_id === b.id),
  }))

  const active = setup.accounts.filter((a) => a.is_active)
  const activeIds = new Set(active.map((a) => a.id))
  const byId = new Map(active.map((a) => [a.id, a]))

  return dueByAccount(plan, setup.routes, activeIds).map((d) => {
    const acct = d.account === MAIN ? null : byId.get(d.account)!
    return {
      key: d.account,
      name: acct ? acct.account_name : 'Main account',
      vpa: acct ? (acct.upi_vpa ?? null) : setup.main.vpa,
      payeeName: acct ? (acct.upi_payee_name || setup.main.hospitalName) : setup.main.payeeName,
      due: d.due,
      bills: d.bills.map((b) => ({ bill_id: b.bill_id, bill_no: billNo.get(b.bill_id) ?? '', due: b.due })),
    }
  })
}
