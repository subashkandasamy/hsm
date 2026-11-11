/**
 * The surgery record — shared by the OT screen, the server actions, the
 * operation-record printout and billing.
 *
 * KMCH has no OT forms of its own, so the items follow the operation record we
 * already printed (OtRecordPdf's write-in lines) and the WHO Surgical Safety
 * Checklist (2009), which is what NABH assessors ask to see.
 */

export const ANAESTHESIA_TYPES = [
  { value: 'general',                  label: 'General' },
  { value: 'spinal',                   label: 'Spinal' },
  { value: 'epidural',                 label: 'Epidural' },
  { value: 'combined_spinal_epidural', label: 'Combined spinal-epidural' },
  { value: 'regional_block',           label: 'Regional / nerve block' },
  { value: 'local',                    label: 'Local' },
  { value: 'sedation',                 label: 'Sedation' },
  { value: 'other',                    label: 'Other' },
] as const
export type AnaesthesiaType = (typeof ANAESTHESIA_TYPES)[number]['value']
export const ANAESTHESIA_VALUES = ANAESTHESIA_TYPES.map((a) => a.value) as [AnaesthesiaType, ...AnaesthesiaType[]]

/** ASA physical status; "E" marks an emergency operation (e.g. "IIIE"). */
export const ASA_GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const
export const ASA_PATTERN = /^(I|II|III|IV|V|VI)E?$/

export function anaesthesiaLabel(v: string | null | undefined): string | null {
  return ANAESTHESIA_TYPES.find((a) => a.value === v)?.label ?? (v || null)
}

// ── Before surgery ────────────────────────────────────────────────────────────

export interface PreOpChecklist {
  consent_signed?: boolean
  /** When the patient last ate or drank (ISO). */
  fasting_since?: string | null
  site_marked?: 'yes' | 'no' | 'not_applicable'
  pac_done?: boolean
  blood?: 'not_needed' | 'arranged' | 'pending'
  investigations_reviewed?: boolean
  done_at?: string | null
  done_by?: string | null
}

export const PRE_OP_ITEMS: Array<{ key: 'consent_signed' | 'pac_done' | 'investigations_reviewed'; label: string }> = [
  { key: 'consent_signed',          label: 'Surgical consent signed' },
  { key: 'pac_done',                label: 'Pre-anaesthetic check-up done' },
  { key: 'investigations_reviewed', label: 'Investigations reviewed' },
]

// ── WHO Surgical Safety Checklist ─────────────────────────────────────────────

export type SafetyStep = 'sign_in' | 'time_out' | 'sign_out'

export const SAFETY_STEPS: Array<{ step: SafetyStep; title: string; when: string; items: Array<{ key: string; label: string }> }> = [
  {
    step: 'sign_in', title: 'Sign in', when: 'Before induction of anaesthesia',
    items: [
      { key: 'identity_confirmed',  label: 'Patient has confirmed identity, site, procedure and consent' },
      { key: 'site_marked',         label: 'Site marked (or not applicable)' },
      { key: 'anaesthesia_checked', label: 'Anaesthesia machine and medication check complete' },
      { key: 'oximeter_on',         label: 'Pulse oximeter on the patient and working' },
      { key: 'allergy_known',       label: 'Known allergy checked' },
      { key: 'airway_risk',         label: 'Difficult airway / aspiration risk assessed, equipment ready' },
      { key: 'blood_loss_risk',     label: 'Risk of >500 ml blood loss (7 ml/kg in children) assessed, access and fluids ready' },
    ],
  },
  {
    step: 'time_out', title: 'Time out', when: 'Before skin incision',
    items: [
      { key: 'team_introduced',    label: 'All team members introduced by name and role' },
      { key: 'confirmed_aloud',    label: 'Surgeon, anaesthetist and nurse confirm patient, site and procedure' },
      { key: 'antibiotic_given',   label: 'Antibiotic prophylaxis given within the last 60 minutes (or not applicable)' },
      { key: 'critical_events',    label: 'Anticipated critical events reviewed (surgeon, anaesthetist, nursing)' },
      { key: 'sterility_confirmed', label: 'Sterility confirmed, equipment issues raised' },
      { key: 'imaging_displayed',  label: 'Essential imaging displayed (or not applicable)' },
    ],
  },
  {
    step: 'sign_out', title: 'Sign out', when: 'Before the patient leaves theatre',
    items: [
      { key: 'procedure_recorded',  label: 'Name of the procedure recorded' },
      { key: 'counts_correct',      label: 'Instrument, sponge and needle counts correct' },
      { key: 'specimen_labelled',   label: 'Specimen labelled, including the patient’s name' },
      { key: 'equipment_problems',  label: 'Equipment problems addressed' },
      { key: 'recovery_concerns',   label: 'Key concerns for recovery and management reviewed' },
    ],
  },
]

