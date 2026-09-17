// Antenatal care schedule — the tests, scans, vaccines and supplements a pregnancy
// needs, by gestational age. Sources (India):
//  - MoHFW, Guidelines for Antenatal Care and Skilled Attendance at Birth (2010):
//    booking tests, Td 2 doses 4 weeks apart, folic acid in the first trimester.
//  - MoHFW Anemia Mukt Bharat (2018): IFA daily for 180 days from the 2nd trimester.
//  - MoHFW National Guidelines for Calcium Supplementation in Pregnancy (2014): from 14 weeks.
//  - MoHFW National Guidelines for Deworming in Pregnancy (2014): albendazole 400 mg once, 2nd trimester.
//  - MoHFW Diagnosis & Management of GDM (2018): 75 g OGTT at first contact and at 24–28 weeks.
//  - MoHFW Screening for Hypothyroidism in Pregnancy (2014): universal TSH at first visit.
//  - FOGSI / ISUOG: dating + NT scan 11w0d–13w6d; anomaly scan 18w0d–22w6d.
//  - Rh-negative, unsensitised: indirect Coombs test and anti-D prophylaxis at 28 weeks.

import { daysBetween } from './dating'
import { istAddDays } from '@/lib/istDate'

const W = 7

export type CareGroup = 'test' | 'scan' | 'vaccine' | 'supplement' | 'plan'

export interface CareItemDef {
  key: string
  label: string
  detail: string
  group: CareGroup
  /** Window by gestational age in days. */
  startDays: number
  endDays: number | null
  /** After the window: still worth doing ('overdue') or no longer possible ('missed'). */
  late: 'overdue' | 'missed'
  onlyIf?: 'rh_negative'
  /** Due a number of days after another item was done (Td2 after Td1). */
  after?: { key: string; days: number }
}

export const ANC_CARE_ITEMS: CareItemDef[] = [
  { key: 'booking_labs', group: 'test', label: 'Booking blood & urine tests', detail: 'Hb, blood group & Rh, HIV, syphilis (VDRL/RPR), HBsAg, urine routine', startDays: 0, endDays: 12 * W + 6, late: 'overdue' },
  { key: 'tsh', group: 'test', label: 'Thyroid (TSH)', detail: 'At the first visit', startDays: 0, endDays: 12 * W + 6, late: 'overdue' },
  { key: 'ogtt_1', group: 'test', label: 'OGTT 75 g — first', detail: 'At the first visit (2-h value ≥ 140 mg/dL = GDM)', startDays: 0, endDays: 23 * W + 6, late: 'overdue' },
  { key: 'folic_acid', group: 'supplement', label: 'Folic acid 400 mcg', detail: 'Daily in the first trimester', startDays: 0, endDays: 13 * W + 6, late: 'missed' },
  { key: 'td1', group: 'vaccine', label: 'Td — dose 1', detail: 'At the first visit', startDays: 0, endDays: null, late: 'overdue' },
  { key: 'td2', group: 'vaccine', label: 'Td — dose 2 (or booster)', detail: '4 weeks after dose 1; one booster only if 2 doses were given in a pregnancy within the last 3 years', startDays: 0, endDays: null, late: 'overdue', after: { key: 'td1', days: 28 } },
  { key: 'nt_scan', group: 'scan', label: 'Dating & NT scan', detail: '11w0d – 13w6d', startDays: 11 * W, endDays: 13 * W + 6, late: 'missed' },
  { key: 'ifa', group: 'supplement', label: 'IFA started', detail: '1 tablet daily for 180 days from the 2nd trimester', startDays: 14 * W, endDays: null, late: 'overdue' },
  { key: 'calcium', group: 'supplement', label: 'Calcium started', detail: '500 mg twice daily from 14 weeks', startDays: 14 * W, endDays: null, late: 'overdue' },
  { key: 'albendazole', group: 'supplement', label: 'Albendazole 400 mg', detail: 'Single dose in the 2nd trimester', startDays: 14 * W, endDays: 27 * W + 6, late: 'missed' },
  { key: 'anomaly_scan', group: 'scan', label: 'Anomaly scan', detail: '18w0d – 22w6d', startDays: 18 * W, endDays: 22 * W + 6, late: 'overdue' },
  { key: 'ogtt_2', group: 'test', label: 'OGTT 75 g — repeat', detail: '24–28 weeks, if the first was normal', startDays: 24 * W, endDays: 28 * W + 6, late: 'overdue' },
  { key: 'anti_d', group: 'vaccine', label: 'Indirect Coombs test & anti-D', detail: 'Rh-negative mother, not sensitised — at 28 weeks', startDays: 28 * W, endDays: 30 * W + 6, late: 'overdue', onlyIf: 'rh_negative' },
  { key: 'third_trimester_labs', group: 'test', label: 'Repeat Hb & urine', detail: '28–34 weeks', startDays: 28 * W, endDays: 34 * W + 6, late: 'overdue' },
  { key: 'birth_plan', group: 'plan', label: 'Birth plan', detail: 'Place of delivery, transport, blood donor, danger signs explained', startDays: 32 * W, endDays: 36 * W + 6, late: 'overdue' },
]

export type CareStatus = 'done' | 'due' | 'overdue' | 'missed' | 'upcoming'

export interface CareDone { item_key: string; done_on: string; result: string | null }

export interface CareItemStatus extends CareItemDef {
  status: CareStatus
  done: CareDone | null
  /** Calendar date the item becomes due (for upcoming / after-items). */
  dueDate: string | null
}

export const isRhNegative = (bloodGroup: string | null | undefined) => !!bloodGroup && /(-|neg)/i.test(bloodGroup)

export function careSchedule(opts: { gaDays: number | null; today: string; edd: string | null; bloodGroup: string | null; done: CareDone[] }): CareItemStatus[] {
  const { gaDays, today, edd, bloodGroup } = opts
  const doneBy = new Map(opts.done.map((d) => [d.item_key, d]))
  const conceptionBase = edd ? istAddDays(edd, -280) : null // "day 0" of the pregnancy
  const out: CareItemStatus[] = []
  for (const def of ANC_CARE_ITEMS) {
    if (def.onlyIf === 'rh_negative' && !isRhNegative(bloodGroup)) continue
    const done = doneBy.get(def.key) ?? null
    let status: CareStatus
    let dueDate: string | null = conceptionBase ? istAddDays(conceptionBase, def.startDays) : null
    if (done) status = 'done'
    else if (def.after) {
      const prior = doneBy.get(def.after.key)
      dueDate = prior ? istAddDays(prior.done_on, def.after.days) : null
      status = prior && daysBetween(dueDate!, today) >= 0 ? 'due' : 'upcoming'
    } else if (gaDays == null) status = def.startDays === 0 ? 'due' : 'upcoming'
    else if (gaDays < def.startDays) status = 'upcoming'
    else if (def.endDays != null && gaDays > def.endDays) status = def.late
    else status = 'due'
    out.push({ ...def, status, done, dueDate })
  }
  return out
}
