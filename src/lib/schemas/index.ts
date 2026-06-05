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
  phone: z.string().min(7, 'Valid phone number required').max(20),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
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
  department_id: z.string().uuid().nullable().optional(),
})
export const AdmitPatientSchema = z.object({
  patient_id: z.string().uuid('Please select a patient'),
  admitting_doctor_id: z.string().uuid('Please select an admitting doctor'),
  bed_id: z.string().uuid('Please select a bed'),
  reason: z.string().nullable().optional(),
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
  drug_id: z.string().uuid(),
  batch_no: z.string().min(1, 'Batch number is required'),
  expiry: z.string().min(1, 'Expiry date is required'),
  qty_available: z.number().int().min(1, 'Quantity must be at least 1'),
  purchase_price: z.number().nullable().optional(),
  mrp: z.number().min(0, 'MRP is required'),
})

export const DispenseSchema = z.object({
  patient_id: z.string().uuid(),
  prescription_id: z.string().uuid().nullable().optional(),
  drug_id: z.string().uuid('Please select a drug'),
  qty: z.number().int().min(1, 'Quantity must be at least 1'),
})

// ---- Phase 4: OT ----

export const OtRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
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
  ot_schedule_id: z.string().uuid(),
  description:    z.string().min(1, 'Description is required'),
  qty:            z.number().int().min(1),
  unit_price:     z.number().min(0),
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
})

export const BloodRequestSchema = z.object({
  patient_id:     z.string().uuid('Please select a patient'),
  blood_group:    z.enum(BLOOD_GROUPS),
  component:      z.enum(BLOOD_COMPONENTS),
  units_required: z.number().int().min(1, 'At least 1 unit required'),
  notes:          z.string().nullable().optional(),
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
})

export const InsuranceClaimSchema = z.object({
  bill_id:      z.string().uuid('Please select a bill'),
  policy_id:    z.string().uuid('Please select a policy'),
  claim_amount: z.number().positive('Claim amount must be positive'),
})

export const AdvanceClaimSchema = z.object({
  next_status:     z.enum(['preauth','submitted','approved','rejected','settled']),
  approved_amount: z.number().positive().nullable().optional(),
  remarks:         z.string().nullable().optional(),
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
