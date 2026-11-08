/**
 * The activity log in plain words (Settings → Activity log).
 *
 * audit_logs records every action as `entity / action / meta` — "bill /
 * payment_group / {amount, method, allocated…}". This turns an entry into a
 * sentence a clinic admin reads without help, and files it under an area.
 *
 * Names come from `ref`, filled by the server from the ids an entry carries
 * (patients, bills, staff, admissions). A pair with no phrase of its own still
 * reads as words ("Shift close — cash register"), never as a code. Phone
 * numbers and emails in meta are deliberately not shown.
 *
 * Pure, so it can be tested: `npm run verify:activity`.
 */

export const ACTIVITY_AREAS = [
  { key: 'access',    label: 'Logins, staff & access' },
  { key: 'patients',  label: 'Patients & appointments' },
  { key: 'clinical',  label: 'OPD & clinical' },
  { key: 'ipd',       label: 'IPD & wards' },
  { key: 'billing',   label: 'Billing & money' },
  { key: 'lab',       label: 'Lab & radiology' },
  { key: 'pharmacy',  label: 'Pharmacy' },
  { key: 'registers', label: 'Emergency & legal registers' },
  { key: 'settings',  label: 'Hospital settings' },
] as const
export type ActivityArea = typeof ACTIVITY_AREAS[number]['key']

/** Which area each entity belongs to. Anything unlisted is 'settings'. */
const ENTITY_AREA: Record<string, ActivityArea> = {
  auth: 'access', staff: 'access', role_access: 'access', nurse: 'access', leave: 'access',
  duty_roster: 'access', roster_pattern: 'access', shift_definition: 'access',
  patient: 'patients', appointment: 'patients', follow_up: 'patients', doctor_availability: 'patients',
  barcode_wristband: 'patients',
  visit: 'clinical', visit_clinical_data: 'clinical', visit_consultation: 'clinical', visit_examination: 'clinical',
  visit_vitals: 'clinical', prescription: 'clinical', patient_history: 'clinical', care_plan: 'clinical',
  dental_chart: 'clinical', anc_record: 'clinical', referral: 'clinical', note_template: 'clinical',
  admission: 'ipd', care_team: 'ipd', doctor_visit: 'ipd', ipd_medication_order: 'ipd', ward: 'ipd',
  ot_schedule: 'ipd', ot_room: 'ipd', ot_team_member: 'ipd', blood_request: 'ipd',
  bill: 'billing', payment: 'billing', admission_advance: 'billing', cash_register: 'billing',
  cost_estimate: 'billing', insurance_claim: 'billing', insurance_policy: 'billing', pharmacy_bill: 'billing',
  billing_settings: 'billing', collection_account_route: 'billing', advance_percentage: 'billing',
  insurance_bank_account: 'billing', ipd_billing_config: 'billing',
  lab_order: 'lab', lab_test: 'lab', radiology_order: 'lab', radiology_test: 'lab', radiology_catalog: 'lab',
  barcode_sample: 'lab', analyzer_mapping: 'lab', analyzer_message: 'lab', connector: 'lab',
  drug: 'pharmacy', drug_batch: 'pharmacy', pharmacy: 'pharmacy', pharmacy_sale: 'pharmacy',
  ipd_pharmacy_request: 'pharmacy',
  emergency_case: 'registers', mlc_record: 'registers', mlc_register: 'registers', form_f: 'registers',
  mtp_record: 'registers',
}

export function areaOf(entity: string): ActivityArea {
  return ENTITY_AREA[entity] ?? 'settings'
}

/** Entities whose rows belong to an area — for filtering on the server. */
export function entitiesInArea(area: ActivityArea): string[] {
  return Object.entries(ENTITY_AREA).filter(([, a]) => a === area).map(([e]) => e)
}

/** Looking at a legal register is itself worth knowing about. */
export function isSensitiveView(entity: string, action: string): boolean {
  return action === 'read' && ['mlc_register', 'mlc_record', 'form_f', 'mtp_record'].includes(entity)
}

export interface ActivityEntry {
  entity: string
  action: string
  entity_id: string | null
  meta: Record<string, unknown> | null
}

