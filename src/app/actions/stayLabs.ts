'use server'

import { createClient } from '@/lib/supabase/server'
import { requireModule } from '@/lib/server-utils'
import { istDate, istToday } from '@/lib/istDate'

/**
 * KMCH's Investigation Master Chart: every result of the stay with the dates
 * as columns, so a trend reads across a row. Built from what the lab already
 * holds — nothing is re-entered.
 *
 * A panel's values live in lab_result_analytes, a single test's on
 * lab_order_items; both are read, or panels show blank (see the lab audit).
 * Only released results (verified / reported) are shown.
 */

export interface StayLabCell { value: string; flag: string | null; count: number; at: string }
export interface StayLabRow { key: string; label: string; unit: string | null; group: string; cells: Record<string, StayLabCell> }
export interface AbgRow {
  orderId: string; at: string
  values: Record<string, { value: string; flag: string | null }>
  fio2: number | null; pf: number | null
  /** The ventilator at the time of the sample (KMCH's ABG table: mode, VT, RR, PSV/PEEP), from the nearest round. */
  vent: { mode: string | null; vt: number | null; rr: number | null; peep: number | null; ps: number | null } | null
}
export interface StayLabs {
  days: string[]
  rows: StayLabRow[]
  abg: AbgRow[]
  cultures: Array<{ orderId: string; test: string; sample: string | null; status: string; orderedAt: string; result: string | null }>
  upcoming: Array<{ orderId: string; tests: string; on: string }>
}

const ABG_MARKERS = new Set(['BG_PH', 'PCO2', 'PO2'])
/** Microbiology read as a report, not a number: cultures and Gram stains. */
const MICRO = /culture|gram\s*stain/i
const RELEASED = ['verified', 'reported']

type OrderRow = {
  id: string; status: string; ordered_at: string; verified_at: string | null; reported_at: string | null; scheduled_for: string | null
  items: Array<{ id: string; test_id: string; result_value: string | number | null; result_text: string | null; unit: string | null; flag: string | null
    test: { name: string; category: string | null; sample_type: string | null } | null }>
}
type AnalyteRow = {
  lab_order_id: string; test_id: string; value_num: number | null; value_text: string | null; unit_ucum: string | null; flag: string | null
  analyte: { code: string; name: string; short_name: string | null } | null
}

