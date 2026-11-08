'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { istDayStartISO, istDayEndISO, istToday } from '@/lib/istDate'
import { pageAll } from '@/lib/supabase/pageAll'
import { activityLink, areaOf, describeActivity, isSensitiveView, type ActivityArea, type ActivityRefs } from '@/lib/activity'

export interface ActivityRow {
  id: string
  at: string
  actorId: string | null
  actorName: string
  area: ActivityArea
  text: string
  href: string | null
  /** Someone looked at a legal register (MLC, Form F, MTP). */
  sensitive: boolean
}

export interface ActivityReport {
  rows: ActivityRow[]
  /** True when the range held more than MAX_ROWS entries and only the latest are shown. */
  truncated: boolean
  /** Per person: how many actions, newest first by count. */
  byPerson: Array<{ actorId: string | null; name: string; count: number }>
}

const MAX_ROWS = 3000
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

/**
 * The activity log between two IST dates (inclusive), in plain words, for the
 * admin. Names are looked up in one query per kind, not per row.
 */
export async function getActivity(params: {
  from?: string; to?: string; actorId?: string | null; area?: ActivityArea | 'sensitive' | null
} = {}): Promise<ActivityReport> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'audit:read')
  const supabase = await createClient()

  const from = params.from || istToday()
  const to = params.to || from
  type Raw = { id: string; actor_id: string | null; action: string; entity: string; entity_id: string | null; meta: Record<string, unknown> | null; created_at: string }

  // Paged, newest first, and stopped at MAX_ROWS: a month at a busy hospital
  // runs to tens of thousands of entries, and this is a screen, not an export
  // of the whole table.
  let raw: Raw[] = []
  let truncated = false
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('audit_logs')
      .select('id, actor_id, action, entity, entity_id, meta, created_at')
      .eq('tenant_id', actor.tenant_id)
      .gte('created_at', istDayStartISO(from)).lte('created_at', istDayEndISO(to))
    if (params.actorId) q = q.eq('actor_id', params.actorId)
    const { data, error } = await q.order('created_at', { ascending: false }).order('id').range(f, f + 999)
    if (error) throw new Error(`Could not read the activity log: ${error.message}`)
    raw.push(...((data ?? []) as Raw[]))
    if ((data ?? []).length < 1000) break
    if (raw.length >= MAX_ROWS) { truncated = true; break }
  }
  if (raw.length > MAX_ROWS) { raw = raw.slice(0, MAX_ROWS); truncated = true }

  if (params.area === 'sensitive') raw = raw.filter((r) => isSensitiveView(r.entity, r.action))
  else if (params.area) raw = raw.filter((r) => areaOf(r.entity) === params.area)

  // ── Names ────────────────────────────────────────────────────────────────
  const patientIds = new Set<string>(), billIds = new Set<string>(), admissionIds = new Set<string>(), staffIds = new Set<string>()
  for (const r of raw) {
    if (r.actor_id) staffIds.add(r.actor_id)
    if (r.entity === 'patient' && isUuid(r.entity_id)) patientIds.add(r.entity_id)
    if (r.entity === 'bill' && isUuid(r.entity_id)) billIds.add(r.entity_id)
    if (r.entity === 'admission' && isUuid(r.entity_id)) admissionIds.add(r.entity_id)
    if (r.entity === 'staff' && isUuid(r.entity_id)) staffIds.add(r.entity_id)
    if (isUuid(r.meta?.patient_id)) patientIds.add(r.meta!.patient_id as string)
  }
  const chunks = <T,>(ids: Set<string>, fn: (chunk: string[]) => Promise<T[]>) =>
    Promise.all(Array.from({ length: Math.ceil(ids.size / 150) }, (_, i) => fn([...ids].slice(i * 150, i * 150 + 150)))).then((r) => r.flat())

  const [admissions, bills, staff] = await Promise.all([
    chunks(admissionIds, async (c) => (await supabase.from('admissions').select('id, patient_id').in('id', c)).data ?? []),
    chunks(billIds, async (c) => (await supabase.from('bills').select('id, bill_no, patient_id').in('id', c)).data ?? []),
    chunks(staffIds, async (c) => (await supabase.from('profiles').select('id, full_name').in('id', c)).data ?? []),
  ])
  for (const a of admissions) if (a.patient_id) patientIds.add(a.patient_id as string)
  for (const b of bills) if (b.patient_id) patientIds.add(b.patient_id as string)
  const patients = await chunks(patientIds, async (c) =>
    (await pageAll<{ id: string; full_name: string; uhid: string | null }>((f, t) =>
      supabase.from('patients').select('id, full_name, uhid').in('id', c).order('id').range(f, t))))

  const patientName = new Map(patients.map((p) => [p.id, p.uhid ? `${p.full_name} (${p.uhid})` : p.full_name]))
  const admissionPatient = new Map(admissions.map((a) => [a.id as string, a.patient_id as string]))
  const billInfo = new Map(bills.map((b) => [b.id as string, { no: b.bill_no as string, patient: b.patient_id as string | null }]))
  const staffName = new Map(staff.map((p) => [p.id as string, p.full_name as string]))

  const rows: ActivityRow[] = raw.map((r) => {
    const bill = r.entity === 'bill' && r.entity_id ? billInfo.get(r.entity_id) : undefined
    const pid = (r.entity === 'patient' ? r.entity_id : null)
      ?? (r.entity === 'admission' && r.entity_id ? admissionPatient.get(r.entity_id) : null)
      ?? (isUuid(r.meta?.patient_id) ? (r.meta!.patient_id as string) : null)
      ?? bill?.patient ?? null
    const refs: ActivityRefs = {
      patient: pid ? patientName.get(pid) ?? null : null,
      bill: bill?.no ?? null,
      staff: r.entity === 'staff' && r.entity_id ? staffName.get(r.entity_id) ?? null : null,
    }
    return {
      id: r.id,
      at: r.created_at,
      actorId: r.actor_id,
      actorName: r.actor_id ? staffName.get(r.actor_id) ?? 'A removed user' : 'The system',
      area: areaOf(r.entity),
      text: describeActivity(r, refs),
      href: activityLink(r),
      sensitive: isSensitiveView(r.entity, r.action),
    }
  })

  const counts = new Map<string, { actorId: string | null; name: string; count: number }>()
  for (const r of rows) {
    const k = r.actorId ?? 'system'
    const c = counts.get(k) ?? { actorId: r.actorId, name: r.actorName, count: 0 }
    c.count++
    counts.set(k, c)
  }
  return { rows, truncated, byPerson: [...counts.values()].sort((a, b) => b.count - a.count) }
}

/** Staff of the caller's hospital, for the person filter. */
export async function listActors(): Promise<{ id: string; full_name: string }[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'audit:read')
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name').eq('tenant_id', actor.tenant_id).order('full_name')
  return (data ?? []) as { id: string; full_name: string }[]
}
