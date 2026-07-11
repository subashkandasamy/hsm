// ---- Tenant Profile (hospital branding for billing documents) ----

export interface TenantProfile {
  tenant_id: string
  name: string
  tagline: string | null
  tagline2: string | null
  logo_url: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  pincode: string | null
  phone1: string | null
  phone2: string | null
  email: string | null
  website: string | null
  cin_no: string | null
  gst_no: string | null
  emergency_contact: string | null
  updated_at: string
}

// ---- Phase 9: SaaS / Multi-Tenancy ----

export type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
export type TenantPlan = 'starter' | 'growth' | 'enterprise'

export interface Tenant {
  id: string; name: string; slug: string
  status: TenantStatus; plan: TenantPlan
  custom_domain: string | null; trial_ends_at: string | null; created_at: string
}

export interface TenantWithStats extends Tenant {
  user_count: number; patient_count: number; last_activity: string | null
}

export interface PlatformAdmin {
  id: string; full_name: string; created_at: string
}

export interface Subscription {
  id: string; tenant_id: string
  stripe_customer_id: string; stripe_subscription_id: string | null
  plan: string; status: string; current_period_end: string | null; created_at: string
}

export interface TenantContext {
  id: string; name: string; slug: string; status: TenantStatus; plan: TenantPlan
}

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
  phone_verified: boolean
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
  notify_whatsapp_consent: boolean; notify_sms_consent: boolean
  aadhaar_no?: string | null
  combined_bill_no?: string | null
  wristband_printed_at?: string | null
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

export type VisitBillingStatus = 'unbilled' | 'billed' | 'waived'

export interface Visit {
  id: string; patient_id: string; doctor_id: string; appointment_id: string | null
  type: string; visit_date: string; vitals: Vitals | null; complaint: string | null
  diagnosis: string | null; icd_code: string | null; notes: string | null
  status: VisitStatus; consultation_fee: number; billing_status: VisitBillingStatus
  clinical_data: Record<string, unknown> | null
  combined_bill_no?: string | null
  created_at: string
  doctor?: Pick<Profile, 'id' | 'full_name'>
  prescriptions?: Prescription[]
}

// ---- Phase 2 ----

export type BedStatus = 'available' | 'occupied' | 'maintenance'
export interface WardRoomType { id: string; name: string; daily_rate: number; is_multi_bed: boolean; is_active: boolean; created_at: string }
export interface Ward {
  id: string; name: string; ward_type: string | null;
  room_type_id: string | null; floor: string | null; block: string | null;
  department_id: string | null; is_temp: boolean; daily_rate: number; created_at: string
}
export interface Bed { id: string; ward_id: string; bed_no: string; status: BedStatus; created_at: string }
export interface BedWithOccupant extends Bed { admission_id: string | null; patient_name: string | null; patient_uhid: string | null }
export interface WardWithBeds extends Ward {
  beds: BedWithOccupant[]
  room_type_data?: Pick<WardRoomType, 'id' | 'name' | 'daily_rate' | 'is_multi_bed'> | null
}

