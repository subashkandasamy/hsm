/**
 * The Initial Evaluation — sections, which setting shows which, and the small
 * calculations the form needs. Follows KMCH's 4-page ER Initial Evaluation
 * Record. Shared by the form, the server action and the ER printout.
 */
import type { ExamFindings } from '@/lib/clinicalExam'

export type AssessmentSetting = 'er' | 'ipd'

export interface ArrivalSection {
  /** Care before arrival — given by the ambulance or the referring hospital. */
  pre_hospital?: string
  iv_fluids?: boolean
  inotropes?: boolean
  ventilated?: boolean
  /** KMCH: "IVF ……", "Inotropes ……", "Ventilation ……" — what was running. */
  iv_fluids_note?: string; inotropes_note?: string; ventilation_note?: string
  bystander?: string
}

export interface OnArrivalSection {
  at?: string | null
  avpu?: 'A' | 'V' | 'P' | 'U' | ''
  oriented?: boolean | null
  hr?: number | null; sbp?: number | null; dbp?: number | null; rr?: number | null
  spo2?: number | null; temp?: number | null; grbs?: number | null; etco2?: number | null; weight?: number | null
  gcs_e?: number | null; gcs_v?: number | null; gcs_m?: number | null
  /** KMCH's on-arrival words, and orientation to time / place / person. */
  level?: 'unresponsive' | 'altered' | 'drowsy' | 'conscious' | ''
  orientation?: { time?: boolean; place?: boolean; person?: boolean }
  pain?: number | null
  id_marks?: string
  triage_staff?: string
}

/** KMCH's primary survey, box for box (older entries keep their free-text fields). */
export interface PrimarySurvey {
  airway?: {
    status?: 'patent' | 'at_risk' | 'obstructed' | ''; intervention?: string
    signs?: Array<'patent' | 'impending' | 'secretions' | 'stridor'>; oxygen_lpm?: number | null
    c_spine?: 'cleared' | 'collar' | ''; triple_immobilised?: boolean
  }
  breathing?: {
    findings?: string; intervention?: string
    trachea?: 'midline' | 'shift_right' | 'shift_left' | ''; surgical_emphysema?: 'yes' | 'no' | ''
    breath_r?: string; breath_l?: string; percussion_r?: string; percussion_l?: string
  }
  circulation?: {
    crt?: string; bleeding?: string; iv_access?: string; findings?: string
    central_pulse?: 'present' | 'absent' | ''; heart_sound?: 'yes' | 'no' | 'muffled' | ''
    peripheral_pulse?: 'present' | 'feeble' | 'absent' | ''; radio_femoral?: 'present' | 'absent' | ''
    pelvic_compression?: 'positive' | 'negative' | ''; actions?: string
  }
  disability?: { pupils_left?: string; pupils_right?: string; findings?: string; cbg?: number | null }
  exposure?: { findings?: string }
}

export const AIRWAY_SIGNS = [
  { value: 'patent', label: 'Patent' }, { value: 'impending', label: 'Impending compromise' },
  { value: 'secretions', label: 'Secretions' }, { value: 'stridor', label: 'Stridor' },
] as const
export const ARRIVAL_LEVELS = [
  { value: 'unresponsive', label: 'Unresponsive' }, { value: 'altered', label: 'Altered sensorium' },
  { value: 'drowsy', label: 'Drowsy' }, { value: 'conscious', label: 'Conscious' },
] as const
export const HABITS = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'ex', label: 'Ex' }] as const

export interface SampleHistory {
  complaint?: string
  history?: string
  medications?: string
  last_meal?: string
  lmp?: string
  events?: string
  /** KMCH social history */
  smoking?: 'yes' | 'no' | 'ex' | ''; alcohol?: 'yes' | 'no' | 'ex' | ''; social?: string
}

export interface EfastSection {
  done?: 'yes' | 'no' | ''
  results?: Record<string, 'positive' | 'negative' | ''>
  notes?: string
  /** KMCH: screening ECHO, USG chest, USG abdomen */
  echo?: string; usg_chest?: string; usg_abdomen?: string
}

export interface BurnsSection {
  /** Per body region: the fraction of that region burnt (0, 0.25, 0.5, 0.75, 1). */
  areas?: Record<string, number>
  depth?: string
}

export interface PlanSection {
  provisional_diagnosis?: string
  investigations?: string
  plan?: string
  service_contacted?: string
  disposition?: 'admit_ward' | 'admit_icu' | 'ot' | 'observation' | 'discharge' | 'refer' | ''
}

export interface TreatmentEntry { at: string; item: string; dose?: string; route?: string; by?: string }

export interface ShiftingSection {
  at?: string | null
  to?: string
  condition?: string
  escort?: string
  handed_over_to?: string
}

export interface AssessmentData {
  arrival?: ArrivalSection
  on_arrival?: OnArrivalSection
  primary_survey?: PrimarySurvey
  sample?: SampleHistory
  efast?: EfastSection
  secondary_survey?: ExamFindings
  burns?: BurnsSection
  plan?: PlanSection
  treatment?: TreatmentEntry[]
  shifting?: ShiftingSection
}
export type SectionKey = keyof AssessmentData

