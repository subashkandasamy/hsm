/**
 * Day-to-day expenses (migration 0308): what they are, shared by the server
 * actions and the Expenses page.
 */

/** Offered first; a hospital types its own and they are offered from then on. */
export const STARTER_CATEGORIES = [
  'Electricity', 'Rent', 'Salaries & wages', 'Medical supplies', 'Repairs & maintenance',
  'Housekeeping', 'Food & tea', 'Transport & courier', 'Stationery & printing',
  'Phone & internet', 'Professional fees', 'Miscellaneous',
] as const

/** Named as payments name them, so the Cash Book files each under the right tile. */
export const EXPENSE_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'bank_transfer', label: 'Bank / cheque' },
] as const
export type ExpenseMethod = typeof EXPENSE_METHODS[number]['key']
export const isExpenseMethod = (v: unknown): v is ExpenseMethod =>
  typeof v === 'string' && EXPENSE_METHODS.some((m) => m.key === v)
export const methodLabel = (key: string) => EXPENSE_METHODS.find((m) => m.key === key)?.label ?? key

export interface Expense {
  id: string
  expense_date: string
  category: string
  amount: number
  paid_to: string | null
  method: ExpenseMethod
  reference: string | null
  notes: string | null
  /** The uploaded bill; null when there is none, and then no_bill_reason says why. */
  has_bill: boolean
  no_bill_reason: string | null
  created_at: string
  recorded_by: string
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
}

export interface ExpenseTotal { key: string; label: string; amount: number; count: number }

export interface ExpenseReport {
  from: string
  to: string
  /** Every expense in the range, cancelled ones included (shown struck through). */
  rows: Expense[]
  /** Totals leave cancelled expenses out. */
  total: number
  count: number
  withBill: number
  withoutBill: number
  byCategory: ExpenseTotal[]
  byMethod: ExpenseTotal[]
  byStaff: ExpenseTotal[]
}

/**
 * A cell someone typed, safe to open in a spreadsheet: one that starts like a
 * formula ("=HYPERLINK(...)", "+91…" is fine as text) is kept as text.
 */
export function csvText(v: string | null | undefined): string {
  const s = v ?? ''
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}
