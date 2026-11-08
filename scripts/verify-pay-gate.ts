/**
 * The pay-before-service gate (src/lib/payGate.ts).
 *
 *   npm run verify:pay-gate
 *
 * The rule that matters most is the failure direction: when the hospital's
 * setting cannot be read, the gate must keep asking for payment. Giving a
 * service away by mistake cannot be undone; asking for money that turns out
 * not to be needed can. A fake client stands in for the database so each case,
 * a read error included, can be forced.
 */

import { rulesFromRow, DEFAULT_PREPAY, getPrepayRules, unpaidAllowed } from '../src/lib/payGate'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

/** A stand-in for the Supabase client: answers billing_settings, bills and insurance_claims, and records what was asked. */
function fakeDb(opts: { settings?: Record<string, boolean> | null; settingsError?: boolean; approvedClaim?: boolean }) {
  const asked: string[] = []
  const chain = (table: string) => {
    asked.push(table)
    const q: Record<string, unknown> = {}
    const self = () => q
    for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit']) q[m] = self
    q.maybeSingle = async () => opts.settingsError
      ? { data: null, error: { message: 'relation "billing_settings" does not exist', code: '42P01' } }
      : { data: opts.settings ?? null, error: null }
    // bills sibling lookup, and the claim count (awaited directly)
    q.then = (resolve: (v: unknown) => void) => resolve(table === 'insurance_claims'
      ? { count: opts.approvedClaim ? 1 : 0, data: null, error: null }
      : { data: [], error: null })
    return q
  }
  return { client: { from: chain } as never, asked }
}
const BILL = { id: 'b1', visit_id: 'v1', admission_id: null }
const T = 't1'

async function main() {
  console.log('\nReading the setting')
  check(JSON.stringify(rulesFromRow(null)) === JSON.stringify(DEFAULT_PREPAY), 'no row → every service pay-first (today\'s behaviour)')
  check(rulesFromRow({ prepay_consultation: false }).consultation === false, 'an explicit false turns one service off')
  check(rulesFromRow({ prepay_consultation: false }).lab === true, '…and leaves the others pay-first')
  check(rulesFromRow({ prepay_lab: null }).lab === true, 'a null reads as pay-first, never as "free"')
  check(Object.isFrozen(DEFAULT_PREPAY), 'the defaults cannot be changed by accident at runtime')

  console.log('\nThe failure direction')
  {
    const origError = console.error; console.error = () => {}
    const { client } = fakeDb({ settingsError: true })
    const rules = await getPrepayRules(client, T)
    console.error = origError
    check(Object.values(rules).every(Boolean), 'settings unreadable (migration not applied) → every service pay-first', rules)
  }
  {
    const origError = console.error; console.error = () => {}
    const { client } = fakeDb({ settingsError: true, approvedClaim: false })
    const ok = await unpaidAllowed(client, T, 'consultation', BILL)
    console.error = origError
    check(ok === false, 'settings unreadable + no insurance → the unpaid service is still BLOCKED')
  }

  console.log('\nThe hospital\'s choice')
  {
    const { client, asked } = fakeDb({ settings: { prepay_consultation: false } })
    check(await unpaidAllowed(client, T, 'consultation', BILL) === true, 'consultation set to pay-later → goes ahead unpaid')
    check(!asked.includes('insurance_claims'), '…without even looking up insurance (one row decides it)')
  }
  {
    const { client } = fakeDb({ settings: { prepay_consultation: false } })
    check(await unpaidAllowed(client, T, 'lab', BILL) === false, 'consultation off does NOT switch off lab')
  }

  console.log('\nCashless still applies when the hospital wants payment first')
  {
    const { client } = fakeDb({ settings: null, approvedClaim: true })
    check(await unpaidAllowed(client, T, 'radiology', BILL) === true, 'pay-first + an approved claim → goes ahead (unchanged behaviour)')
  }
  {
    const { client } = fakeDb({ settings: null, approvedClaim: false })
    check(await unpaidAllowed(client, T, 'radiology', BILL) === false, 'pay-first + no claim → blocked (unchanged behaviour)')
  }

  console.log(failed === 0 ? '\nThe gate fails safe and follows the hospital\'s choice.\n' : `\n${failed} check(s) FAILED.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
