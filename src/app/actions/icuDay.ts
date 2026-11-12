'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { sheetDayWindow } from '@/lib/fluids'
import { BUNDLES, LINE_KINDS } from '@/lib/icuBundles'
import { getStayLabs, type StayLabs } from '@/app/actions/stayLabs'
import type { IcuFluidEntry, IcuObservation } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export interface IpdLine {
  id: string; kind: string; site: string | null; size: string | null
  inserted_at: string; removed_at: string | null; removal_reason: string | null; notes: string | null
  /** ET tube / tracheostomy (0288) */
  lip_level_cm?: number | null; humidifier?: string | null
  inserter?: { full_name: string } | null
}
export interface BundleCheck {
  id: string; sheet_day: string; shift: string; bundle: string; items: Record<string, boolean>
  checked_at: string; checker?: { full_name: string } | null
}
export interface DoseOfDay {
  id: string; due_at: string; status: string; given_at: string | null; label: string
  nurse: string | null; checker: string | null; bag_no: string | null; finished_at: string | null
}
export interface IcuDay {
  day: string
  /** The moment the sheet is read as of: now, or the end of a past day — line days count to here. */
  asOf: string
  obs: IcuObservation[]
  fluids: IcuFluidEntry[]
  doses: DoseOfDay[]
  lines: IpdLine[]
  bundles: BundleCheck[]
  labs: StayLabs
  notes: Array<{ id: string; kind: string | null; shift: string | null; note: string; created_at: string; author: string | null }>
}

/**
 * Everything on KMCH's ICU sheet for one day (08:00 → 07:59 IST), in one
 * call — read from where it already lives: the rounds, the fluids, the drug
 * chart, the lab, the notes. Lines and bundles are the sheet's own.
 */
export async function getIcuDay(admissionId: string, day: string): Promise<IcuDay | null> {
  await requireModule('ipd')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const supabase = await createClient()
  const { start, end } = sheetDayWindow(day)
  const s = start.toISOString(), e = end.toISOString()
  const [obs, fluids, doses, lines, bundles, labs, notes] = await Promise.all([
    supabase.from('icu_observations').select('*, recorder:profiles!recorded_by(id, full_name)')
      .eq('admission_id', admissionId).gte('recorded_at', s).lt('recorded_at', e).order('recorded_at'),
    supabase.from('icu_fluid_balance').select('*')
      .eq('admission_id', admissionId).gte('recorded_at', s).lt('recorded_at', e).order('recorded_at'),
    supabase.from('ipd_admin_schedule')
      .select('id, due_at, status, given_at, bag_no, finished_at, order:ipd_medication_orders(type, drug_name, dose, dose_unit, route, fluid_name, volume_ml, rate_ml_per_hr, flow_rate_lpm), nurse:profiles!given_by(full_name), checker:profiles!checked_by(full_name)')
      .eq('admission_id', admissionId).gte('due_at', s).lt('due_at', e).order('due_at'),
    supabase.from('ipd_lines').select('*, inserter:profiles!inserted_by(full_name)')
      .eq('admission_id', admissionId).lt('inserted_at', e).order('inserted_at'),
    supabase.from('icu_bundle_checks').select('*, checker:profiles!checked_by(full_name)')
      .eq('admission_id', admissionId).eq('sheet_day', day),
    getStayLabs(admissionId),
    supabase.from('ipd_progress_notes').select('id, kind, shift, note, created_at, author:profiles(full_name)')
      .eq('admission_id', admissionId).gte('created_at', s).lt('created_at', e).order('created_at'),
  ])
  type Ord = { type: string; drug_name: string | null; dose: number | null; dose_unit: string | null; route: string | null; fluid_name: string | null; volume_ml: number | null; rate_ml_per_hr: number | null; flow_rate_lpm: number | null }
  const label = (o: Ord | null) => !o ? 'Order'
    : o.type === 'iv_infusion' ? `${o.fluid_name ?? 'IV fluid'} ${o.volume_ml ?? ''} ml @ ${o.rate_ml_per_hr ?? '?'} ml/h`
    : o.type === 'oxygen' ? `Oxygen ${o.flow_rate_lpm ?? ''} L/min`
    : [o.drug_name, o.dose != null ? `${o.dose} ${o.dose_unit ?? ''}` : null, o.route].filter(Boolean).join(' ')
  return {
    day,
    asOf: new Date(Math.min(Date.now(), end.getTime() - 60_000)).toISOString(),
    obs: (obs.data ?? []) as unknown as IcuObservation[],
    fluids: (fluids.data ?? []) as unknown as IcuFluidEntry[],
    doses: (doses.data ?? []).map((d) => ({
      id: d.id as string, due_at: d.due_at as string, status: d.status as string, given_at: (d.given_at as string | null) ?? null,
      label: label(d.order as unknown as Ord | null),
      nurse: (d.nurse as unknown as { full_name: string } | null)?.full_name ?? null,
      checker: (d.checker as unknown as { full_name: string } | null)?.full_name ?? null,
      bag_no: (d.bag_no as string | null) ?? null, finished_at: (d.finished_at as string | null) ?? null,
    })),
    // Lines in place at any time during the day (removed ones before the day are history, not shown)
    lines: ((lines.data ?? []) as unknown as IpdLine[]).filter((l) => !l.removed_at || l.removed_at >= s),
    bundles: (bundles.data ?? []) as unknown as BundleCheck[],
    labs,
    notes: (notes.data ?? []).map((n) => ({
      id: n.id as string, kind: (n.kind as string | null) ?? null, shift: (n.shift as string | null) ?? null, note: n.note as string,
      created_at: n.created_at as string, author: (n.author as unknown as { full_name: string } | null)?.full_name ?? null,
    })),
  }
}

