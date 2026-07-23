import { z } from 'zod'

// ---- Auth ----
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// ---- Admin ----
export const ProfileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1, 'Full name is required'),
  role: z.enum(['admin', 'doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'accountant']),
  phone: z.string().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
})

export const DepartmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Department name is required'),
  description: z.string().nullable().optional(),
})

// ---- Patient ----
export const PatientCreateSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(200),
  dob: z.string().nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  phone: z.string()
    .min(1, 'Phone number is required')
    .transform((v) => v.replace(/[\s\-().]/g, ''))
    .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  notify_whatsapp_consent: z.boolean().optional().default(false),
  notify_sms_consent: z.boolean().optional().default(false),
  aadhaar_no: z.string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{12}$/, 'Aadhaar must be exactly 12 digits'))
    .nullable().optional(),
})
export const PatientUpdateSchema = PatientCreateSchema.partial()

// ---- Appointment ----
export const AppointmentCreateSchema = z.object({
  patient_id: z.string().uuid('Please select a patient'),
  doctor_id: z.string().uuid('Please select a doctor'),
  department_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().min(1, 'Date and time required'),
  reason: z.string().nullable().optional(),
})

// ---- Visit / OPD ----
export const VitalsSchema = z.object({
  bp: z.string().nullable().optional(), pulse: z.string().nullable().optional(),
  temp: z.string().nullable().optional(), spo2: z.string().nullable().optional(),
  weight: z.string().nullable().optional(), height: z.string().nullable().optional(),
})
export const ConsultationSchema = z.object({
  complaint: z.string().nullable().optional(), diagnosis: z.string().nullable().optional(),
  icd_code: z.string().nullable().optional(), notes: z.string().nullable().optional(),
})
export const PrescriptionSchema = z.object({
  drug_name: z.string().min(1, 'Drug name is required'),
  dosage: z.string().nullable().optional(), frequency: z.string().nullable().optional(),
  duration: z.string().nullable().optional(), instructions: z.string().nullable().optional(),
})

// ---- Phase 2: Wards / IPD ----
export const WardCreateSchema = z.object({
  name: z.string().min(1, 'Ward name is required').max(100),
  ward_type: z.string().nullable().optional(),
  room_type_id: z.string().uuid().nullable().optional(),
  floor: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  is_temp: z.boolean().optional(),
  daily_rate: z.number().min(0).optional(),
})
export const AdmitPatientSchema = z.object({
  patient_id: z.string().uuid('Please select a patient'),
  // The OPD visit this admission was launched from, when applicable — captured
  // explicitly so the OPD→IPD link is exact and day-independent (not inferred).
  visit_id: z.string().uuid().nullable().optional(),
  // The Emergency case this admission was admitted from, when applicable — a
  // direct ER→IPD trail even when there was no consultation visit.
  emergency_case_id: z.string().uuid().nullable().optional(),
  admitting_doctor_id: z.string().uuid('Please select an admitting doctor'),
  bed_id: z.string().uuid('Please select a bed').nullable().optional(),
  ward_id: z.string().uuid().nullable().optional(),
  reason: z.string().nullable().optional(),
  procedure_tariff_id: z.string().uuid().nullable().optional(),
  direct_ot: z.boolean().optional(),
  is_temp_ward: z.boolean().optional(),
  temp_slot: z.string().max(50).nullable().optional(),
})
export const ProgressNoteSchema = z.object({
  note: z.string().min(1, 'Note is required'),
  vitals: VitalsSchema.optional(),
})
export const DischargeSchema = z.object({
  discharge_summary: z.string().min(1, 'Discharge summary is required'),
})

// ---- Phase 2: Emergency ----
export const EmergencyRegisterSchema = z.object({
  patient_id: z.string().uuid().nullable().optional(),
  prov_name: z.string().nullable().optional(),
  prov_gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  prov_age: z.number().int().min(0).max(120).nullable().optional(),
  triage_level: z.number().int().min(1).max(5),
  arrival_mode: z.enum(['walk_in', 'ambulance', 'referral']).nullable().optional(),
  complaint: z.string().nullable().optional(),
})

