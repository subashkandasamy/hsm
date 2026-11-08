/**
 * Which bank account each rupee of a bill is owed to.
 *
 * A hospital can keep separate accounts — say one for pharmacy, one for lab and
 * radiology — and point each department at one. Anything not pointed anywhere
 * goes to the MAIN account: the UPI id on the hospital profile. So a hospital
 * that sets nothing behaves exactly as before.
 *
 * Routing reads the bill's LINES, not the bill: pharmacy, counter-sale and
 * hand-built bills carry no department on the bill itself, and an IPD final
 * bill mixes several. Each account's share of a bill is its lines' share of the
 * bill total (so GST, discount and round-off are shared in proportion), rounded
 * to the paisa with any remainder on the largest share.
 *
 * Payments already made:
 * - UPI / bank transfer went to a known account (`account_id`, or main when it
 *   is empty — before this feature main was the only account). They reduce
 *   that account's share.
 * - Cash, card, advance and insurance went to no particular account. Each
 *   account bears them in proportion to its share of the bill, so the order
 *   payments arrived in never moves money between accounts.
 * - A directed payment larger than its account's share (the routing changed
 *   after it was paid) spills over and is shared like cash, so the dues still
 *   add up to the bill's balance.
 *
 * Pure, so it can be tested: `npm run verify:collection-accounts`.
 */

/** Departments an admin can point at an account, and the bill-line sources in each. */
export const DEPARTMENTS = [
  { key: 'consultation', label: 'Consultation',             sources: ['consultation'] },
  { key: 'room',         label: 'Room, nursing & ICU',      sources: ['bed', 'nursing', 'nursing_morning', 'nursing_night', 'icu'] },
  { key: 'pharmacy',     label: 'Pharmacy (counter & ward)', sources: ['pharmacy', 'ipd_pharmacy', 'pharmacy_sale_item'] },
  { key: 'lab',          label: 'Laboratory',               sources: ['lab'] },
  { key: 'radiology',    label: 'Radiology',                sources: ['radiology'] },
  { key: 'ot',           label: 'Operation theatre',        sources: ['ot', 'ot_consumable'] },
  { key: 'blood',        label: 'Blood bank',               sources: ['blood'] },
  { key: 'dental',       label: 'Dental',                   sources: ['dental'] },
  { key: 'vaccine',      label: 'Vaccination',              sources: ['vaccine'] },
  { key: 'other',        label: 'Other charges',            sources: ['manual'] },
] as const

export type DepartmentKey = typeof DEPARTMENTS[number]['key']
export const DEPARTMENT_KEYS: readonly DepartmentKey[] = DEPARTMENTS.map((d) => d.key)

const SOURCE_TO_DEPT = new Map<string, DepartmentKey>(
  DEPARTMENTS.flatMap((d) => d.sources.map((s) => [s, d.key] as [string, DepartmentKey])),
)

/** A source nobody listed (a new one added later) is "other", never dropped. */
export function departmentOf(source: string | null | undefined): DepartmentKey {
  return SOURCE_TO_DEPT.get(source ?? '') ?? 'other'
}

export function isDepartmentKey(v: unknown): v is DepartmentKey {
  return typeof v === 'string' && (DEPARTMENT_KEYS as readonly string[]).includes(v)
}

/**
 * IPD advance deposits are routed like a department (0268) but are not a
 * bill-line source: the whole deposit goes into one account.
 */
export const ADVANCE_KEY = 'advance'
export type RouteKey = DepartmentKey | typeof ADVANCE_KEY
export function isRouteKey(v: unknown): v is RouteKey {
  return v === ADVANCE_KEY || isDepartmentKey(v)
}

/** The main account has no row; this key stands for it everywhere outside the database (where it is NULL). */
export const MAIN = 'main'
export type AccountKey = string   // an insurance_bank_accounts id, or MAIN

/** Methods that land in one particular account. The others go to no account. */
export const DIRECTED_METHODS = ['upi', 'bank_transfer'] as const
export const isDirected = (method: string | null | undefined) =>
  (DIRECTED_METHODS as readonly string[]).includes(method ?? '')

export interface PlanBill {
  id: string
  total: number
  items: Array<{ source: string | null; amount: number }>
  payments: Array<{ amount: number; method: string | null; account_id: string | null }>
}

/**
 * dept → account id. A department missing here, or pointed at an account that
 * is not in `activeAccounts`, goes to MAIN.
 */