const when = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'Not a valid time').nullable().optional()
const LineSchema = z.object({
  kind: z.enum(LINE_KINDS.map((k) => k.value) as [string, ...string[]]),
  site: z.string().trim().max(80).nullable().optional(),
  size: z.string().trim().max(40).nullable().optional(),
  inserted_at: when,
  notes: z.string().trim().max(300).nullable().optional(),
  lip_level_cm: z.number().min(5, 'Lip level looks wrong').max(40, 'Lip level looks wrong').nullable().optional(),
  humidifier: z.enum(['hme', 'heated']).nullable().optional(),
})

async function openAdmission(supabase: Awaited<ReturnType<typeof createClient>>, admissionId: string) {
  const { data } = await supabase.from('admissions').select('status, admitted_at').eq('id', admissionId).maybeSingle()
  return data
}

/** A line or tube put in. Insertion time may be earlier (charted late), never in the future. */
export async function addLine(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = LineSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const adm = await openAdmission(supabase, admissionId)
  if (adm?.status !== 'admitted') return { success: false, error: 'This patient has been discharged.' }
  const at = parsed.data.inserted_at ? new Date(parsed.data.inserted_at) : new Date()
  if (at.getTime() > Date.now() + 2 * 60_000) return { success: false, error: 'The insertion time is in the future' }
  // Lip level and humidifier belong to an airway tube only.
  const airway = parsed.data.kind === 'et_tube' || parsed.data.kind === 'tracheostomy'
  const { data, error } = await supabase.from('ipd_lines').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, kind: parsed.data.kind,
    site: parsed.data.site || null, size: parsed.data.size || null, notes: parsed.data.notes || null,
    lip_level_cm: airway && parsed.data.kind === 'et_tube' ? parsed.data.lip_level_cm ?? null : null,
    humidifier: airway ? parsed.data.humidifier ?? null : null,
    inserted_at: at.toISOString(), inserted_by: actor.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'line_inserted', 'ipd_line', data.id as string, { admission_id: admissionId, kind: parsed.data.kind, site: parsed.data.site })
  return { success: true }
}

/** A line or tube taken out — when, and why. */
export async function removeLine(lineId: string, input: { removed_at?: string | null; reason?: string | null }): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const supabase = await createClient()
  const { data: line } = await supabase.from('ipd_lines').select('id, inserted_at, removed_at').eq('id', lineId).maybeSingle()
  if (!line) return { success: false, error: 'Line not found' }
  if (line.removed_at) return { success: false, error: 'Already removed' }
  const at = input.removed_at ? new Date(input.removed_at) : new Date()
  if (Number.isNaN(at.getTime())) return { success: false, error: 'Not a valid time' }
  if (at.getTime() > Date.now() + 2 * 60_000) return { success: false, error: 'The removal time is in the future' }
  if (at.getTime() < new Date(line.inserted_at as string).getTime()) return { success: false, error: 'Removed before it was put in?' }
  const { error } = await supabase.from('ipd_lines').update({
    removed_at: at.toISOString(), removed_by: actor.id, removal_reason: input.reason?.trim().slice(0, 200) || null,
  }).eq('id', lineId).is('removed_at', null)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'line_removed', 'ipd_line', lineId, { reason: input.reason })
  return { success: true }
}

const BundleSchema = z.object({
  sheet_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(['morning', 'evening', 'night']),
  bundle: z.enum(['fast_hug', 'vap', 'crbsi', 'cauti']),
  items: z.record(z.string().max(30), z.boolean()),
})

/** One bundle for one shift. Saving again replaces that shift's ticks and re-stamps who and when. */
export async function saveBundle(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = BundleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const def = BUNDLES.find((b) => b.key === parsed.data.bundle)!
  const known = new Set(def.items.map((i) => i.key))
  const items = Object.fromEntries(Object.entries(parsed.data.items).filter(([k]) => known.has(k)))
  const supabase = await createClient()
  const adm = await openAdmission(supabase, admissionId)
  if (adm?.status !== 'admitted') return { success: false, error: 'This patient has been discharged.' }
  const { error } = await supabase.from('icu_bundle_checks').upsert({
    tenant_id: actor.tenant_id, admission_id: admissionId, sheet_day: parsed.data.sheet_day, shift: parsed.data.shift,
    bundle: parsed.data.bundle, items, checked_by: actor.id, checked_at: new Date().toISOString(),
  }, { onConflict: 'admission_id,sheet_day,shift,bundle' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, `bundle_${parsed.data.bundle}`, 'admission', admissionId, { day: parsed.data.sheet_day, shift: parsed.data.shift, done: Object.values(items).filter(Boolean).length })
  return { success: true }
}