// ---- Phase 3: Lab ----
export const LabTestCatalogSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().nullable().optional(),
  category: z.string().min(1).optional().default('General'),
  sample_type: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  ref_low: z.number().nullable().optional(),
  ref_high: z.number().nullable().optional(),
  reference_range: z.string().nullable().optional(),
  price: z.number().min(0),
})

export const LabOrderSchema = z.object({
  patient_id: z.string().uuid(),
  visit_id: z.string().uuid().nullable().optional(),
  test_ids: z.array(z.string().uuid()).min(1, 'Select at least one test'),
})

export const LabResultItemSchema = z.object({
  item_id: z.string().uuid(),
  result_value: z.number().nullable().optional(),
  result_text: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  flag: z.enum(['pending', 'normal', 'high', 'low']).optional(),
})

// ---- Phase 3: Radiology ----
export const RadiologyCatalogSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  modality: z.string().nullable().optional(),
  body_part: z.string().optional().default('General'),
  price: z.number().min(0),
})

export const RadiologyOrderSchema = z.object({
  patient_id: z.string().uuid(),
  visit_id: z.string().uuid().nullable().optional(),
  test_id: z.string().uuid('Please select an imaging procedure'),
})

// ---- Phase 3: Pharmacy ----
export const DrugSchema = z.object({
  name: z.string().min(1, 'Drug name is required'),
  generic_name: z.string().nullable().optional(),
  form: z.string().nullable().optional(),
  strength: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  reorder_level: z.number().int().min(0).default(0),
})

export const DrugBatchSchema = z.object({
  drug_id:             z.string().uuid().nullable().optional(),
  drug_master_id:      z.string().uuid().nullable().optional(),
  batch_no:            z.string().min(1, 'Batch number is required'),
  expiry:              z.string().min(1, 'Expiry date is required'),
  qty_available:       z.number().int().min(1, 'Quantity must be at least 1'),
  purchase_price:      z.number().nullable().optional(),
  mrp:                 z.number().min(0, 'MRP is required'),
  reorder_level:       z.number().int().min(0).default(0),
  // Brand / GRN fields (migration 0044)
  drug_brand_id:       z.string().uuid().nullable().optional(),
  brand_name:          z.string().nullable().optional(),
  manufacturer:        z.string().nullable().optional(),
  pack_size:           z.number().int().min(1).nullable().optional(),
  pack_unit:           z.string().nullable().optional(),
  mfg_date:            z.string().nullable().optional(),
  hsn_code:            z.string().nullable().optional(),
  gst_rate:            z.number().min(0).max(28).nullable().optional(),
  supplier_name:       z.string().nullable().optional(),
  supplier_invoice_no: z.string().nullable().optional(),
  purchase_date:       z.string().nullable().optional(),
  storage_location:    z.string().nullable().optional(),
}).refine(d => !!(d.drug_id || d.drug_master_id), {
  message: 'Either drug_id or drug_master_id must be provided',
})

export const DispenseSchema = z.object({
  patient_id: z.string().uuid(),
  prescription_id: z.string().uuid().nullable().optional(),
  admission_id: z.string().uuid().nullable().optional(),
  drug_id: z.string().uuid('Please select a drug'),
  qty: z.number().int().min(1, 'Quantity must be at least 1'),
})

// ---- Phase 4: OT ----

export const OtRoomSchema = z.object({
  name:    z.string().min(1, 'Room name is required'),
  ot_type: z.string().nullable().optional(),
  floor:   z.string().nullable().optional(),
  block:   z.string().nullable().optional(),
  notes:   z.string().nullable().optional(),
  status:  z.enum(['active', 'maintenance', 'inactive']).optional(),
})

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'] as const
const BLOOD_COMPONENTS = ['whole','prbc','plasma','platelets'] as const

export const OtScheduleSchema = z.object({
  patient_id:       z.string().uuid('Please select a patient'),
  surgeon_id:       z.string().uuid('Please select a surgeon'),
  anaesthetist_id:  z.string().uuid().nullable().optional(),
  ot_room_id:       z.string().uuid('Please select an OT room'),
  procedure_name:   z.string().min(1, 'Procedure name is required'),
  scheduled_start:  z.string().min(1, 'Start time is required'),
  scheduled_end:    z.string().min(1, 'End time is required'),
  price_snapshot:   z.number().min(0),
  notes:            z.string().nullable().optional(),
})

