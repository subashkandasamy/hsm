/**
 * Drug schedules on the hospital's own medicines.
 *
 *   npm run verify:drug-schedule
 *
 * Guards the trap that made the field unsettable: DrugSchema had no `schedule`
 * key, and Zod strips unknown keys, so a form could send it and it would vanish
 * without an error. The H1 register reads drugs.schedule, so a stripped value
 * meant a register that silently never filled.
 */

import { DrugSchema, DispenseSchema } from '../src/lib/schemas'
import { isDrugSchedule, DRUG_SCHEDULES, SCHEDULE_HINT, requiresSupplyReason, cleanSupplyReason, SUPPLY_REASON_MAX } from '../src/lib/pharmacy/schedule'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nThe schema keeps the schedule')
check(DrugSchema.parse({ name: 'Alprax 0.5', schedule: 'X' }).schedule === 'X', 'a schedule sent is a schedule kept (not stripped)')
check(DrugSchema.parse({ name: 'Crocin' }).schedule === undefined, 'leaving it out changes nothing')
check(DrugSchema.parse({ name: 'Crocin', schedule: null }).schedule === null, 'null clears it')
check(!DrugSchema.safeParse({ name: 'x', schedule: 'Z' }).success, 'an invalid schedule is refused, not stored')
check(DrugSchema.parse({ name: 'x' }).reorder_level === 0, 'reorder_level default untouched (the reason updates use narrow actions)')

console.log('\nOnly the four schedules')
for (const v of ['H', 'H1', 'X', 'G']) check(isDrugSchedule(v), `"${v}" accepted`)
for (const v of ['h1', 'OTC', '', null, undefined, 'H 1']) check(!isDrugSchedule(v), `${JSON.stringify(v)} refused`)
check(DRUG_SCHEDULES.every((s) => !!SCHEDULE_HINT[s]), 'every schedule has a hint to show where it is chosen')

console.log('\nThe reason for a Schedule X supply (0269)')
check(requiresSupplyReason('X') && requiresSupplyReason('x'), 'X needs a reason, whatever the case')
check(!requiresSupplyReason('H1') && !requiresSupplyReason('H') && !requiresSupplyReason(null), 'H1, H and unscheduled do not')
check(cleanSupplyReason('  pain  ') === 'pain', 'trimmed')
check(cleanSupplyReason('chronic   back\n pain') === 'chronic back pain', 'runs of spaces and new lines collapse')
for (const v of ['', ' ', 'a', null, undefined, 42]) check(cleanSupplyReason(v) === null, `${JSON.stringify(v)} is no reason`)
check(cleanSupplyReason('x'.repeat(300))?.length === SUPPLY_REASON_MAX, 'a very long reason is cut, not refused')
const ds = DispenseSchema.safeParse({ patient_id: '11111111-1111-4111-8111-111111111111', drug_id: '22222222-2222-4222-8222-222222222222', qty: 1, reason: 'fever' })
check(ds.success && ds.data.reason === 'fever', 'the dispense form keeps the reason — Zod would silently strip an unknown key', ds)

console.log(failed === 0 ? '\nSchedules can be set, and only valid ones.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