/** Names the server looked up for the ids in an entry. */
export interface ActivityRefs {
  patient?: string | null        // "Ravi Kumar (UH-1)"
  bill?: string | null           // bill number
  staff?: string | null          // a staff member the entry is about (not the person who acted)
}

const rupees = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''
}
const METHOD: Record<string, string> = { cash: 'cash', card: 'card', upi: 'UPI', bank_transfer: 'bank transfer', insurance: 'insurance', advance: 'advance' }
const method = (v: unknown) => (typeof v === 'string' ? METHOD[v] ?? v : '')
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
const words = (v: string) => v.replace(/_/g, ' ')
const ROLE: Record<string, string> = {
  admin: 'Admin', doctor: 'Doctor', nurse: 'Nurse', receptionist: 'Receptionist', lab_tech: 'Lab technician',
  pharmacist: 'Pharmacist', accountant: 'Accountant', hr: 'HR',
}
const GROUP: Record<string, string> = {
  registration: 'Patient registration & appointments', billing: 'Billing & cash book', lab: 'Lab work',
  radiology: 'Radiology work', pharmacy: 'Pharmacy counter', inventory: 'Inventory', mlc: 'Emergency & accident register',
}

type Phrase = (m: Record<string, unknown>, r: ActivityRefs) => string
const on = (r: ActivityRefs, what = 'for') => (r.patient ? ` ${what} ${r.patient}` : '')
const billRef = (r: ActivityRefs) => (r.bill ? ` on bill ${r.bill}` : '')