export const OtConsumableSchema = z.object({
  ot_schedule_id:  z.string().uuid(),
  description:     z.string().min(1, 'Description is required'),
  qty:             z.number().int().min(1),
  drug_master_id:  z.string().uuid().nullable().optional(),
  drug_id:         z.string().uuid().nullable().optional(),
})

// ---- Phase 4: Blood Bank ----

export const BloodDonorSchema = z.object({
  name:               z.string().min(1, 'Donor name is required'),
  blood_group:        z.string().min(1, 'Blood group is required'),
  phone:              z.string().nullable().optional(),
  last_donation_date: z.string().nullable().optional(),
})

export const BloodUnitSchema = z.object({
  blood_group:  z.enum(BLOOD_GROUPS),
  component:    z.enum(BLOOD_COMPONENTS),
  donor_id:     z.string().uuid().nullable().optional(),
  collected_at: z.string().nullable().optional(),
  expiry:       z.string().min(1, 'Expiry date is required'),
  bag_number:   z.string().nullable().optional(),
  volume_ml:    z.number().int().positive().nullable().optional(),
})

const BLOOD_MARKER = z.enum(['reactive', 'non_reactive'])
export const BloodScreeningSchema = z.object({
  hiv:      BLOOD_MARKER,
  hbsag:    BLOOD_MARKER,
  hcv:      BLOOD_MARKER,
  syphilis: BLOOD_MARKER,
  malaria:  BLOOD_MARKER,
})

export const BloodRequestSchema = z.object({
  patient_id:     z.string().uuid('Please select a patient'),
  blood_group:    z.enum(BLOOD_GROUPS),
  component:      z.enum(BLOOD_COMPONENTS),
  units_required: z.number().int().min(1, 'At least 1 unit required'),
  notes:          z.string().nullable().optional(),
  // Encounter this request is raised for (one of admission / OT / OPD visit)
  admission_id:   z.string().uuid().nullable().optional(),
  ot_schedule_id: z.string().uuid().nullable().optional(),
  visit_id:       z.string().uuid().nullable().optional(),
  urgency:        z.enum(['routine', 'urgent', 'emergency']).default('routine'),
  indication:     z.string().nullable().optional(),
  required_by:    z.string().nullable().optional(),
})

export const BloodComponentChargeSchema = z.object({
  component: z.enum(BLOOD_COMPONENTS),
  price:     z.number().min(0, 'Price cannot be negative'),
})

export const BloodCrossmatchSchema = z.object({
  recipient_sample_no: z.string().nullable().optional(),
  major_result: z.enum(['compatible', 'incompatible']),
  minor_result: z.enum(['compatible', 'incompatible']).nullable().optional(),
})

export const BloodIssueSchema = z.object({
  request_id:    z.string().uuid(),
  blood_unit_id: z.string().uuid(),
  price_snapshot: z.number().min(0),
})

// ---- Phase 5: Billing ----

export const GenerateBillSchema = z.object({
  patient_id:    z.string().uuid('Please select a patient'),
  visit_id:      z.string().uuid().nullable().optional(),
  admission_id:  z.string().uuid().nullable().optional(),
  selected_refs: z.array(z.string()),
  manual_items:  z.array(z.object({
    description: z.string().min(1),
    qty:         z.number().min(1),
    unit_price:  z.number().min(0),
  })).optional().default([]),
})

export const ApplyDiscountSchema = z.object({
  bill_id:  z.string().uuid(),
  discount: z.number().min(0),
})

export const SetTaxSchema = z.object({
  bill_id: z.string().uuid(),
  tax:     z.number().min(0),
})

export const RecordPaymentSchema = z.object({
  bill_id:   z.string().uuid(),
  amount:    z.number().positive('Amount must be positive'),
  method:    z.enum(['cash','card','upi','bank_transfer','insurance']),
  reference: z.string().nullable().optional(),
})

// ---- Phase 5: Insurance ----

