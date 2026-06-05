export type Role =
  | 'admin'
  | 'doctor'
  | 'nurse'
  | 'receptionist'
  | 'lab_tech'
  | 'pharmacist'
  | 'accountant'

export interface Profile {
  id: string
  full_name: string
  role: Role
  phone: string | null
  department_id: string | null
  is_active: boolean
  created_at: string
}

export interface Department {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

// ---- Phase 1 ----

export interface Patient {
  id: string; uhid: string; full_name: string; dob: string | null
  gender: 'male' | 'female' | 'other' | null; phone: string; email: string | null
  address: string | null; blood_group: string | null; allergies: string | null
  emergency_contact_name: string | null; emergency_contact_phone: string | null
  created_by: string | null; created_at: string
}

export type AppointmentStatus = 'booked' | 'checked_in' | 'done' | 'cancelled' | 'no_show'

export interface Appointment {
  id: string; patient_id: string; doctor_id: string; department_id: string | null
  scheduled_at: string; token_no: number | null; status: AppointmentStatus
  reason: string | null; created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>
  doctor?: Pick<Profile, 'id' | 'full_name'>
  department?: Pick<Department, 'id' | 'name'>
}

export interface Vitals { bp?: string; pulse?: string; temp?: string; spo2?: string; weight?: string; height?: string }

export type VisitStatus = 'open' | 'closed'

export interface Prescription {
  id: string; visit_id: string; drug_name: string; dosage: string | null
  frequency: string | null; duration: string | null; instructions: string | null
}

export interface Visit {
  id: string; patient_id: string; doctor_id: string; appointment_id: string | null
  type: string; visit_date: string; vitals: Vitals | null; complaint: string | null
  diagnosis: string | null; icd_code: string | null; notes: string | null
  status: VisitStatus; created_at: string
  doctor?: Pick<Profile, 'id' | 'full_name'>
  prescriptions?: Prescription[]
}

// ---- Phase 2 ----

export type BedStatus = 'available' | 'occupied' | 'maintenance'
export interface Ward { id: string; name: string; ward_type: string | null; department_id: string | null; created_at: string }
export interface Bed { id: string; ward_id: string; bed_no: string; status: BedStatus; created_at: string }
export interface BedWithOccupant extends Bed { admission_id: string | null; patient_name: string | null; patient_uhid: string | null }
export interface WardWithBeds extends Ward { beds: BedWithOccupant[] }

export type AdmissionStatus = 'admitted' | 'discharged' | 'transferred'
export interface Admission {
  id: string; patient_id: string; admitting_doctor_id: string; ward_id: string; bed_id: string
  reason: string | null; admitted_at: string; discharged_at: string | null
  status: AdmissionStatus; discharge_summary: string | null
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone' | 'blood_group' | 'allergies'>
  doctor?: Pick<Profile, 'id' | 'full_name'>
  ward?: Pick<Ward, 'id' | 'name'>
  bed?: Pick<Bed, 'id' | 'bed_no'>
}

export interface IpdProgressNote {
  id: string; admission_id: string; author_id: string | null; note: string
  vitals: Vitals | null; created_at: string
  author?: Pick<Profile, 'id' | 'full_name' | 'role'>
}

export type TriageLevel = 1 | 2 | 3 | 4 | 5
export type EmergencyCaseStatus = 'waiting' | 'in_treatment' | 'admitted' | 'discharged' | 'referred'
export interface EmergencyCase {
  id: string; patient_id: string; triage_level: TriageLevel; arrival_mode: string | null
  complaint: string | null; attended_by: string | null; status: EmergencyCaseStatus
  outcome: string | null; arrived_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>
  attendant?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 3: Lab ----

export interface LabTestCatalog {
  id: string; name: string; code: string | null; sample_type: string | null
  unit: string | null; ref_low: number | null; ref_high: number | null
  reference_range: string | null; price: number; is_active: boolean
}

export type LabFlag = 'pending' | 'normal' | 'high' | 'low'
export type LabOrderStatus = 'ordered' | 'collected' | 'processing' | 'reported' | 'cancelled'

export interface LabOrderItem {
  id: string; lab_order_id: string; test_id: string; price_snapshot: number
  result_value: number | null; result_text: string | null; unit: string | null; flag: LabFlag
  test?: Pick<LabTestCatalog, 'id' | 'name' | 'code' | 'unit' | 'ref_low' | 'ref_high' | 'reference_range' | 'sample_type'>
}

export type BillingStatus = 'unbilled' | 'billed'

export interface LabOrder {
  id: string; patient_id: string; visit_id: string | null; ordered_by: string | null
  status: LabOrderStatus; billing_status: BillingStatus
  ordered_at: string; reported_at: string | null
  items?: LabOrderItem[]
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  orderer?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 3: Radiology ----

export interface RadiologyCatalog {
  id: string; name: string; modality: string | null; price: number; is_active: boolean
}

export type RadiologyOrderStatus = 'ordered' | 'performed' | 'reported' | 'cancelled'

export interface RadiologyOrder {
  id: string; patient_id: string; visit_id: string | null; test_id: string
  ordered_by: string | null; price_snapshot: number
  status: RadiologyOrderStatus; billing_status: BillingStatus
  report: string | null; image_url: string | null
  ordered_at: string; reported_at: string | null
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  test?: Pick<RadiologyCatalog, 'id' | 'name' | 'modality'>
  orderer?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 3: Pharmacy ----

export interface Drug {
  id: string; name: string; generic_name: string | null; form: string | null
  strength: string | null; unit: string | null; reorder_level: number; is_active: boolean
}

export interface DrugBatch {
  id: string; drug_id: string; batch_no: string; expiry: string
  qty_available: number; purchase_price: number | null; mrp: number
  drug?: Pick<Drug, 'id' | 'name' | 'form' | 'strength' | 'unit'>
}

export interface DrugWithStock extends Drug {
  total_qty: number
  batches: DrugBatch[]
}

export interface Dispense {
  id: string; patient_id: string; prescription_id: string | null
  drug_id: string; drug_batch_id: string; qty: number; price_snapshot: number
  billing_status: BillingStatus; dispensed_by: string | null; dispensed_at: string
  drug?: Pick<Drug, 'id' | 'name' | 'form' | 'strength'>
  batch?: Pick<DrugBatch, 'id' | 'batch_no' | 'expiry'>
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
}

export interface PrescriptionWithVisit extends Prescription {
  visit_date: string
  visit_id: string
  patient_id: string
  patient_name: string
  patient_uhid: string
}

// ---- Phase 4: Operation Theatre ----

export interface OtRoom { id: string; name: string; is_active: boolean }
export type OtStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface OtConsumable {
  id: string; ot_schedule_id: string; description: string; qty: number; unit_price: number
}

export interface OtSchedule {
  id: string; patient_id: string; surgeon_id: string; anaesthetist_id: string | null
  ot_room_id: string; procedure_name: string; scheduled_start: string; scheduled_end: string
  status: OtStatus; notes: string | null; price_snapshot: number; billing_status: BillingStatus
  created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  surgeon?: Pick<Profile, 'id' | 'full_name'>
  anaesthetist?: Pick<Profile, 'id' | 'full_name'> | null
  room?: OtRoom
  consumables?: OtConsumable[]
}

// ---- Phase 4: Blood Bank ----

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export type BloodComponent = 'whole' | 'prbc' | 'plasma' | 'platelets'
export type BloodUnitStatus = 'available' | 'reserved' | 'issued' | 'expired' | 'discarded'
export type BloodRequestStatus = 'requested' | 'cross_matched' | 'issued' | 'cancelled'

export interface BloodDonor {
  id: string; name: string; blood_group: string; phone: string | null
  last_donation_date: string | null; created_at: string
}

export interface BloodUnit {
  id: string; blood_group: BloodGroup; component: BloodComponent
  donor_id: string | null; collected_at: string | null; expiry: string
  status: BloodUnitStatus; created_at: string
  donor?: Pick<BloodDonor, 'id' | 'name'> | null
}

export interface BloodRequest {
  id: string; patient_id: string; blood_group: string; component: string
  units_required: number; status: BloodRequestStatus
  requested_by: string | null; notes: string | null; requested_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  requester?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface BloodIssue {
  id: string; request_id: string; blood_unit_id: string; patient_id: string
  price_snapshot: number; billing_status: BillingStatus
  issued_by: string | null; issued_at: string
}

export interface BloodInventoryCell {
  blood_group: BloodGroup; component: BloodComponent
  available: number; near_expiry: number; expired: number
}

// ---- Phase 5: Billing ----

export type BillStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'insurance'
export type BillItemSource = 'consultation' | 'bed' | 'lab' | 'radiology' | 'pharmacy' | 'ot' | 'ot_consumable' | 'blood' | 'manual'

export interface Tariff { id: string; key: string; label: string | null; amount: number }

export interface BillItem {
  id: string; bill_id: string; source: BillItemSource; ref_id: string | null
  description: string; qty: number; unit_price: number; amount: number
}

export interface Payment {
  id: string; bill_id: string; amount: number; method: PaymentMethod
  reference: string | null; received_by: string | null; received_at: string
  receiver?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Bill {
  id: string; patient_id: string; visit_id: string | null; admission_id: string | null
  bill_no: string; subtotal: number; discount: number; tax: number; total: number; paid: number
  status: BillStatus; created_by: string | null; created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>
  items?: BillItem[]
  payments?: Payment[]
}

export interface ChargePreviewLine {
  source: BillItemSource; ref_id: string; description: string; qty: number; unit_price: number; amount: number
}

// ---- Phase 5: Insurance ----

export type InsuranceClaimStatus = 'draft' | 'preauth' | 'submitted' | 'approved' | 'rejected' | 'settled'

export interface InsurancePolicy {
  id: string; patient_id: string; provider: string; policy_no: string
  valid_till: string | null; coverage_amount: number | null; created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
}

export interface InsuranceClaim {
  id: string; bill_id: string; policy_id: string; claim_amount: number
  approved_amount: number | null; status: InsuranceClaimStatus
  remarks: string | null; submitted_at: string | null; created_at: string
  bill?: Pick<Bill, 'id' | 'bill_no' | 'total' | 'paid' | 'status'>
  policy?: Pick<InsurancePolicy, 'id' | 'provider' | 'policy_no'>
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
}

// ---- Permissions ----

export type Permission =
  | 'admin:all'
  | 'patients:read' | 'patients:write'
  | 'appointments:read' | 'appointments:write'
  | 'opd:read' | 'opd:write' | 'opd:vitals'
  | 'wards:manage'
  | 'ipd:read' | 'ipd:write' | 'ipd:notes'
  | 'emergency:read' | 'emergency:register' | 'emergency:triage'
  | 'lab:read' | 'lab:order' | 'lab:process' | 'lab:manage'
  | 'radiology:read' | 'radiology:order' | 'radiology:process' | 'radiology:manage'
  | 'pharmacy:read' | 'pharmacy:dispense' | 'pharmacy:manage'
  | 'ot:read' | 'ot:schedule' | 'ot:record' | 'ot:manage'
  | 'bloodbank:read' | 'bloodbank:manage' | 'bloodbank:request' | 'bloodbank:issue'
  | 'billing:read' | 'billing:write' | 'billing:manage'
  | 'insurance:read' | 'insurance:write'
  | 'hr:read' | 'hr:write'
  | 'audit:read'
  | 'settings:read' | 'settings:write'
  | 'dashboard:read'

export interface NavItem { label: string; href: string; icon: string; requiredPermission: Permission }
export interface NavGroup { label: string; items: NavItem[] }