export async function getStayLabs(admissionId: string): Promise<StayLabs> {
  await requireModule('ipd')
  const supabase = await createClient()
  const { data: orders } = await supabase.from('lab_orders')
    .select('id, status, ordered_at, verified_at, reported_at, scheduled_for, items:lab_order_items(id, test_id, result_value, result_text, unit, flag, test:lab_tests_catalog(name, category, sample_type))')
    .eq('admission_id', admissionId).neq('status', 'cancelled').order('ordered_at', { ascending: true })
  const all = (orders ?? []) as unknown as OrderRow[]
  const released = all.filter((o) => RELEASED.includes(o.status))
  const ids = released.map((o) => o.id)
  const { data: an } = ids.length
    ? await supabase.from('lab_result_analytes')
        .select('lab_order_id, test_id, value_num, value_text, unit_ucum, flag, analyte:lab_analytes(code, name, short_name)')
        .in('lab_order_id', ids)
    : { data: [] }
  const analytes = (an ?? []) as unknown as AnalyteRow[]

  const whenOf = (o: OrderRow) => o.verified_at ?? o.reported_at ?? o.ordered_at
  const byOrder = new Map(released.map((o) => [o.id, o]))
  const days = new Set<string>()
  const rows = new Map<string, StayLabRow>()
  const put = (key: string, label: string, unit: string | null, group: string, at: string, value: string, flag: string | null) => {
    const r = rows.get(key) ?? { key, label, unit, group, cells: {} }
    const day = istDate(at)
    const prev = r.cells[day]
    // The latest result of the day is shown — by result time, not by the order
    // rows happen to arrive in; the count says when there were more.
    const count = (prev?.count ?? 0) + 1
    r.cells[day] = !prev || at >= prev.at ? { value, flag, count, at } : { ...prev, count }
    rows.set(key, r); days.add(day)
  }
  const fmt = (n: number | null, t: string | null) => (n != null ? String(n) : t ?? '')

  // Panels: one row per analyte
  const panelItems = new Set<string>()
  for (const a of analytes) {
    const o = byOrder.get(a.lab_order_id); if (!o || !a.analyte) continue
    const v = fmt(a.value_num, a.value_text); if (!v) continue
    panelItems.add(`${a.lab_order_id}:${a.test_id}`)
    const item = o.items.find((i) => i.test_id === a.test_id)
    put(`a:${a.analyte.code}`, a.analyte.short_name || a.analyte.name, a.unit_ucum, item?.test?.category ?? 'Panels', whenOf(o), v, a.flag)
  }
  // Single tests: one row per test (skipping items whose values came as analytes)
  for (const o of released) {
    for (const i of o.items) {
      if (panelItems.has(`${o.id}:${i.test_id}`)) continue
      // result_value is numeric in the database — never assume a string.
      const raw = i.result_value ?? i.result_text
      const v = raw == null ? '' : String(raw).trim(); if (!v) continue
      if (MICRO.test(i.test?.name ?? '')) continue   // cultures and Gram stains have their own list
      put(`t:${i.test_id}`, i.test?.name ?? 'Test', i.unit, i.test?.category ?? 'Tests', whenOf(o), v, i.flag)
    }
  }

  // Blood gas: one row per order that measured pH / pCO2 / pO2, with P/F from the nearest round's FiO2
  const abgOrders = new Map<string, AbgRow>()
  for (const a of analytes) {
    if (!a.analyte) continue
    const o = byOrder.get(a.lab_order_id); if (!o) continue
    const row = abgOrders.get(o.id) ?? { orderId: o.id, at: whenOf(o), values: {}, fio2: null, pf: null, vent: null }
    row.values[a.analyte.code] = { value: fmt(a.value_num, a.value_text), flag: a.flag }
    abgOrders.set(o.id, row)
  }
  const abg = [...abgOrders.values()].filter((r) => Object.keys(r.values).some((c) => ABG_MARKERS.has(c)))
  if (abg.length) {
    const { data: obs } = await supabase.from('icu_observations').select('recorded_at, fio2, o2_device, vent_mode, tidal_volume, vent_rate, peep, pressure_support')
      .eq('admission_id', admissionId).order('recorded_at', { ascending: true })
    for (const r of abg) {
      const t = new Date(r.at).getTime()
      let best: { d: number; fio2: number | null } | null = null
      let vent: { d: number; v: NonNullable<AbgRow['vent']> } | null = null
      for (const o of obs ?? []) {
        const d = Math.abs(new Date(o.recorded_at as string).getTime() - t)
        if (d > 2 * 3600_000) continue
        const f = o.fio2 != null ? Number(o.fio2) : o.o2_device === 'air' ? 21 : null
        if (f != null && (!best || d < best.d)) best = { d, fio2: f }
        if ((o.vent_mode || o.tidal_volume != null || o.peep != null) && (!vent || d < vent.d)) {
          vent = { d, v: { mode: (o.vent_mode as string | null) ?? null, vt: o.tidal_volume as number | null, rr: o.vent_rate as number | null, peep: o.peep as number | null, ps: o.pressure_support as number | null } }
        }
      }
      r.fio2 = best?.fio2 ?? null
      r.vent = vent?.v ?? null
      const po2 = Number(r.values.PO2?.value)
      r.pf = r.fio2 && Number.isFinite(po2) ? Math.round(po2 / (r.fio2 / 100)) : null
    }
  }

  // Cultures and Gram stains (KMCH's "Gramstain — CSF / ET / urine" box): any such order of the stay, released or not
  const cultures: StayLabs['cultures'] = []
  for (const o of all) for (const i of o.items) {
    if (!MICRO.test(i.test?.name ?? '')) continue
    const rawResult = RELEASED.includes(o.status) ? (i.result_text ?? i.result_value ?? null) : null
    const result = rawResult == null ? null : String(rawResult)
    cultures.push({ orderId: o.id, test: i.test?.name ?? 'Culture', sample: i.test?.sample_type ?? null, status: o.status, orderedAt: o.ordered_at, result })
  }

  // Tomorrow's (and later) labs: ordered, not yet collected, scheduled after today
  const today = istToday()
  const upcoming = all.filter((o) => o.status === 'ordered' && o.scheduled_for && o.scheduled_for > today)
    .map((o) => ({ orderId: o.id, tests: o.items.map((i) => i.test?.name).filter(Boolean).join(', '), on: o.scheduled_for as string }))

  return {
    days: [...days].sort(),
    rows: [...rows.values()].sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
    abg: abg.sort((a, b) => a.at.localeCompare(b.at)),
    cultures, upcoming,
  }
}