export const InsurancePolicySchema = z.object({
  patient_id:      z.string().uuid('Please select a patient'),
  provider:        z.string().min(1, 'Provider is required'),
  policy_no:       z.string().min(1, 'Policy number is required'),
  valid_till:      z.string().nullable().optional(),
  coverage_amount: z.number().nullable().optional(),
  tpa_id:          z.string().uuid().nullable().optional(),
  room_rent_limit_per_day: z.number().nullable().optional(),
  sub_limit_notes:         z.string().nullable().optional(),
  member_id:                 z.string().nullable().optional(),
  policyholder_name:         z.string().nullable().optional(),
  policyholder_relationship: z.enum(['self','spouse','parent','child','sibling','other']).nullable().optional(),
  corporate_name:            z.string().nullable().optional(),
  employee_id:               z.string().nullable().optional(),
  copay_percent:             z.number().min(0).max(100).nullable().optional(),
  policy_start_date:         z.string().nullable().optional(),
})

// Partial update of an existing policy — same fields as create, all optional.
export const UpdatePolicySchema = InsurancePolicySchema.partial()

// A claim targets exactly one encounter: an admission (IPD), an OPD visit,
// or a single bill (legacy / one-off). At least one must be provided.
export const InsuranceClaimSchema = z.object({
  admission_id: z.string().uuid().nullable().optional(),
  visit_id:     z.string().uuid().nullable().optional(),
  bill_id:      z.string().uuid().nullable().optional(),
  policy_id:    z.string().uuid('Please select a policy'),
  claim_amount: z.number().positive('Claim amount must be positive'),
  claim_type:   z.enum(['cashless','reimbursement']).optional().default('cashless'),
}).refine(
  (v) => !!(v.admission_id || v.visit_id || v.bill_id),
  { message: 'A claim must be linked to an admission, a visit, or a bill', path: ['admission_id'] },
)

// Stage 1 "Add Policy" — creates the claim itself, scoped to an IPD admission,
// an OPD visit, or — before a visit even exists yet, e.g. at the OPD
// payment-pending queue — a specific bill directly. Exactly one scope must be
// given. No amount yet — that's entered at Stage 2 once eligibility work begins.
export const StartClaimSchema = z.object({
  admission_id: z.string().uuid().nullable().optional(),
  visit_id:     z.string().uuid().nullable().optional(),
  bill_id:      z.string().uuid().nullable().optional(),
  policy_id:    z.string().uuid('Select a policy'),
}).refine(
  (v) => !!(v.admission_id || v.visit_id || v.bill_id),
  { message: 'A claim must be linked to an admission, a visit, or a bill', path: ['admission_id'] },
)

// Stage 2 "Eligibility Check" fields — editable independently of the
// approve/reject decision itself (DecideEligibilitySchema below). Includes the
// pre-auth compliance data a TPA cashless form demands.
export const CostBreakdownSchema = z.object({
  room:         z.number().nonnegative().nullable().optional(),
  icu:          z.number().nonnegative().nullable().optional(),
  ot:           z.number().nonnegative().nullable().optional(),
  professional: z.number().nonnegative().nullable().optional(),
  pharmacy:     z.number().nonnegative().nullable().optional(),
  implants:     z.number().nonnegative().nullable().optional(),
  other:        z.number().nonnegative().nullable().optional(),
})

export const EligibilityFieldsSchema = z.object({
  estimated_amount:        z.number().positive('Estimated amount must be positive').nullable().optional(),
  diagnosis:               z.string().nullable().optional(),
  room_category_requested: z.string().nullable().optional(),
  icd_code:                z.string().nullable().optional(),
  admission_type:          z.enum(['planned','emergency']).nullable().optional(),
  admit_datetime:          z.string().nullable().optional(),
  cost_breakdown:          CostBreakdownSchema.nullable().optional(),
})

// Insurer-side identifiers, editable at any stage as the TPA returns them.
export const ClaimIdentifiersSchema = z.object({
  preauth_number:       z.string().nullable().optional(),
  insurer_claim_number: z.string().nullable().optional(),
})

