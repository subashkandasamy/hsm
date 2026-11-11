/**
 * The intake/output sheet — categories, the sheet's day, and its hourly grid.
 *
 * The day runs 08:00 → 07:59 IST, like KMCH's ICU sheet (their I/O chart
 * says 7 am; one boundary for every sheet until their doctor says otherwise —
 * change SHEET_DAY_START_HOUR to move it everywhere).
 */

export const SHEET_DAY_START_HOUR = 8

export const INTAKE_CATEGORIES = [
  { value: 'iv', label: 'IV fluids' },
  { value: 'infusion', label: 'Drug infusions' },
  { value: 'oral', label: 'Oral' },
  { value: 'ng', label: 'Ryles tube feed' },
  { value: 'blood', label: 'Blood / products' },
  { value: 'other', label: 'Other intake' },
] as const

export const OUTPUT_CATEGORIES = [
  { value: 'urine', label: 'Urine' },
  { value: 'drain', label: 'Drain' },
  { value: 'ng', label: 'Ryles tube aspirate' },
  { value: 'vomit', label: 'Vomitus' },
  { value: 'stool', label: 'Stool' },
  { value: 'blood', label: 'Blood loss' },
  { value: 'other', label: 'Other output' },
] as const

export function categoryLabel(direction: 'intake' | 'output', c: string): string {
  const list: ReadonlyArray<{ value: string; label: string }> = direction === 'intake' ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES
  return list.find((x) => x.value === c)?.label ?? c
}

/** The sheet day (YYYY-MM-DD) an instant falls in, IST. Before 08:00 belongs to the previous day. */
export function sheetDayOf(at: Date | string): string {
  const t = new Date(typeof at === 'string' ? at : at.getTime())
  const ist = new Date(t.getTime() + 5.5 * 3600_000 - SHEET_DAY_START_HOUR * 3600_000)
  return ist.toISOString().slice(0, 10)
}

/** [start, end) of a sheet day as instants. */
export function sheetDayWindow(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T${String(SHEET_DAY_START_HOUR).padStart(2, '0')}:00:00+05:30`)
  return { start, end: new Date(start.getTime() + 24 * 3600_000) }
}

/** Column 0–23 of the sheet day an instant falls in (column 0 = 08:00–08:59). */
export function sheetHour(at: string, day: string): number {
  return Math.floor((new Date(at).getTime() - sheetDayWindow(day).start.getTime()) / 3600_000)
}

/** Clock label for a column: 08, 09 … 23, 00 … 07. */
export function hourLabel(col: number): string {
  return String((SHEET_DAY_START_HOUR + col) % 24).padStart(2, '0')
}

export interface FluidRow { direction: 'intake' | 'output'; category: string; volume_ml: number; recorded_at: string }

/** ml per category per hour for one sheet day, with the 6 / 12 / 24-hour totals. */
export function sheetGrid(rows: FluidRow[], day: string) {
  const grid = new Map<string, number[]>()
  for (const r of rows) {
    const h = sheetHour(r.recorded_at, day)
    if (h < 0 || h > 23) continue
    const key = `${r.direction}:${r.category}`
    const arr = grid.get(key) ?? Array(24).fill(0)
    arr[h] += Number(r.volume_ml) || 0
    grid.set(key, arr)
  }
  const sum = (arr: number[], n: number) => arr.slice(0, n).reduce((s, v) => s + v, 0)
  const totals = (dir: 'intake' | 'output') => {
    const cols = Array(24).fill(0)
    for (const [k, arr] of grid) if (k.startsWith(dir)) arr.forEach((v, i) => { cols[i] += v })
    return { hourly: cols, h6: sum(cols, 6), h12: sum(cols, 12), h24: sum(cols, 24) }
  }
  return { grid, intake: totals('intake'), output: totals('output'), sum }
}
