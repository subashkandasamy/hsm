'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { assertTreatmentStarted } from '@/app/actions/ipdDeclaration'
import { syncNursingBillLine } from '@/lib/ipdBilling'
import { AssignNurseSchema } from '@/lib/schemas'
import type { AdmissionNurseAssignment, PickerNurse, NursePickerData } from '@/lib/types'
import { istToday, istDayStartISO, istDayEndISO } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }

export async function assignNurse(params: {
  admissionId: string
  nurseId: string
  shift: string
  date: string
}): Promise<{ success: true; assignment: AdmissionNurseAssignment } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const parsed = AssignNurseSchema.safeParse(params)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { admissionId, nurseId, shift, date } = parsed.data

  const gate = await assertTreatmentStarted(admissionId)
  if (!gate.success) return gate

  const supabase = await createClient()

  // Resolve the (active) shift definition — its id is the stable per-shift billing key.
  const { data: shiftDef } = await supabase
    .from('shift_definitions')
    .select('id, label, is_active')
    .eq('code', shift)
    .maybeSingle()
  if (!shiftDef) return { success: false, error: `Unknown shift "${shift}"` }
  if (shiftDef.is_active === false) return { success: false, error: `Shift "${shiftDef.label}" is not active` }

  // Fetch the nurse's current charge rate (snapshot at assignment time)
  const { data: sp } = await supabase
    .from('staff_profiles')
    .select('nursing_charge_per_shift')
    .eq('profile_id', nurseId)
    .maybeSingle()

  const chargeSnapshot = (sp?.nursing_charge_per_shift as number) ?? 0

  const id = crypto.randomUUID()
  const { error } = await supabase.from('admission_nurse_assignments').insert({
    id,
    tenant_id:       actor.tenant_id,
    admission_id:    admissionId,
    nurse_id:        nurseId,
    shift,
    assigned_date:   date,
    charge_snapshot: chargeSnapshot,
  })

  if (error) {
    if (error.code === '23505')
      return { success: false, error: `A nurse is already assigned to the ${shiftDef.label} shift on ${date}` }
    return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'assign', 'nurse', id, { admissionId, nurseId, shift, date, chargeSnapshot })

  // Auto-bill today's shift onto the day's nursing bill (per-shift line, deduped by shift id).
  const today = istToday()
  if (date === today && chargeSnapshot > 0) {
    const { data: adm } = await supabase
      .from('admissions').select('patient_id').eq('id', admissionId).single()
    if (adm?.patient_id) {
      await syncNursingBillLine(supabase, actor.id, {
        tenantId: actor.tenant_id,
        admissionId,
        patientId: adm.patient_id as string,
        date: today,
        shiftDefId: shiftDef.id as string,
        description: `Nursing — ${shiftDef.label} Shift`,
        charge: chargeSnapshot,
      })
    }
  }

  const { data: row } = await supabase
    .from('admission_nurse_assignments')
    .select('*, nurse:profiles(id, full_name)')
    .eq('id', id)
    .single()

  return { success: true, assignment: row as unknown as AdmissionNurseAssignment }
}