// Free-form correction of any recorded value on a claim — the "Edit" action on
// each stage, so a mistyped amount or field can be fixed without re-running the
// stage transition. All optional; only supplied keys are written.
export const ClaimFieldsSchema = z.object({
  estimated_amount:            z.number().nonnegative().nullable().optional(),
  diagnosis:                   z.string().nullable().optional(),
  room_category_requested:     z.string().nullable().optional(),
  icd_code:                    z.string().nullable().optional(),
  admission_type:              z.enum(['planned','emergency']).nullable().optional(),
  cost_breakdown:              CostBreakdownSchema.nullable().optional(),
  eligibility_approved_amount: z.number().nonnegative().nullable().optional(),
  claim_amount:                z.number().nonnegative().nullable().optional(),
  approved_amount:             z.number().nonnegative().nullable().optional(),
  copay_amount:                z.number().nonnegative().nullable().optional(),
  settled_amount:              z.number().nonnegative().nullable().optional(),
  tds_amount:                  z.number().nonnegative().nullable().optional(),
  settlement_utr:              z.string().nullable().optional(),
  settlement_notes:            z.string().nullable().optional(),
  denial_reason:               z.string().nullable().optional(),
})

// A single disallowance / deduction line the TPA applied at settlement.
export const ClaimDeductionSchema = z.object({
  claim_id:       z.string().uuid(),
  description:    z.string().min(1, 'Describe the deduction'),
  amount:         z.number().positive('Amount must be positive'),
  deduction_type: z.enum(['non_payable','room_rent','copay','reasonable_customary','other']),
})

// Tier 2 — desk operations
export const SetClaimOwnerSchema = z.object({
  owner_id:      z.string().uuid().nullable().optional(),
  follow_up_due: z.string().nullable().optional(),
})

export const ChecklistItemSchema = z.object({
  claim_id: z.string().uuid(),
  item:     z.string().min(1, 'Item name required'),
})

export const EnhancementSchema = z.object({
  claim_id:         z.string().uuid(),
  requested_amount: z.number().positive('Requested amount must be positive'),
  al_number:        z.string().nullable().optional(),
  remarks:          z.string().nullable().optional(),
})

export const DecideEnhancementSchema = z.object({
  id:              z.string().uuid(),
  decision:        z.enum(['approved','rejected']),
  approved_amount: z.number().positive().nullable().optional(),
  al_number:       z.string().nullable().optional(),
})

// Tier 3 — enterprise parity
export const TariffPackageSchema = z.object({
  id:           z.string().uuid().optional(),
  provider:     z.string().nullable().optional(),
  tpa_id:       z.string().uuid().nullable().optional(),
  package_name: z.string().min(1, 'Package name required').max(160),
  package_code: z.string().max(60).nullable().optional(),
  amount:       z.number().nonnegative('Amount must be zero or positive'),
  is_active:    z.boolean().optional().default(true),
})

export const RemittanceBatchSchema = z.object({
  id:            z.string().uuid().optional(),
  reference:     z.string().min(1, 'Reference / UTR required').max(120),
  insurer:       z.string().nullable().optional(),
  total_amount:  z.number().nonnegative('Total must be zero or positive'),
  received_date: z.string().nullable().optional(),
  account_id:    z.string().uuid().nullable().optional(),
  notes:         z.string().nullable().optional(),
})

// A single timestamped entry in a claim's enquiry log — the TPA back-and-forth
// loop (queries raised, clarifications sent) tracked separately from the one
// remarks field captured at each stage transition.
export const ClaimNoteSchema = z.object({
  claim_id: z.string().uuid(),
  note:     z.string().min(1, 'Note cannot be empty'),
})

export const UpdateClaimNoteSchema = z.object({
  id:   z.string().uuid(),
  note: z.string().min(1, 'Note cannot be empty'),
})

// Stage 2's own decision — independent of the claim's main status (Stage 3/4).
// Front-desk verification is a 2-3 minute check (corporate ID / policy card /
// a quick portal lookup), not the slow multi-day TPA claim process.
export const DecideEligibilitySchema = z.object({
  id:              z.string().uuid(),
  decision:        z.enum(['approved', 'rejected']),
  approved_amount: z.number().positive().nullable().optional(),
  remarks:         z.string().nullable().optional(),
  denial_reason:   z.string().nullable().optional(),
})