export function accountForDepartment(
  dept: DepartmentKey | 'advance', routes: Partial<Record<string, string | null>>, activeAccounts: ReadonlySet<string>,
): AccountKey {
  const id = routes[dept]
  return id && activeAccounts.has(id) ? id : MAIN
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Splits `amount` over `weights` in proportion, to the paisa; the remainder goes to the largest weight. */
function shareOut(amount: number, weights: Map<AccountKey, number>): Map<AccountKey, number> {
  const out = new Map<AccountKey, number>()
  const total = [...weights.values()].reduce((s, v) => s + v, 0)
  if (total <= 0 || amount === 0) return out
  const entries = [...weights.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  let given = 0
  for (const [k, w] of entries) { const s = r2(amount * w / total); out.set(k, s); given = r2(given + s) }
  const rem = r2(amount - given)
  if (rem && entries.length) out.set(entries[0][0], r2(out.get(entries[0][0])! + rem))
  return out
}

/**
 * What one bill still owes each account. Accounts owed nothing are left out.
 * The values always add up to the bill's balance (total − all payments), when
 * that is positive.
 */
export function billDueByAccount(
  bill: PlanBill, routes: Partial<Record<string, string | null>>, activeAccounts: ReadonlySet<string>,
): Map<AccountKey, number> {
  const total = r2(Number(bill.total) || 0)
  const paidAll = r2(bill.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))
  const balance = r2(total - paidAll)
  if (balance <= 0) return new Map()

  // Each account's line value, then its share of the bill total.
  const lineValue = new Map<AccountKey, number>()
  for (const it of bill.items) {
    const v = Number(it.amount) || 0
    if (v <= 0) continue
    const acct = accountForDepartment(departmentOf(it.source), routes, activeAccounts)
    lineValue.set(acct, r2((lineValue.get(acct) ?? 0) + v))
  }
  if (!lineValue.size) lineValue.set(MAIN, 1)   // a bill with no lines is owed to main
  const share = shareOut(total, lineValue)

  // Cash, card, advance and insurance went to no account: each account bears
  // its share of them in proportion to its share of the BILL — not of what is
  // left after other payments, or the order payments arrived in would move
  // money between accounts.
  let undirected = 0
  const directed = new Map<AccountKey, number>()
  for (const p of bill.payments) {
    const amt = r2(Number(p.amount) || 0)
    if (!amt) continue
    if (!isDirected(p.method)) { undirected = r2(undirected + amt); continue }
    const acct = p.account_id ?? MAIN
    if (!share.has(acct)) { undirected = r2(undirected + amt); continue }   // an account this bill owes nothing
    directed.set(acct, r2((directed.get(acct) ?? 0) + amt))
  }
  const cashCut = shareOut(undirected, share)
  const remaining = new Map<AccountKey, number>()
  for (const [k, v] of share) remaining.set(k, r2(v - (cashCut.get(k) ?? 0) - (directed.get(k) ?? 0)))

  // An account paid more than its share (the routing changed after it was
  // paid): the excess is shared over the accounts still owed, by what they owe.
  for (let pass = 0; pass < share.size; pass++) {
    const excess = r2([...remaining.values()].filter((v) => v < 0).reduce((s, v) => s - v, 0))
    if (excess <= 0) break
    const owed = new Map([...remaining].filter(([, v]) => v > 0))
    for (const k of remaining.keys()) if ((remaining.get(k) ?? 0) < 0) remaining.set(k, 0)
    const cut = shareOut(excess, owed)
    for (const [k, c] of cut) remaining.set(k, r2((remaining.get(k) ?? 0) - c))
  }

  const due = new Map<AccountKey, number>()
  for (const [k, v] of remaining) if (v > 0) due.set(k, v)

  // Rounding can leave the sum a paisa off the balance; settle it on the largest due.
  const sum = r2([...due.values()].reduce((s, v) => s + v, 0))
  const drift = r2(balance - sum)
  if (drift && due.size) {
    const [k] = [...due.entries()].sort((a, b) => b[1] - a[1])[0]
    due.set(k, r2(due.get(k)! + drift))
  }
  return due
}

export interface AccountDue {
  account: AccountKey
  due: number
  /** This account's due on each bill, in the order the bills were given. */
  bills: Array<{ bill_id: string; due: number }>
}

/** What several bills owe each account. MAIN first, then the others by amount owed. */
export function dueByAccount(
  bills: PlanBill[], routes: Partial<Record<string, string | null>>, activeAccounts: ReadonlySet<string>,
): AccountDue[] {
  const byAcct = new Map<AccountKey, AccountDue>()
  for (const b of bills) {
    for (const [acct, d] of billDueByAccount(b, routes, activeAccounts)) {
      const cur = byAcct.get(acct) ?? { account: acct, due: 0, bills: [] }
      cur.due = r2(cur.due + d)
      cur.bills.push({ bill_id: b.id, due: d })
      byAcct.set(acct, cur)
    }
  }
  return [...byAcct.values()].sort((a, b) =>
    (a.account === MAIN ? -1 : b.account === MAIN ? 1 : 0) || b.due - a.due)
}

/**
 * Spread an amount paid into one account over its bills, in the order given,
 * never more than that account's due on a bill. Returns null when the amount
 * is more than the account is owed.
 */
export function allocateToAccount(acct: AccountDue, amount: number): Array<{ bill_id: string; amount: number }> | null {
  let left = r2(amount)
  if (left <= 0 || left > r2(acct.due) + 0.001) return null
  const out: Array<{ bill_id: string; amount: number }> = []
  for (const b of acct.bills) {
    if (left <= 0) break
    const take = r2(Math.min(b.due, left))
    if (take > 0) { out.push({ bill_id: b.bill_id, amount: take }); left = r2(left - take) }
  }
  return left > 0.001 ? null : out
}