export async function unassignNurse(assignmentId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const supabase = await createClient()

  // Block unassignment if that day's bill already exists (charge is locked in billing history)
  const { data: assignment } = await supabase
    .from('admission_nurse_assignments')
    .select('assigned_date, admission_id')
    .eq('id', assignmentId)
    .single()

  if (!assignment) return { success: false, error: 'Assignment not found' }

  const { count } = await supabase
    .from('bills')
    .select('id', { count: 'exact', head: true })
    .eq('admission_id', assignment.admission_id)
    .gte('created_at', istDayStartISO(assignment.assigned_date))
    .lt('created_at', istDayEndISO(assignment.assigned_date))

  if ((count ?? 0) > 0)
    return { success: false, error: 'Cannot unassign — this shift has already been billed' }

  const { error } = await supabase
    .from('admission_nurse_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'unassign', 'nurse', assignmentId, {})
  return { success: true }
}

export async function listAssignments(
  admissionId: string,
  dateRange?: { from: string; to: string }
): Promise<AdmissionNurseAssignment[]> {
  const supabase = await createClient()
  let q = supabase
    .from('admission_nurse_assignments')
    .select('*, nurse:profiles(id, full_name)')
    .eq('admission_id', admissionId)
    .order('assigned_date', { ascending: false })
    .order('shift')

  if (dateRange) {
    q = q.gte('assigned_date', dateRange.from).lte('assigned_date', dateRange.to)
  }

  const { data } = await q
  return (data ?? []) as unknown as AdmissionNurseAssignment[]
}

export async function setNursingCharge(
  profileId: string,
  amount: number | null
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  if (amount !== null && amount < 0)
    return { success: false, error: 'Amount cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('staff_profiles')
    .update({ nursing_charge_per_shift: amount })
    .eq('profile_id', profileId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'nursing_charge', profileId, { amount })
  return { success: true }
}

export async function listNurses(): Promise<Array<{
  id: string
  full_name: string
  nursing_charge_per_shift: number | null
}>> {
  const supabase = await createClient()

  const { data: nurses } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'nurse')
    .eq('is_active', true)
    .order('full_name')

  if (!nurses?.length) return []

  const { data: sp } = await supabase
    .from('staff_profiles')
    .select('profile_id, nursing_charge_per_shift')
    .in('profile_id', nurses.map((n) => n.id as string))

  const rateMap = new Map(
    (sp ?? []).map((r) => [r.profile_id as string, r.nursing_charge_per_shift as number | null])
  )

  return nurses.map((n) => ({
    id: n.id as string,
    full_name: n.full_name as string,
    nursing_charge_per_shift: rateMap.get(n.id as string) ?? null,
  }))
}

const DEFAULT_RATIO = 6

/**
 * Roster-aware, load-aware nurse list for the IPD assignment picker.
 * Rostered + available nurses float to the top; everyone else remains
 * searchable as an off-roster fallback.
 */
export async function listNursesForPicker(params: {
  admissionId: string; date: string; shift: string
}): Promise<NursePickerData> {
  const supabase = await createClient()
  const { admissionId, date, shift } = params

  const { data: adm } = await supabase
    .from('admissions').select('ward_id').eq('id', admissionId).maybeSingle()
  const wardId = (adm?.ward_id as string | null) ?? null

  // Roster, coverage rule and census are keyed on the room's NURSING UNIT (wing),
  // not the individual room. Resolve room → unit → all rooms in that unit.
  let unitId: string | null = null
  let unitRoomIds: string[] = []
  if (wardId) {
    const { data: room } = await supabase.from('wards').select('nursing_unit_id').eq('id', wardId).maybeSingle()
    unitId = (room?.nursing_unit_id as string | null) ?? null
    if (unitId) {
      const { data: rooms } = await supabase.from('wards').select('id').eq('nursing_unit_id', unitId)
      unitRoomIds = (rooms ?? []).map((r) => r.id as string)
    }
  }

  const [nursesRes, spRes, rosterRes, leaveRes, loadRes, ruleRes, bedsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'nurse').eq('is_active', true).order('full_name'),
    supabase.from('staff_profiles').select('profile_id, nursing_charge_per_shift'),
    unitId
      ? supabase.from('duty_roster').select('profile_id').eq('nursing_unit_id', unitId).eq('date', date).eq('shift', shift)
      : Promise.resolve({ data: [] as { profile_id: string }[] }),
    supabase.from('leave_requests').select('profile_id').eq('status', 'approved').lte('start_date', date).gte('end_date', date),
    supabase.from('admission_nurse_assignments').select('nurse_id').eq('assigned_date', date).eq('shift', shift),
    unitId
      ? supabase.from('ward_coverage_rules').select('patient_ratio, min_nurses').eq('nursing_unit_id', unitId).eq('shift_code', shift).maybeSingle()
      : Promise.resolve({ data: null }),
    unitRoomIds.length
      ? supabase.from('admissions').select('id', { count: 'exact', head: true }).in('ward_id', unitRoomIds).eq('status', 'admitted')
      : Promise.resolve({ count: 0 }),
  ])

  const rateMap = new Map((spRes.data ?? []).map(r => [r.profile_id as string, r.nursing_charge_per_shift as number | null]))
  const rostered = new Set((rosterRes.data ?? []).map(r => r.profile_id as string))
  const onLeave = new Set((leaveRes.data ?? []).map(r => r.profile_id as string))
  const loadMap = new Map<string, number>()
  for (const a of loadRes.data ?? []) {
    const nid = a.nurse_id as string
    loadMap.set(nid, (loadMap.get(nid) ?? 0) + 1)
  }
  const ratio = ((ruleRes.data as { patient_ratio?: number } | null)?.patient_ratio) ?? DEFAULT_RATIO

  const nurses: PickerNurse[] = (nursesRes.data ?? []).map(n => ({
    id: n.id as string,
    full_name: n.full_name as string,
    nursing_charge_per_shift: rateMap.get(n.id as string) ?? null,
    rostered: rostered.has(n.id as string),
    on_leave: onLeave.has(n.id as string),
    load: loadMap.get(n.id as string) ?? 0,
    capacity: ratio,
  }))

  // rostered & available first, then rostered-but-busy, then the rest — alpha within groups
  nurses.sort((a, b) => {
    const rank = (x: PickerNurse) => (x.on_leave ? 2 : x.rostered ? 0 : 1)
    return rank(a) - rank(b) || a.full_name.localeCompare(b.full_name)
  })

  const beds = (bedsRes as { count?: number }).count ?? 0
  const minN = ((ruleRes.data as { min_nurses?: number } | null)?.min_nurses) ?? 1
  const coverage = unitId
    ? { required: Math.max(minN, Math.ceil(beds / ratio)), assigned: rostered.size, occupied_beds: beds }
    : null

  return { nurses, wardId, coverage }
}