// Stage 3 "Claim" transitions only — a claim is created directly in
// 'awaiting_eligibility', so that status is never a transition target here,
// and settlement is its own dedicated action (RecordSettlementSchema) since
// it needs a bank account, not a generic status flip.
export const AdvanceClaimSchema = z.object({
  next_status:     z.enum(['raised','submitted','approved','rejected']),
  claim_amount:    z.number().positive().nullable().optional(),
  approved_amount: z.number().positive().nullable().optional(),
  copay_amount:    z.number().nonnegative().nullable().optional(),
  remarks:         z.string().nullable().optional(),
  denial_reason:   z.string().nullable().optional(),
})

// Stage 4 — recording where the settlement landed and what was actually
// received (gross), the TDS the insurer withheld, the remittance reference, and
// how any shortfall against the eligibility-covered figure is resolved.
export const RecordSettlementSchema = z.object({
  id:                     z.string().uuid(),
  settled_amount:         z.number().nonnegative('Settled amount must be zero or positive'),
  settlement_account_id:  z.string().uuid('Select a bank account'),
  settlement_notes:       z.string().nullable().optional(),
  settlement_utr:         z.string().nullable().optional(),
  tds_amount:             z.number().nonnegative().nullable().optional(),
  shortfall_resolution:   z.enum(['write_off','recover_from_patient']).nullable().optional(),
})

// Enhancement: raise the claimed amount mid-stay (cost overran the estimate).
export const EnhanceClaimSchema = z.object({
  claim_amount: z.number().positive('Amount must be positive'),
  remarks:      z.string().nullable().optional(),
})

export const InsuranceTpaSchema = z.object({
  id:             z.string().uuid().optional(),
  name:           z.string().min(1, 'Name is required').max(120),
  code:           z.string().max(40).nullable().optional(),
  contact_person: z.string().max(120).nullable().optional(),
  phone:          z.string().max(40).nullable().optional(),
  email:          z.string().max(160).nullable().optional(),
  notes:          z.string().max(500).nullable().optional(),
  is_active:      z.boolean().optional().default(true),
})

export const InsuranceBankAccountSchema = z.object({
  id:             z.string().uuid().optional(),
  account_name:   z.string().min(1, 'Account name is required').max(120),
  bank_name:      z.string().max(120).nullable().optional(),
  account_number: z.string().max(40).nullable().optional(),
  ifsc_code:      z.string().max(20).nullable().optional(),
  is_active:      z.boolean().optional().default(true),
})