export interface SafetyStepRecord {
  items: Record<string, boolean>
  done_at: string | null
  done_by: string | null
}
export type SafetyChecklist = Partial<Record<SafetyStep, SafetyStepRecord>>

/** A step is done when every item is ticked and it was signed. */
export function stepComplete(rec: SafetyStepRecord | undefined, step: SafetyStep): boolean {
  const def = SAFETY_STEPS.find((s) => s.step === step)!
  return !!rec?.done_at && def.items.every((i) => rec.items?.[i.key])
}

// ── Before marking a surgery completed ───────────────────────────────────────

/**
 * What is still missing from the record. Shown before "Mark Completed" —
 * never a block: an emergency operation is completed first and written up
 * after, and the record stays editable after completion.
 */
export function missingFromRecord(o: {
  safety_checklist?: SafetyChecklist | null
  procedure_details?: string | null
  post_op_diagnosis?: string | null
  anaesthesia_type?: string | null
}): string[] {
  const out: string[] = []
  for (const s of SAFETY_STEPS) if (!stepComplete(o.safety_checklist?.[s.step], s.step)) out.push(`WHO checklist: ${s.title.toLowerCase()} not done`)
  if (!o.anaesthesia_type) out.push('Anaesthesia type')
  if (!o.post_op_diagnosis?.trim()) out.push('Post-operative diagnosis')
  if (!o.procedure_details?.trim()) out.push('Procedure details')
  return out
}

// ── Billing ───────────────────────────────────────────────────────────────────

export interface SurgeryChargeSource {
  id: string
  procedure_name: string
  price_snapshot: number | null
  surgeon_fee?: number | null
  anaesthetist_fee?: number | null
  surgeon?: { full_name: string } | null
  anaesthetist?: { full_name: string } | null
  team_members?: Array<{ role: string; fee?: number | null; profile?: { full_name: string } | null }> | null
}

const ROLE_FEE_LABEL: Record<string, string> = {
  surgeon: 'Surgeon fee', assistant: 'Assistant surgeon fee', anaesthetist: 'Anaesthetist fee',
  scrub_nurse: 'Scrub nurse fee', other: 'Fee',
}

/**
 * The bill lines for one completed surgery: the procedure charge, then each
 * doctor's fee as its own line (insurers ask for the break-up). Every line
 * carries the surgery's id as ref_id, so the surgery is billed — or taken off
 * a bill when cancelled — as one unit.
 */
export function surgeryChargeLines(o: SurgeryChargeSource): Array<{ source: 'ot'; ref_id: string; description: string; qty: number; unit_price: number }> {
  const lines: Array<{ source: 'ot'; ref_id: string; description: string; qty: number; unit_price: number }> = []
  const add = (description: string, amount: number | null | undefined) => {
    const n = Number(amount ?? 0)
    if (n > 0) lines.push({ source: 'ot', ref_id: o.id, description, qty: 1, unit_price: n })
  }
  add(o.procedure_name, o.price_snapshot)
  add(`Surgeon fee — ${o.surgeon?.full_name ?? 'surgeon'} (${o.procedure_name})`, o.surgeon_fee)
  add(`Anaesthetist fee — ${o.anaesthetist?.full_name ?? 'anaesthetist'} (${o.procedure_name})`, o.anaesthetist_fee)
  for (const m of o.team_members ?? []) {
    add(`${ROLE_FEE_LABEL[m.role] ?? 'Fee'} — ${m.profile?.full_name ?? 'team member'} (${o.procedure_name})`, m.fee)
  }
  return lines
}
