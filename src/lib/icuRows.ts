/**
 * The hourly rows of KMCH's ICU Critical Care Chart, in the sheet's order —
 * one list for the Day sheet screen and the A3 print, so the two never drift.
 * Each row reads the round (icu_observations) and returns what goes in the
 * hour's cell: short, because an hour column is narrow.
 */
import { cppOf, onOxygen, toFahrenheit } from '@/lib/round'
import { computeNews, type NewsResult } from '@/lib/earlyWarning'
import type { IcuObservation } from '@/lib/types'

export interface IcuRow {
  label: string
  get: (o: IcuObservation) => string | number | null | undefined
  /** Shown even on a day with nothing in it (the core vitals). */
  always?: boolean
}

const pair = (a: unknown, b: unknown) => (a != null || b != null ? `${a ?? '–'}/${b ?? '–'}` : null)

/** GCS in a cell: E4V5M6, with C for eyes closed by swelling and T for a tube. */
export function gcsCell(o: IcuObservation): string | null {
  const e = o.gcs_eye_closed ? 'C' : o.gcs_e, v = o.gcs_tube ? 'T' : o.gcs_v, m = o.gcs_m
  if (e == null && v == null && m == null) return o.gcs_total != null ? String(o.gcs_total) : null
  return `E${e ?? '–'}V${v ?? '–'}M${m ?? '–'}`
}

const POSITION_SHORT: Record<string, string> = { supine: 'Sup', left: 'L lat', right: 'R lat', prone: 'Prone', head_up: 'HU 30°', sitting: 'Sit' }
const SUCTION_SHORT: Record<string, string> = { none: 'Nil', scanty: 'Scanty', moderate: 'Mod', copious: 'Copious' }

export const ICU_ROWS: IcuRow[] = [
  { label: 'Pulse', get: (o) => o.hr, always: true },
  { label: 'BP', get: (o) => (o.sbp != null ? `${o.sbp}/${o.dbp ?? '–'}` : null), always: true },
  { label: 'MAP', get: (o) => o.map },
  { label: 'CVP', get: (o) => o.cvp },
  { label: 'ICP / CPP', get: (o) => (o.icp != null ? `${o.icp}/${cppOf(o.map, o.icp) ?? '–'}` : null) },
  { label: 'SpO₂', get: (o) => o.spo2, always: true },
  { label: 'Resp. rate', get: (o) => o.rr, always: true },
  { label: 'Temp °C', get: (o) => o.temp, always: true },
  { label: 'Temp °F', get: (o) => toFahrenheit(o.temp) },
  { label: 'AVPU', get: (o) => o.avpu },
  { label: 'GCS', get: gcsCell },
  { label: 'Pupils R/L', get: (o) => (o.pupil_r_mm != null || o.pupil_l_mm != null ? `${o.pupil_r_mm ?? '–'}${(o.pupil_r_react ?? '').charAt(0)}/${o.pupil_l_mm ?? '–'}${(o.pupil_l_react ?? '').charAt(0)}` : null) },
  { label: 'Power RU LU/RL LL', get: (o) => ([o.power_rul, o.power_lul, o.power_rll, o.power_lll].some((x) => x != null) ? `${o.power_rul ?? '–'}${o.power_lul ?? '–'}/${o.power_rll ?? '–'}${o.power_lll ?? '–'}` : null) },
  { label: 'RASS', get: (o) => o.rass },
  { label: 'Pain', get: (o) => o.pain_score },
  { label: 'Vent mode', get: (o) => o.vent_mode },
  { label: 'FiO₂ / O₂', get: (o) => (o.fio2 != null ? `${o.fio2}%` : o.o2_lpm != null ? `${o.o2_lpm} L` : null) },
  { label: 'VT / set RR', get: (o) => pair(o.tidal_volume, o.vent_rate) },
  { label: 'PEEP', get: (o) => o.peep },
  { label: 'PS / MVe', get: (o) => pair(o.pressure_support, o.mve) },
  { label: 'PIP / Pplat', get: (o) => pair(o.pip, o.pplat) },
  { label: 'PIFR / I:E', get: (o) => pair(o.pifr, o.ie_ratio) },
  { label: 'Cuff cmH₂O', get: (o) => o.cuff_pressure },
  { label: 'Suction', get: (o) => (o.suction ? SUCTION_SHORT[o.suction] ?? o.suction : null) },
  { label: 'Position', get: (o) => (o.position ? POSITION_SHORT[o.position] ?? o.position : null) },
  { label: 'RT position', get: (o) => (o.rt_checked ? 'Chkd' : null) },
  { label: 'Sugar', get: (o) => o.glucose_mg_dl },
  { label: 'Insulin u', get: (o) => (o.insulin_units != null ? `${o.insulin_units}${o.insulin_route ? ` ${o.insulin_route.toUpperCase()}` : ''}` : null) },
]

const has = (v: unknown) => v != null && v !== ''

/**
 * One row across the 24 hour columns: in each hour, the latest reading that
 * has this measure. Per row, not per round — a sugar check and a vitals round
 * in the same hour both show, instead of the later one hiding the other.
 */
export function hourCells(obs: IcuObservation[], start: number, get: IcuRow['get']): Array<{ value: string | number; o: IcuObservation } | null> {
  const cells: Array<{ value: string | number; o: IcuObservation } | null> = Array(24).fill(null)
  for (const o of obs) {
    const v = get(o); if (!has(v)) continue
    const h = Math.floor((new Date(o.recorded_at).getTime() - start) / 3600_000)
    if (h >= 0 && h < 24 && (!cells[h] || o.recorded_at >= cells[h]!.o.recorded_at)) cells[h] = { value: v as string | number, o }
  }
  return cells
}

/** The rows to show for a day: the core vitals always, the rest only when something was charted. */
export function rowsFor(obs: IcuObservation[]): IcuRow[] {
  return ICU_ROWS.filter((r) => r.always || obs.some((o) => has(r.get(o))))
}

/** NEWS2 in each hour: from the latest reading in that hour that has vitals to score (a sugar-only check has none). */
export function newsByHour(obs: IcuObservation[], start: number, ventilated: boolean): Array<NewsResult | null> {
  const out: Array<{ n: NewsResult; at: string } | null> = Array(24).fill(null)
  for (const o of obs) {
    const n = computeNews({ rr: o.rr, spo2: o.spo2, sbp: o.sbp, hr: o.hr, temp: o.temp, gcs_total: o.gcs_total, avpu: o.avpu, on_oxygen: onOxygen(o, ventilated) })
    if (!n.params) continue
    const h = Math.floor((new Date(o.recorded_at).getTime() - start) / 3600_000)
    if (h >= 0 && h < 24 && (!out[h] || o.recorded_at >= out[h]!.at)) out[h] = { n, at: o.recorded_at }
  }
  return out.map((x) => x?.n ?? null)
}