// ---- Type exports ----
export type LoginInput = z.infer<typeof LoginSchema>
export type ProfileInput = z.infer<typeof ProfileSchema>
export type DepartmentInput = z.infer<typeof DepartmentSchema>
export type PatientCreateInput = z.infer<typeof PatientCreateSchema>
export type PatientUpdateInput = z.infer<typeof PatientUpdateSchema>
export type AppointmentCreateInput = z.infer<typeof AppointmentCreateSchema>
export type VitalsInput = z.infer<typeof VitalsSchema>
export type ConsultationInput = z.infer<typeof ConsultationSchema>
export type PrescriptionInput = z.infer<typeof PrescriptionSchema>
export type WardCreateInput = z.infer<typeof WardCreateSchema>
export type AdmitPatientInput = z.infer<typeof AdmitPatientSchema>
export type ProgressNoteInput = z.infer<typeof ProgressNoteSchema>
export type DischargeInput = z.infer<typeof DischargeSchema>
export type EmergencyRegisterInput = z.infer<typeof EmergencyRegisterSchema>
export type LabTestCatalogInput = z.infer<typeof LabTestCatalogSchema>
export type LabOrderInput = z.infer<typeof LabOrderSchema>
export type LabResultItemInput = z.infer<typeof LabResultItemSchema>
export type RadiologyCatalogInput = z.infer<typeof RadiologyCatalogSchema>
export type RadiologyOrderInput = z.infer<typeof RadiologyOrderSchema>
export type DrugInput = z.infer<typeof DrugSchema>
export type DrugBatchInput = z.infer<typeof DrugBatchSchema>
export type DispenseInput = z.infer<typeof DispenseSchema>
export type OtRoomInput = z.infer<typeof OtRoomSchema>
export type OtScheduleInput = z.infer<typeof OtScheduleSchema>
export type OtConsumableInput = z.infer<typeof OtConsumableSchema>
export type BloodDonorInput = z.infer<typeof BloodDonorSchema>
export type BloodUnitInput = z.infer<typeof BloodUnitSchema>
export type BloodRequestInput = z.infer<typeof BloodRequestSchema>
export type BloodIssueInput = z.infer<typeof BloodIssueSchema>
export type GenerateBillInput = z.infer<typeof GenerateBillSchema>
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>
export type InsurancePolicyInput = z.infer<typeof InsurancePolicySchema>
export type InsuranceClaimInput = z.infer<typeof InsuranceClaimSchema>
export type AdvanceClaimInput = z.infer<typeof AdvanceClaimSchema>
export type StartClaimInput = z.infer<typeof StartClaimSchema>
export type EligibilityFieldsInput = z.infer<typeof EligibilityFieldsSchema>
export type DecideEligibilityInput = z.infer<typeof DecideEligibilitySchema>
export type RecordSettlementInput = z.infer<typeof RecordSettlementSchema>
export type EnhanceClaimInput = z.infer<typeof EnhanceClaimSchema>
export type InsuranceTpaInput = z.infer<typeof InsuranceTpaSchema>
export type InsuranceBankAccountInput = z.infer<typeof InsuranceBankAccountSchema>

// ---- Phase 6: Inventory ----
export const SupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name required').max(200),
  contact_person: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Invalid email').nullable().optional().or(z.literal('')),
})
export const InventoryItemSchema = z.object({
  name: z.string().min(1, 'Item name required').max(200),
  category: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  reorder_level: z.coerce.number().int().min(0).default(0),
})
export const PoLineSchema = z.object({
  item_id: z.string().uuid('Select an item'),
  qty: z.coerce.number().int().min(1, 'Qty must be ≥ 1'),
  unit_price: z.coerce.number().min(0),
})
export const CreatePOSchema = z.object({
  supplier_id: z.string().uuid().nullable().optional(),
  lines: z.array(PoLineSchema).min(1, 'Add at least one item'),
})
export const ReceivePOSchema = z.object({
  po_id: z.string().uuid(),
  receipts: z.array(z.object({
    po_item_id: z.string().uuid(),
    received_qty: z.coerce.number().int().min(0),
  })),
})
export const StockIssueSchema = z.object({
  item_id: z.string().uuid(),
  qty: z.coerce.number().int().min(1, 'Qty must be ≥ 1'),
  note: z.string().nullable().optional(),
})
export const StockAdjustSchema = z.object({
  item_id: z.string().uuid(),
  change: z.coerce.number().int().refine((n) => n !== 0, 'Change cannot be zero'),
  note: z.string().min(1, 'Note required for adjustment'),
})

// ---- Phase 6: HR ----
export const CreateStaffSchema = z.object({
  full_name: z.string().min(1, 'Full name required').max(200),
  email: z.string().email('Valid email required'),
  temp_password: z.string().min(8, 'Password must be ≥ 8 characters'),
  role: z.enum(['admin','doctor','nurse','receptionist','lab_tech','pharmacist','accountant']),
  department_id: z.string().uuid().nullable().optional(),
  phone: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  joining_date: z.string().nullable().optional(),
  consultation_fee: z.number().nonnegative().nullable().optional(),
  nursing_charge_per_shift: z.number().nonnegative().nullable().optional(),
})
export const UpdateStaffSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin','doctor','nurse','receptionist','lab_tech','pharmacist','accountant']).optional(),
  department_id: z.string().uuid().nullable().optional(),
  phone: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  joining_date: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
  consultation_fee: z.number().nonnegative().nullable().optional(),
  nursing_charge_per_shift: z.number().nonnegative().nullable().optional(),
})
export const MarkAttendanceSchema = z.object({
  profile_id: z.string().uuid(),
  date: z.string().min(1, 'Date required'),
  status: z.enum(['present','absent','leave','half_day']),
  shift: z.string().min(1).nullable().optional(),      // shift code (configurable)
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
})
export const SetRosterSchema = z.object({
  profile_id: z.string().uuid(),
  date: z.string().min(1, 'Date required'),
  shift: z.string().min(1).nullable().optional(),      // shift code (configurable)
  ward_id: z.string().uuid().nullable().optional(),
})