const PHRASES: Record<string, Phrase> = {
  'auth/login_success':       () => 'Signed in',
  'auth/password_changed':    () => 'Changed their password',
  'staff/create':             (m) => `Added a staff member${s(m.role) ? ` as ${ROLE[s(m.role)] ?? words(s(m.role))}` : ''}`,
  'staff/update':             (_m, r) => `Updated ${r.staff ?? 'a staff member'}’s details`,
  'staff/deactivate':         (_m, r) => `Deactivated ${r.staff ?? 'a staff member'}`,
  'staff/reactivate':         (_m, r) => `Reactivated ${r.staff ?? 'a staff member'}`,
  'staff/resend_credentials': (_m, r) => `Re-sent login details to ${r.staff ?? 'a staff member'}`,
  'staff/attendance':         () => 'Marked attendance',
  'role_access/grant':        (m) => `Gave ${ROLE[s(m.role)] ?? words(s(m.role))} access to ${GROUP[s(m.access_group)] ?? words(s(m.access_group))}`,
  'role_access/revoke':       (m) => `Took ${GROUP[s(m.access_group)] ?? words(s(m.access_group))} away from ${ROLE[s(m.role)] ?? words(s(m.role))}`,

  'patient/create':           (m) => `Registered patient ${s(m.full_name) || 'a new patient'}${s(m.uhid) ? ` (${s(m.uhid)})` : ''}`,
  'patient/update':           (_m, r) => `Updated patient details${on(r)}`,
  'appointment/create':       (_m, r) => `Booked an appointment${on(r)}`,
  'appointment/check_in':     (_m, r) => `Checked in a patient${on(r, '—')}`,
  'appointment/cancel':       (_m, r) => `Cancelled an appointment${on(r)}`,

  'visit/start':              (_m, r) => `Started a consultation${on(r)}`,
  'visit/close':              (_m, r) => `Closed a consultation${on(r)}`,
  'visit/reopen':             (_m, r) => `Reopened a consultation${on(r)}`,
  'prescription/dose_override': () => 'Prescribed above the usual maximum dose, and recorded why',

  'admission/admit':          (_m, r) => `Admitted${r.patient ? ` ${r.patient}` : ' a patient'}`,
  'admission/discharge':      (_m, r) => `Discharged${r.patient ? ` ${r.patient}` : ' a patient'}`,

  'bill/generate':            (m, r) => `Raised bill ${s(m.bill_no) || r.bill || ''}${m.total !== undefined ? ` for ${rupees(m.total)}` : ''}`.replace(/\s+/g, ' ').trim(),
  'bill/payment':             (m, r) => `Took ${rupees(m.amount) || 'a payment'}${method(m.method) ? ` by ${method(m.method)}` : ''}${billRef(r)}`,
  'bill/payment_group':       (m) => `Took ${rupees(m.amount) || 'one payment'}${method(m.method) ? ` by ${method(m.method)}` : ''} across ${Array.isArray(m.allocated) ? m.allocated.length : 'several'} bills`,
  'bill/apply_advance':       (m, r) => `Used ${rupees(m.amount) || 'part'} of the advance${billRef(r)}`,
  'bill/discount':            (m, r) => `Gave a ${m.pct !== undefined ? `${m.pct}% ` : ''}discount${rupees(m.amount) ? ` of ${rupees(m.amount)}` : ''}${billRef(r)}${s(m.reason) ? ` (${s(m.reason)})` : ''}`,
  'bill/refund':              (m) => `Refunded ${rupees(m.amount) || 'money'}${method(m.method) ? ` by ${method(m.method)}` : ''}${s(m.credit_no) ? ` — credit note ${s(m.credit_no)}` : ''}`,
  'bill/finalize':            (_m, r) => `Finalised${r.bill ? ` bill ${r.bill}` : ' a bill'}`,
  'admission_advance/record': (m) => `Took an advance${rupees(m.amount) ? ` of ${rupees(m.amount)}` : ''}${method(m.method) ? ` by ${method(m.method)}` : ''}`,
  'admission_advance/collect_advance_deposit': (m) => `Collected an advance deposit${method(m.method) ? ` by ${method(m.method)}` : ''}`,
  'cash_register/shift_close': (m) => rupees(m.counted) ? `Closed the cash shift — counted ${rupees(m.counted)}, expected ${rupees(m.expected) || '₹0'}` : 'Closed the cash shift',

  'lab_order/create':         (_m, r) => `Ordered lab tests${on(r)}`,
  'lab_order/collect':        (_m, r) => `Collected a lab sample${on(r, 'from')}`,
  'lab_order/results':        (m) => `Entered lab results${Number(m.critical) > 0 ? ` — ${m.critical} critical` : ''}`,
  'lab_order/verify':         () => 'Signed a lab report',
  'lab_order/report':         () => 'Released a lab report',
  'radiology_order/create':   (_m, r) => `Ordered a scan${on(r)}`,
  'radiology_order/perform':  () => 'Performed a scan',
  'radiology_order/report':   () => 'Reported a scan',

  'drug/dispense':            (m, r) => `Dispensed ${m.qty !== undefined ? `${m.qty} units` : 'medicine'}${on(r, 'to')}${s(m.reason) ? ` — reason: ${s(m.reason)}` : ''}`.replace(/\s+/g, ' '),
  'pharmacy_sale/fulfill':    (m, r) => `Handed over a counter sale${m.item_count ? ` of ${m.item_count} item${Number(m.item_count) === 1 ? '' : 's'}` : ''}${on(r, 'to')}`,
  'pharmacy/receive_stock':   () => 'Received stock into the pharmacy',
  'ipd_pharmacy_request/dispense': () => 'Supplied medicine to a ward',

  'emergency_case/register':  (m, r) => `Registered an emergency case${on(r, '—')}${m.is_mlc ? ' (accident / MLC)' : ''}`,
  'mlc_register/read':        () => 'Viewed the accident (MLC) register',
  'mlc_record/read':          (m) => `Viewed accident record${s(m.ar_no) ? ` ${s(m.ar_no)}` : ''}`,
  'mlc_record/create':        () => 'Recorded an accident (MLC) case',
  'mlc_record/print':         () => 'Printed an accident (MLC) record',
  'form_f/read':              (m) => `Viewed Form F${s(m.serial_no) ? ` ${s(m.serial_no)}` : ''}`,
  'form_f/create':            () => 'Filled a Form F',

  'pharmacy_bill/generate':   (_m, r) => `Raised a pharmacy bill${on(r)}`,
  'pharmacy_sale/create':     (_m, r) => `Started a counter sale${on(r)}`,
  'pharmacy_sale/finalize':   () => 'Sent a counter sale to billing',
  'drug/add_batch':           () => 'Added a stock batch',
  'drug/update':              () => 'Updated a medicine',
  'admission/ipd_daily_catch_up': () => 'Raised the day’s ward charges',
  'admission/advance_deposit_created': (_m, r) => `Asked for an advance deposit${on(r)}`,
  'admission/critical_care':  (_m, r) => `Recorded critical-care notes${on(r)}`,
  'admission/note':           (_m, r) => `Wrote a ward note${on(r)}`,
  'admission/sign_declaration': (_m, r) => `Signed the admission declaration${on(r)}`,
  'emergency_case/add_charge': () => 'Added a charge to an emergency case',
  'emergency_case/remove_charge': () => 'Removed a charge from an emergency case',
  'emergency_case/attend':    () => 'Attended an emergency case',
  'emergency_case/visit':     () => 'Saw an emergency patient',
  'emergency_case/admit_from_emergency': () => 'Admitted a patient from emergency',
  'patient/immunization':     (_m, r) => `Recorded a vaccination${on(r)}`,
  'patient/immunization_undo': (_m, r) => `Undid a vaccination entry${on(r)}`,
  'insurance_claim/start_claim': () => 'Started an insurance claim',
  'insurance_claim/advance':  () => 'Moved an insurance claim to the next stage',
  'insurance_claim/settle':   (m) => `Settled an insurance claim${rupees(m.settled_amount) ? ` for ${rupees(m.settled_amount)}` : ''}`,
  'insurance_claim/eligibility_approved': () => 'Recorded insurance approval',
  'insurance_claim/eligibility_rejected': () => 'Recorded an insurance rejection',
  'insurance_policy/create':  (_m, r) => `Added an insurance policy${on(r)}`,
  'ward/create':              () => 'Added a ward',
  'ward/update':              () => 'Updated a ward',
  'ward/add_beds':            () => 'Added beds to a ward',
  'department/create':        () => 'Added a department',
  'procedure_tariff/create':  () => 'Added a procedure charge',
  'procedure_tariff/update':  () => 'Changed a procedure charge',
  'lab_test/create':          () => 'Added a lab test',
  'lab_test/update':          () => 'Changed a lab test',
  'ipd_billing_config/update': () => 'Changed the IPD billing settings',
  'ot_schedule/create':       () => 'Booked an operation',
  'referral/refer_out':       (_m, r) => `Referred a patient out${on(r, '—')}`,
  'notification/send':        () => 'Sent a message to a patient',
  'leave/request':            () => 'Asked for leave',
  'leave/approved':           () => 'Approved a leave request',
  'tenant_profile/update':    () => 'Updated the hospital profile',
  'billing_settings/update':  () => 'Changed which services are paid for first',
  'collection_account_route/update': () => 'Changed which account a department is paid into',
}


/** One entry as a sentence. Never empty, never a raw code. */
export function describeActivity(e: ActivityEntry, refs: ActivityRefs = {}): string {
  const phrase = PHRASES[`${e.entity}/${e.action}`]
  if (phrase) return phrase(e.meta ?? {}, refs).replace(/\s+/g, ' ').trim()
  const tail = refs.patient ? ` — ${refs.patient}` : refs.bill ? ` — bill ${refs.bill}` : ''
  // Reads after a name: "Ramesh recorded “finalize” on pharmacy sale".
  return `Recorded “${words(e.action)}” on ${words(e.entity)}${tail}`
}

/** Where a click on the entry should go, when there is a sensible page. */
export function activityLink(e: ActivityEntry): string | null {
  if (!e.entity_id) return null
  if (e.entity === 'bill') return `/billing/${e.entity_id}`
  if (e.entity === 'patient') return `/patients/${e.entity_id}`
  if (e.entity === 'admission') return `/ipd/${e.entity_id}`
  if (e.entity === 'mlc_record') return `/emergency/mlc/${e.entity_id}`
  return null
}
