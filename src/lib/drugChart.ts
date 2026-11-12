/**
 * KMCH's Drug & Fluid Chart, built from the orders and their doses — one
 * shape for the Treatment tab's grid and the printed chart:
 *   - Regular prescriptions: each drug, with the date × time grid of doses
 *   - STAT (PRN / SOS) — one only and premedication: each dose as given
 *   - Intravenous infusion therapy: each bag (volume, drugs added, rate,
 *     start / finish, given by, checked by, bag no.)
 *   - Drug infusion: drugs run continuously (concentration, rate)
 * Nothing here is stored: it is a view of ipd_medication_orders and
 * ipd_admin_schedule.
 */
import type { FrequencyType, IpdAdminSchedule, IpdMedicationOrder } from '@/lib/types'

const TZ = 'Asia/Kolkata'
/** The IST calendar date of an instant, YYYY-MM-DD. */
export const istDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
export const istTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
export const dayMonth = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })

export const FREQ_SHORT: Record<FrequencyType, string> = {
  stat: 'STAT', daily: 'OD', twice_daily: 'BD', thrice_daily: 'TDS', every_x_hours: 'Q_H', sos: 'SOS', continuous: 'Continuous',
}
export const freqText = (o: Pick<IpdMedicationOrder, 'frequency_type' | 'frequency_hours'>) =>
  o.frequency_type === 'every_x_hours' && o.frequency_hours ? `Q${o.frequency_hours}H` : FREQ_SHORT[o.frequency_type] ?? o.frequency_type

/** Given / missed / held / due, as one letter — the print has no tick glyphs. */
export const MARK: Record<string, string> = { given: 'G', missed: 'X', held: 'H', pending: '•' }

const doseOf = (o: IpdMedicationOrder) => (o.dose != null ? `${o.dose} ${o.dose_unit ?? ''}`.trim() : null)
const isDrugInfusion = (o: IpdMedicationOrder) => o.type === 'medication' && o.frequency_type === 'continuous'

export interface DrugChart {
  days: string[]
  regular: Array<{
    orderId: string; drug: string; dose: string | null; route: string | null; start: string; duration: number
    frequency: string; instructions: string | null; doctor: string | null; stopped: boolean
    cells: Record<string, Array<{ time: string; mark: string; status: string; title: string }>>
  }>
  sos: Array<{ at: string; drug: string; dose: string | null; route: string | null; kind: 'STAT' | 'SOS'; doctor: string | null; givenBy: string | null; checkedBy: string | null; status: string; note: string | null }>
  iv: Array<{ at: string; fluid: string; volume: number | null; added: string | null; rate: number | null; doctor: string | null; start: string | null; finish: string | null; givenBy: string | null; checkedBy: string | null; bagNo: string | null; status: string }>
  infusions: Array<{ at: string; drug: string; concentration: string | null; route: string | null; rate: number | null; doctor: string | null; nurse: string | null; stopped: boolean }>
}

/**
 * @param upTo the last date to show (IST YYYY-MM-DD) — usually today; doses
 *   planned after it are left off, so the chart is what has happened.
 */
export function buildDrugChart(orders: IpdMedicationOrder[], slots: IpdAdminSchedule[], upTo: string): DrugChart {
  const byOrder = new Map<string, IpdAdminSchedule[]>()
  for (const s of slots) { const a = byOrder.get(s.order_id) ?? []; a.push(s); byOrder.set(s.order_id, a) }
  const sorted = [...orders].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const daySet = new Set<string>()

  const regular: DrugChart['regular'] = []
  const sos: DrugChart['sos'] = []
  const iv: DrugChart['iv'] = []
  const infusions: DrugChart['infusions'] = []

  for (const o of sorted) {
    const mine = (byOrder.get(o.id) ?? []).sort((a, b) => a.due_at.localeCompare(b.due_at))
    const doctor = o.doctor?.full_name ?? null
    if (o.type === 'medication' && (o.frequency_type === 'stat' || o.frequency_type === 'sos')) {
      for (const s of mine) {
        if (s.status === 'pending') continue
        sos.push({
          at: s.given_at ?? s.due_at, drug: o.drug_name ?? 'Medication', dose: s.status === 'given' && s.given_notes ? s.given_notes : doseOf(o), route: o.route,
          kind: o.frequency_type === 'stat' ? 'STAT' : 'SOS', doctor, givenBy: s.nurse?.full_name ?? null, checkedBy: s.checker?.full_name ?? null,
          status: s.status, note: s.status !== 'given' ? s.given_notes : null,
        })
      }
    } else if (o.type === 'iv_infusion') {
      for (const s of mine) {
        if (s.status === 'pending') continue
        iv.push({
          at: s.given_at ?? s.due_at, fluid: o.fluid_name ?? 'IV fluid', volume: o.volume_ml, added: o.additives ?? null, rate: o.rate_ml_per_hr, doctor,
          start: s.status === 'given' ? s.given_at : null, finish: s.finished_at ?? null, givenBy: s.nurse?.full_name ?? null,
          checkedBy: s.checker?.full_name ?? null, bagNo: s.bag_no ?? null, status: s.status,
        })
      }
    } else if (isDrugInfusion(o)) {
      const started = mine.find((s) => s.status === 'given')
      infusions.push({
        at: started?.given_at ?? o.start_at, drug: [o.drug_name, doseOf(o)].filter(Boolean).join(' '), concentration: o.dilution ?? null, route: o.route,
        rate: o.rate_ml_per_hr, doctor, nurse: started?.nurse?.full_name ?? null, stopped: o.status === 'stopped',
      })
    } else if (o.type === 'medication') {
      const cells: DrugChart['regular'][number]['cells'] = {}
      for (const s of mine) {
        const at = s.given_at ?? s.due_at, d = istDate(at)
        if (d > upTo) continue
        daySet.add(d)
        ;(cells[d] ??= []).push({
          time: istTime(at), mark: MARK[s.status] ?? '•', status: s.status,
          title: `${s.status}${s.nurse?.full_name ? ` by ${s.nurse.full_name}` : ''}${s.checker?.full_name ? `, checked ${s.checker.full_name}` : ''}${s.given_notes ? ` — ${s.given_notes}` : ''}`,
        })
      }
      daySet.add(istDate(o.start_at) > upTo ? upTo : istDate(o.start_at))
      regular.push({
        orderId: o.id, drug: o.drug_name ?? 'Medication', dose: doseOf(o), route: o.route, start: o.start_at, duration: o.duration_days,
        frequency: freqText(o), instructions: [o.dilution, o.notes].filter(Boolean).join('; ') || null, doctor, stopped: o.status === 'stopped', cells,
      })
    }
  }
  const byTime = <T extends { at: string }>(a: T, b: T) => a.at.localeCompare(b.at)
  return { days: [...daySet].sort(), regular, sos: sos.sort(byTime), iv: iv.sort(byTime), infusions: infusions.sort(byTime) }
}