/** The sections in the order the form shows them, and where each applies. */
export const SECTIONS: Array<{ key: SectionKey; title: string; erOnly?: boolean }> = [
  { key: 'arrival',          title: 'Arrival & pre-hospital care', erOnly: true },
  { key: 'on_arrival',       title: 'On arrival' },
  { key: 'primary_survey',   title: 'Primary survey (A B C D E)', erOnly: true },
  { key: 'sample',           title: 'History (SAMPLE)' },
  { key: 'efast',            title: 'eFAST', erOnly: true },
  { key: 'secondary_survey', title: 'Examination (secondary survey)' },
  { key: 'burns',            title: 'Burns', erOnly: true },
  { key: 'plan',             title: 'Assessment & plan' },
  { key: 'treatment',        title: 'Treatment given', erOnly: true },
  { key: 'shifting',         title: 'Shifting note', erOnly: true },
]
export const SECTION_KEYS = SECTIONS.map((s) => s.key)

export function sectionsFor(setting: AssessmentSetting) {
  return SECTIONS.filter((s) => setting === 'er' || !s.erOnly)
}

/**
 * KMCH's eFAST table, in its order. "Positive" means the abnormal finding:
 * pleural sliding ABSENT (pneumothorax), or free fluid present.
 */
export const EFAST_VIEWS: Array<{ key: string; label: string }> = [
  { key: 'lung_right', label: 'Pleural sliding absent — right' },
  { key: 'lung_left', label: 'Pleural sliding absent — left' },
  { key: 'pleural', label: 'Free fluid — pleural space' },
  { key: 'pericardium', label: 'Free fluid — pericardial space' },
  { key: 'ruq', label: 'Free fluid — Morison’s space' },
  { key: 'luq', label: 'Free fluid — splenorenal space' },
  { key: 'pelvis', label: 'Free fluid — suprapubic view' },
]

export const DISPOSITIONS: Array<{ value: NonNullable<PlanSection['disposition']>; label: string }> = [
  { value: 'admit_ward', label: 'Admit — ward' },
  { value: 'admit_icu', label: 'Admit — ICU' },
  { value: 'ot', label: 'Shift to OT' },
  { value: 'observation', label: 'ER observation' },
  { value: 'discharge', label: 'Discharge from ER' },
  { value: 'refer', label: 'Refer' },
]

// ── Burns: rule of nines ──────────────────────────────────────────────────────

/**
 * Percentage of body surface per region. Adults: the rule of nines. Children
 * under 10: the head is larger and the legs smaller (modified rule — head 18,
 * each leg 13.5), which is what a paper chart without Lund–Browder uses.
 */
export function burnRegions(ageYears: number | null): Array<{ key: string; label: string; pct: number }> {
  const child = ageYears != null && ageYears < 10
  return [
    { key: 'head', label: 'Head & neck', pct: child ? 18 : 9 },
    { key: 'trunk_front', label: 'Front of trunk', pct: 18 },
    { key: 'trunk_back', label: 'Back of trunk', pct: 18 },
    { key: 'arm_right', label: 'Right arm', pct: 9 },
    { key: 'arm_left', label: 'Left arm', pct: 9 },
    { key: 'leg_right', label: 'Right leg', pct: child ? 13.5 : 18 },
    { key: 'leg_left', label: 'Left leg', pct: child ? 13.5 : 18 },
    { key: 'perineum', label: 'Perineum', pct: 1 },
  ]
}

/** Total body surface area burnt, % (one decimal). */
export function burnTotal(areas: Record<string, number> | undefined, ageYears: number | null): number {
  if (!areas) return 0
  const t = burnRegions(ageYears).reduce((sum, r) => sum + r.pct * Math.min(1, Math.max(0, Number(areas[r.key] ?? 0))), 0)
  return Math.round(t * 10) / 10
}

// ── Arrival vitals → the stay's first observation ─────────────────────────────

/** Columns for icu_observations from the on-arrival section; null when nothing was measured. */
export function arrivalObservation(o: OnArrivalSection | undefined): Record<string, number | null> | null {
  if (!o) return null
  const n = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const row = {
    hr: n(o.hr), sbp: n(o.sbp), dbp: n(o.dbp), rr: n(o.rr), spo2: n(o.spo2), temp: n(o.temp),
    gcs_e: n(o.gcs_e), gcs_v: n(o.gcs_v), gcs_m: n(o.gcs_m),
  }
  if (Object.values(row).every((v) => v == null)) return null
  const map = row.sbp != null && row.dbp != null ? Math.round((row.sbp + 2 * row.dbp) / 3) : null
  const gcs_total = row.gcs_e != null && row.gcs_v != null && row.gcs_m != null ? row.gcs_e + row.gcs_v + row.gcs_m : null
  return { ...row, map, gcs_total }
}

export function gcsTotal(o: OnArrivalSection | undefined): number | null {
  return o?.gcs_e != null && o?.gcs_v != null && o?.gcs_m != null ? Number(o.gcs_e) + Number(o.gcs_v) + Number(o.gcs_m) : null
}