export type AdmissionStatus = 'admitted' | 'discharged' | 'transferred'
export interface Admission {
  id: string; patient_id: string; admitting_doctor_id: string
  ward_id: string | null; bed_id: string | null
  direct_ot: boolean
  reason: string | null; admitted_at: string; discharged_at: string | null
  status: AdmissionStatus; discharge_summary: string | null
  procedure_tariff_id?: string | null; treatment_value?: number | null
  combined_bill_no?: string | null
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone' | 'blood_group' | 'allergies'>
  doctor?: Pick<Profile, 'id' | 'full_name'>
  ward?: Pick<Ward, 'id' | 'name'> | null
  bed?: Pick<Bed, 'id' | 'bed_no'> | null
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

export interface LabTestMaster {
  id: string; name: string; code: string | null; category: string
  sample_type: string | null; unit: string | null
  ref_low: number | null; ref_high: number | null
  reference_range: string | null; is_active: boolean
}

export interface LabTestCatalog {
  id: string; name: string; code: string | null; category: string
  sample_type: string | null; unit: string | null
  ref_low: number | null; ref_high: number | null
  reference_range: string | null; price: number; is_active: boolean
  lab_master_id?: string | null
}

export type LabFlag = 'pending' | 'normal' | 'high' | 'low'
export type LabOrderStatus = 'ordered' | 'collected' | 'processing' | 'reported' | 'cancelled'

export interface LabOrderItem {
  id: string; lab_order_id: string; test_id: string; price_snapshot: number
  result_value: number | null; result_text: string | null; unit: string | null; flag: LabFlag
  test?: Pick<LabTestCatalog, 'id' | 'name' | 'code' | 'unit' | 'ref_low' | 'ref_high' | 'reference_range' | 'sample_type'>
}

export type BillingStatus = 'unbilled' | 'billed'

export type OrderPriority = 'stat' | 'routine'

export interface LabOrder {
  id: string; patient_id: string; visit_id: string | null; admission_id: string | null
  ordered_by: string | null
  status: LabOrderStatus; billing_status: BillingStatus
  priority: OrderPriority; scheduled_for: string | null
  ordered_at: string; reported_at: string | null
  sample_label_printed_at?: string | null
  items?: LabOrderItem[]
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  orderer?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 3: Radiology ----

export interface RadiologyMaster {
  id: string; name: string; modality: string; body_part: string; is_active: boolean; created_at: string
}

export interface RadiologyCatalog {
  id: string; name: string; modality: string | null; body_part: string; price: number; is_active: boolean
  radiology_master_id?: string | null
}

export type RadiologyOrderStatus = 'ordered' | 'performed' | 'reported' | 'cancelled'

export interface RadiologyOrder {
  id: string; patient_id: string; visit_id: string | null; admission_id: string | null
  test_id: string; ordered_by: string | null; price_snapshot: number
  status: RadiologyOrderStatus; billing_status: BillingStatus
  priority: OrderPriority; scheduled_for: string | null
  report: string | null; image_url: string | null
  ordered_at: string; reported_at: string | null
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  test?: Pick<RadiologyCatalog, 'id' | 'name' | 'modality'>
  orderer?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 3: Pharmacy ----

// Global drug master — Uyirly-curated, no tenant_id
export interface DrugMaster {
  id: string; name: string; generic_name: string | null; category: string | null
  form: string | null; strength: string | null; unit: string | null; is_active: boolean
  schedule: string | null           // OTC | H | H1 | X | G
  atc_code: string | null           // WHO ATC code e.g. J01CA04
  pharmacological_class: string | null
}

// Global brand catalog — linked to drug_master
export interface DrugBrand {
  id: string; drug_master_id: string; brand_name: string; manufacturer: string
  hsn_code: string; gst_rate: number; pack_size: number; pack_unit: string
  mrp_per_pack: number | null; is_active: boolean
}

// Drug used in UI — unifies DrugMaster + tenant custom drugs
// is_global=true → from drug_master table; false → from drugs table (tenant custom)
export interface Drug {
  id: string; name: string; generic_name: string | null; form: string | null
  strength: string | null; unit: string | null; reorder_level?: number; is_active: boolean
  is_global?: boolean
  brand_aliases?: string[]  // brand names only, for autocomplete search
  brand_data?: Array<{
    brand_name: string
    manufacturer: string | null
    hsn_code: string | null
    gst_rate: number | null
    pack_size: number | null
    pack_unit: string | null
  }>
}

export interface DrugBatch {
  id: string; batch_no: string; expiry: string
  qty_available: number; purchase_price: number | null; mrp: number
  reorder_level?: number
  storage_location?: string | null
  drug_id?: string | null; drug_master_id?: string | null
  // Brand / GRN fields (added in migration 0044)
  drug_brand_id?: string | null
  brand_name?: string | null
  manufacturer?: string | null
  pack_size?: number | null
  pack_unit?: string | null
  mfg_date?: string | null
  hsn_code?: string | null
  gst_rate?: number | null
  supplier_name?: string | null
  supplier_invoice_no?: string | null
  purchase_date?: string | null
  drug?: Pick<Drug, 'id' | 'name' | 'form' | 'strength' | 'unit'>
}

export interface DrugWithStock extends Drug {
  total_qty: number
  batches: DrugBatch[]
}

export interface Dispense {
  id: string; patient_id: string; prescription_id: string | null
  drug_id?: string | null; drug_master_id?: string | null
  drug_batch_id: string; qty: number; price_snapshot: number
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

export interface OtRoom {
  id: string
  name: string
  ot_type: string | null
  floor: string | null
  block: string | null
  notes: string | null
  status: 'active' | 'maintenance' | 'inactive'
  is_active: boolean
}
export type OtStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface OtConsumable {
  id: string; ot_schedule_id: string; description: string; qty: number; unit_price: number
  drug_master_id?: string | null; drug_id?: string | null; pharmacy_request_id?: string | null
}

export type OtTeamRole = 'surgeon' | 'assistant' | 'anaesthetist' | 'scrub_nurse' | 'other'

export interface OtTeamMember {
  id: string
  ot_schedule_id: string
  profile_id: string
  role: OtTeamRole
  created_at: string
  profile?: Pick<Profile, 'id' | 'full_name'>
}

export interface OtSchedule {
  id: string; patient_id: string; surgeon_id: string; anaesthetist_id: string | null
  ot_room_id: string; procedure_name: string; scheduled_start: string; scheduled_end: string
  status: OtStatus; notes: string | null; price_snapshot: number; billing_status: BillingStatus
  admission_id?: string | null
  created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  surgeon?: Pick<Profile, 'id' | 'full_name'>
  anaesthetist?: Pick<Profile, 'id' | 'full_name'> | null
  room?: OtRoom
  admission?: Pick<Admission, 'id' | 'ward_id' | 'bed_id' | 'direct_ot'> & {
    ward?: Pick<Ward, 'id' | 'name' | 'is_temp'> | null
    bed?: Pick<Bed, 'id' | 'bed_no'> | null
  } | null
  consumables?: OtConsumable[]
  team_members?: OtTeamMember[]
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
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'insurance' | 'advance'
export type BillItemSource = 'consultation' | 'bed' | 'lab' | 'radiology' | 'pharmacy' | 'ipd_pharmacy' | 'pharmacy_sale_item' | 'ot' | 'ot_consumable' | 'blood' | 'dental' | 'manual' | 'nursing' | 'nursing_morning' | 'nursing_night'

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
  id: string; patient_id: string; visit_id: string | null; admission_id: string | null; appointment_id: string | null
  bill_no: string; subtotal: number; discount: number; tax: number; total: number; paid: number
  status: BillStatus; created_by: string | null; created_at: string
  billing_date?: string | null
  bill_source?: 'bed' | 'lab' | 'radiology' | 'ipd_pharmacy' | 'nursing' | 'nursing_morning' | 'nursing_night' | 'consolidated' | 'advance_refund' | 'appointment_refund' | 'ot' | null
  consolidated_by?: string | null
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>
  items?: BillItem[]
  payments?: Payment[]
}

export interface ChargePreviewLine {
  source: BillItemSource; ref_id: string; description: string; qty: number; unit_price: number; amount: number
}

export interface CombinedBillSection {
  label: string
  rows: Array<{ date: string; billNo: string; description: string; qty: number; unitPrice: number; amount: number }>
  subtotal: number
}

export interface AdvanceReceiptData {
  tenantName: string
  patient: { full_name: string; uhid: string; phone: string | null }
  admission: {
    id: string
    admitted_at: string
    ward: string | null
    bed: string | null
    combined_bill_no: string | null
  }
  payments: Array<{
    id: string
    received_at: string
    amount: number
    method: string
    receiverName: string | null
  }>
  totalCollected: number
}

export interface CombinedBillData {
  combinedBillNo: string
  tenantName: string
  patient: { full_name: string; uhid: string; phone: string | null }
  generatedAt: string
  sections: CombinedBillSection[]
  grandTotal: number
  totalPaid: number
  advanceCollected: number
  advanceRefunded: number
  balanceDue: number
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

// ---- Phase 6: Inventory ----

export interface Supplier {
  id: string; name: string; contact_person: string | null; phone: string | null
  email: string | null; created_at: string
}

export interface InventoryItem {
  id: string; name: string; category: string | null; unit: string | null
  qty_in_stock: number; reorder_level: number; is_active: boolean; created_at: string
}

export type POStatus = 'draft' | 'ordered' | 'received' | 'partially_received' | 'cancelled'

export interface PoItem {
  id: string; po_id: string; item_id: string; qty: number
  unit_price: number; received_qty: number
  item?: Pick<InventoryItem, 'id' | 'name' | 'unit'>
}

export interface PurchaseOrder {
  id: string; po_no: string; supplier_id: string | null; status: POStatus
  total: number; created_by: string | null; created_at: string; received_at: string | null
  supplier?: Pick<Supplier, 'id' | 'name'>
  items?: PoItem[]
}

export type MovementReason = 'purchase' | 'issue' | 'adjustment'

export interface StockMovement {
  id: string; item_id: string; change: number; reason: MovementReason
  ref_id: string | null; note: string | null; created_by: string | null; created_at: string
  item?: Pick<InventoryItem, 'id' | 'name' | 'unit'>
  creator?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 6: HR ----

export interface StaffProfileRecord {
  profile_id: string; designation: string | null; joining_date: string | null
  address: string | null; emergency_contact: string | null; consultation_fee: number | null
  nursing_charge_per_shift?: number | null
}

export interface StaffMember extends Profile {
  staff?: StaffProfileRecord | null
}

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'half_day'
export type Shift = 'morning' | 'evening' | 'night'

export interface StaffAttendance {
  id: string; profile_id: string; date: string; status: AttendanceStatus
  shift: Shift | null; check_in: string | null; check_out: string | null
  profile?: Pick<Profile, 'id' | 'full_name' | 'role'>
}

export interface DutyRoster {
  id: string; profile_id: string; date: string; shift: Shift | null; ward_id: string | null
  profile?: Pick<Profile, 'id' | 'full_name' | 'role'>
  ward?: Pick<Ward, 'id' | 'name'>
}

// ---- Phase 8: EMR ----

export type AllergySeverity = 'mild' | 'moderate' | 'severe'

export interface PatientAllergy {
  id: string; patient_id: string; allergen: string; reaction: string | null
  severity: AllergySeverity; recorded_by: string | null; created_at: string
  recorder?: Pick<Profile, 'id' | 'full_name'> | null
}

export type DocumentCategory = 'external_report' | 'referral' | 'consent_form' | 'identity' | 'insurance' | 'other'

export interface PatientDocument {
  id: string; patient_id: string; title: string; category: DocumentCategory
  file_path: string; uploaded_by: string | null; uploaded_at: string
  uploader?: Pick<Profile, 'id' | 'full_name'> | null
}

export type TimelineEventType =
  | 'opd_visit' | 'emergency_visit' | 'admission'
  | 'lab_order' | 'radiology_order'
  | 'ot_schedule' | 'blood_issue' | 'document'
  | 'pharmacy_dispense'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: string
  title: string
  summary: string | null
  refTable: string
  refId: string
  meta?: Record<string, unknown>
}

export interface DiagnosisSummary {
  diagnosis: string
  icd_code: string | null
  last_seen: string
}

// ---- Phase 7: Notifications ----

export type NotificationChannel  = 'whatsapp' | 'sms'
export type NotificationStatus   = 'queued' | 'sent' | 'delivered' | 'failed'
export type NotificationRefType  = 'bill' | 'prescription' | 'appointment' | 'lab_order' | 'radiology_order'

export interface NotificationTemplate {
  id: string; key: string; channel: NotificationChannel
  provider_template_name: string | null; body_preview: string | null; is_active: boolean
}

export interface Notification {
  id: string; patient_id: string | null; channel: NotificationChannel
  template_key: string | null; recipient_phone: string; ref_type: NotificationRefType
  ref_id: string | null; status: NotificationStatus; provider_message_id: string | null
  error: string | null; sent_by: string | null; created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  sender?: Pick<Profile, 'id' | 'full_name'>
}

// ---- Phase 7: Dashboard KPIs ----

export interface AdminKPIs {
  todayRevenue: number; bedOccupancy: number; totalBeds: number; occupiedBeds: number
  todayFootfall: number; pendingBillsCount: number; pendingBillsTotal: number
  lowStockCount: number
}

export interface DoctorKPIs {
  todayTotal: number; todayCompleted: number; todayPending: number
}

export interface ReceptionistKPIs {
  todayAppointments: number; todayCheckedIn: number; todayRegistrations: number
}

export interface PharmacistKPIs {
  pendingPrescriptions: number; lowStockCount: number; nearExpiryCount: number
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
  | 'billing:read' | 'billing:write' | 'billing:manage' | 'billing:advance'
  | 'insurance:read' | 'insurance:write'
  | 'inventory:read' | 'inventory:manage'
  | 'hr:read' | 'hr:manage' | 'hr:attendance'
  | 'notifications:send' | 'notifications:manage'
  | 'emr:read' | 'emr:allergy:write' | 'emr:document:upload' | 'emr:document:delete'
  | 'audit:read'
  | 'account:subscription'
  | 'settings:read' | 'settings:write'
  | 'dashboard:read'
  | 'departments:manage'
  | 'settings:modules'
  | 'dental:read' | 'dental:write'
  | 'ophthalmology:write'
  | 'tariffs:manage' | 'pharmacy:sale'
  | 'ipd:config' | 'ipd:nursing'
  | 'barcode:print:patient' | 'barcode:print:sample'

export interface NavItem { label: string; href: string; icon: string; requiredPermission: Permission; moduleKey?: string }
export interface NavGroup { label: string; items: NavItem[] }

// ---- Phase 12: Specialty Clinical Templates ----

export type ClinicalTemplate = 'general' | 'dental' | 'ophthalmology'

export type ToothStatus = 'healthy' | 'decayed' | 'filled' | 'crowned' | 'root_canal' | 'missing' | 'extracted' | 'implant'
export type DentalProcedure = 'filling' | 'extraction' | 'root_canal' | 'crown' | 'cleaning' | 'implant' | 'other'
export type DentalRecallStatus = 'pending' | 'notified' | 'completed' | 'cancelled'

export interface DentalTooth {
  tooth_number: number
  current_status: ToothStatus
}

export interface DentalTreatment {
  id: string
  visit_id: string
  patient_id: string
  tooth_number: number | null
  procedure: string
  notes: string | null
  price_snapshot: number
  billing_status: 'unbilled' | 'billed'
  created_at: string
}

export interface DentalRecall {
  id: string
  patient_id: string
  recall_date: string
  reason: string | null
  status: DentalRecallStatus
  created_at: string
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>
}

export interface EyeExamData {
  visualAcuity: { od: string; os: string }
  iop: { od: number | null; os: number | null }
  refraction: {
    od: { sphere: number | null; cylinder: number | null; axis: number | null }
    os: { sphere: number | null; cylinder: number | null; axis: number | null }
  }
  notes: string
}

export interface DepartmentWithTemplate {
  id: string
  name: string
  description: string | null
  clinical_template: ClinicalTemplate
  created_at: string
}

// ---- Phase 15: POS Billing ----

export interface ProcedureTariff {
  id: string
  tenant_id: string
  name: string
  category: 'surgery' | 'procedure' | 'package' | 'general' | null
  default_price: number
  is_active: boolean
  created_at: string
}

export type PharmacySaleStatus = 'draft' | 'billed' | 'paid' | 'fulfilled' | 'cancelled'

export interface PharmacySaleItem {
  id: string
  pharmacy_sale_id: string
  prescription_id: string | null
  drug_id: string | null
  drug_master_id: string | null
  qty: number
  unit_price: number
  amount: number
  drug?: Pick<Drug, 'id' | 'name' | 'form' | 'strength' | 'unit'> | null
  master?: Pick<Drug, 'id' | 'name' | 'form' | 'strength' | 'unit'> | null
}

export interface PharmacySale {
  id: string
  patient_id: string
  visit_id: string | null
  bill_id: string | null
  status: PharmacySaleStatus
  created_by: string | null
  created_at: string
  items?: PharmacySaleItem[]
  patient?: Pick<Patient, 'id' | 'full_name' | 'uhid'>
  bill?: { id: string; bill_no: string; status: string; total: number; paid: number } | null
}

export interface AdmissionAdvance {
  id: string
  admission_id: string
  amount: number
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
  received_by: string | null
  received_at: string
  receiver?: Pick<Profile, 'id' | 'full_name'>
}

export interface AdmissionAdvanceRefund {
  id: string
  admission_id: string
  amount: number
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
  refunded_by: string | null
  refunded_at: string
}

export interface AdmissionFinancials {
  totalAdvance: number
  totalBilled: number
  totalPaid: number
  balanceDue: number
  unusedAdvance: number
}

export interface IpdBillingConfig {
  tenant_id: string
  charge_room_rent: boolean
  charge_doctor_fee: boolean
  charge_nursing: boolean
  charge_medicines: boolean
  charge_admission_fee: boolean
  admission_fee_amount: number
  service_charge_per_day: number
  updated_at: string
}

export interface IpdCustomCharge {
  id: string
  tenant_id: string
  name: string
  amount: number
  is_active: boolean
  created_at: string
}

export interface AdmissionNurseAssignment {
  id: string
  tenant_id: string
  admission_id: string
  nurse_id: string
  shift: 'morning' | 'night'
  assigned_date: string
  charge_snapshot: number
  created_at: string
  nurse?: Pick<Profile, 'id' | 'full_name'>
}

export type MedicationOrderType = 'medication' | 'iv_infusion' | 'oxygen'
export type FrequencyType = 'stat' | 'daily' | 'twice_daily' | 'thrice_daily' | 'every_x_hours' | 'sos' | 'continuous'
export type AdminStatus = 'pending' | 'given' | 'missed' | 'held'

export interface IpdMedicationOrder {
  id: string
  tenant_id: string
  admission_id: string
  ordered_by: string
  type: MedicationOrderType
  drug_name: string | null
  drug_master_id: string | null
  drug_id: string | null
  dose: number | null
  dose_unit: string | null
  route: string | null
  fluid_name: string | null
  volume_ml: number | null
  rate_ml_per_hr: number | null
  flow_rate_lpm: number | null
  delivery_method: string | null
  frequency_type: FrequencyType
  frequency_hours: number | null
  duration_days: number
  start_at: string
  stop_at: string | null
  status: 'active' | 'stopped'
  notes: string | null
  copied_from_visit_id: string | null
  created_at: string
  doctor?: { full_name: string }
  pharmacy?: Array<{ status: 'pending' | 'dispensed' | 'cancelled' }>
}

export interface IpdAdminSchedule {
  id: string
  tenant_id: string
  order_id: string
  admission_id: string
  due_at: string
  status: AdminStatus
  given_at: string | null
  given_by: string | null
  given_notes: string | null
  created_at: string
  order?: Pick<IpdMedicationOrder, 'type' | 'drug_name' | 'fluid_name' | 'dose' | 'dose_unit' | 'route' | 'flow_rate_lpm' | 'delivery_method'>
  nurse?: { full_name: string }
}

export interface IpdPharmacyRequest {
  id: string
  tenant_id: string
  order_id: string
  admission_id: string
  item_name: string
  quantity: number
  unit: string | null
  drug_master_id: string | null
  drug_id: string | null
  status: 'pending' | 'dispensed' | 'cancelled'
  dispensed_by: string | null
  dispensed_at: string | null
  notes: string | null
  price_snapshot: number
  billing_status: 'pending' | 'unbilled' | 'billed'
  created_at: string
  admission?: { admitted_at?: string | null; patient?: Pick<Patient, 'full_name' | 'uhid'>; ward?: { name: string }; bed?: { bed_no: string } }
}

export interface AdvanceDepositRequest {
  id: string
  tenant_id: string
  admission_id: string
  patient_id: string
  amount: number
  status: 'pending' | 'collected' | 'waived'
  method: 'cash' | 'card' | 'upi' | 'bank_transfer' | null
  advance_id: string | null
  created_by: string | null
  collected_by: string | null
  collected_at: string | null
  created_at: string
  // joined
  patient?: Pick<Patient, 'full_name' | 'uhid'>
  admission?: { admitted_at: string; ward?: { name: string }; bed?: { bed_no: string } }
}
