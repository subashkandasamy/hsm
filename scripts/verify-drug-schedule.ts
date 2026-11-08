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

import { DrugSchema } from '../src/lib/schemas'
import { isDrugSchedule, DRUG_SCHEDULES, SCHEDULE_HINT } from '../src/lib/pharmacy/schedule'

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

console.log(failed === 0 ? '\nSchedules can be set, and only valid ones.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