// ---- Staff Scheduling & Nurse Rostering ----

export const ShiftDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1, 'Code required').max(32)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only'),
  label: z.string().min(1, 'Label required').max(60),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM'),
  crosses_midnight: z.boolean().optional().default(false),
  sort_order: z.number().int().nonnegative().optional().default(0),
  is_active: z.boolean().optional().default(true),
})

export const WardCoverageRuleSchema = z.object({
  ward_id: z.string().uuid('Select a ward'),
  shift_code: z.string().min(1, 'Select a shift'),
  patient_ratio: z.number().positive('Ratio must be > 0'),
  min_nurses: z.number().int().nonnegative().optional().default(1),
})

export const WardInchargeSchema = z.object({
  ward_id: z.string().uuid('Select a ward'),
  profile_id: z.string().uuid('Select a nurse'),
})

export const LeaveRequestSchema = z.object({
  profile_id: z.string().uuid().optional(),   // defaults to the requesting user
  leave_type: z.enum(['annual','casual','sick','unpaid','maternity','other']),
  start_date: z.string().min(1, 'Start date required'),
  end_date: z.string().min(1, 'End date required'),
  reason: z.string().max(500).nullable().optional(),
}).refine(v => v.end_date >= v.start_date, { message: 'End date cannot be before start date', path: ['end_date'] })

export const LeaveReviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved','rejected']),
})

export const RosterPatternSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name required').max(80),
  day_plan: z.array(z.string().min(1)).min(1, 'Add at least one cycle day').max(60),
})

export const RosterPatternMemberSchema = z.object({
  pattern_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  ward_id: z.string().uuid().nullable().optional(),
  anchor_date: z.string().min(1, 'Anchor date required'),
  offset_days: z.number().int().optional().default(0),
})

export const GenerateRosterSchema = z.object({
  ward_id: z.string().uuid('Select a ward'),
  start_date: z.string().min(1, 'Start date required'),
  end_date: z.string().min(1, 'End date required'),
  pattern_id: z.string().uuid().nullable().optional(),
  copy_forward: z.boolean().optional().default(false),
  auto_fill: z.boolean().optional().default(false),
}).refine(v => v.end_date >= v.start_date, { message: 'End date cannot be before start date', path: ['end_date'] })

export const AssignNurseSchema = z.object({
  admissionId: z.string().uuid(),
  nurseId: z.string().uuid(),
  shift: z.string().min(1),
  date: z.string().min(1),
})

export type SupplierInput = z.infer<typeof SupplierSchema>
export type InventoryItemInput = z.infer<typeof InventoryItemSchema>
export type CreatePOInput = z.infer<typeof CreatePOSchema>
export type ReceivePOInput = z.infer<typeof ReceivePOSchema>
export type StockIssueInput = z.infer<typeof StockIssueSchema>
export type StockAdjustInput = z.infer<typeof StockAdjustSchema>
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>
export type SetRosterInput = z.infer<typeof SetRosterSchema>
export type ShiftDefinitionInput = z.infer<typeof ShiftDefinitionSchema>
export type WardCoverageRuleInput = z.infer<typeof WardCoverageRuleSchema>
export type WardInchargeInput = z.infer<typeof WardInchargeSchema>
export type LeaveRequestInput = z.infer<typeof LeaveRequestSchema>
export type LeaveReviewInput = z.infer<typeof LeaveReviewSchema>
export type RosterPatternInput = z.infer<typeof RosterPatternSchema>
export type RosterPatternMemberInput = z.infer<typeof RosterPatternMemberSchema>
export type GenerateRosterInput = z.infer<typeof GenerateRosterSchema>
