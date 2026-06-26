# HMS — Complete Table Analysis
Generated: 2026-06-26

---

## Table of Contents
1. [Platform / SaaS Layer](#1-platform--saas-layer)
2. [Identity & Foundation](#2-identity--foundation)
3. [Counters / Sequence Tables](#3-counters--sequence-tables)
4. [Patient & OPD Flow](#4-patient--opd-flow)
5. [IPD (Inpatient) & Emergency](#5-ipd-inpatient--emergency)
6. [Diagnostics — Lab & Radiology](#6-diagnostics--lab--radiology)
7. [Pharmacy](#7-pharmacy)
8. [Operation Theatre & Blood Bank](#8-operation-theatre--blood-bank)
9. [Billing & Insurance](#9-billing--insurance)
10. [Inventory & Stores](#10-inventory--stores)
11. [Notifications & EMR](#11-notifications--emr)
12. [Materialized Views](#12-materialized-views-dashboard-kpis)
13. [Partitioning — How It Works](#13-partitioning--how-it-works--why-tables-are-empty)
14. [Hot Table Summary](#14-quick-summary--hot-tables)
15. [Full Relationship Map](#15-full-relationship-map)

---

## 1. Platform / SaaS Layer

These 3 tables sit **above all hospitals**. They exist once globally — not per-tenant.

| Table | What it stores | Written by |
|-------|---------------|------------|
| `tenants` | One row per hospital — name, slug, plan (starter/pro), status (trial/active/suspended), trial_ends_at | `onboarding.ts` → `signupHospital()` |
| `platform_admins` | ID of super-admins who can manage all tenants from the platform dashboard | Manually seeded in DB |
| `subscriptions` | Stripe/payment subscription per tenant — plan, status, current_period_start/end | `subscription.ts` |

**Key columns — `tenants`:**
```
id, name, slug, status, plan, trial_ends_at, created_at
```

**Rule:** Every other table in the system has `tenant_id → tenants.id`.
This column is what isolates Hospital A's data from Hospital B's data.

---

## 2. Identity & Foundation

| Table | What it stores | Written by |
|-------|---------------|------------|
| `profiles` | Every staff user — full_name, role, phone, department_id, is_active, tenant_id. Linked 1:1 to Supabase Auth user (same `id`). | `hr.ts` → `createStaff()`, `onboarding.ts` for first admin |
| `staff_profiles` | Extended HR info — designation, joining_date, address, emergency_contact | `hr.ts` → `createStaff()` / `updateStaff()` |
| `departments` | Department list — General Medicine, Surgery, Radiology, etc. Auto-seeded with 12 defaults on signup. | `admin.ts` → `createDepartment()`, auto-seeded in `onboarding.ts` |
| `staff_attendance` | One row per staff per day — present/absent/leave/half_day, shift, check_in/check_out time | `hr.ts` → `markAttendance()` |
| `duty_roster` | One row per staff per day — shift assignment + which ward | `hr.ts` → `setRoster()` |
| `audit_logs` | **Immutable** activity log — every action ever taken. Who did what to which record, with JSON metadata. No UPDATE or DELETE policies exist. | `lib/audit.ts` → `logAudit()` called from every action file |

**Roles in `profiles.role`:**
`admin` | `doctor` | `nurse` | `receptionist` | `lab_tech` | `pharmacist` | `accountant`

**Relationship chain:**
```
tenants ← profiles → departments
         ↓
         staff_profiles  (1:1 extension)
         staff_attendance (1:many)
         duty_roster      (1:many) → wards
```

---

## 3. Counters / Sequence Tables

These tables are **only touched by SECURITY DEFINER PostgreSQL functions**.
RLS blocks all direct INSERT/SELECT from the app. They are purely internal to the DB.

| Table | Purpose | DB Function | Output format |
|-------|---------|-------------|---------------|
| `uhid_counter` | One row per year. Atomically increments to generate unique patient IDs | `get_next_uhid()` | `UH-2026-00001` |
| `appointment_token_counter` | One row per (doctor_id, date). Increments to generate daily token numbers | `get_next_appointment_token(doctor_id, date)` | Integer: 1, 2, 3... |
| `bill_no_seq` | One row per year. Generates sequential bill numbers | `get_next_bill_no()` | `BILL-2026-00001` |
| `po_no_seq` | One row per year. Generates sequential purchase order numbers | `get_next_po_no()` | `PO-2026-00001` |

---

## 4. Patient & OPD Flow

Core patient journey from registration through consultation.

```
PATIENT ARRIVES
      ↓
[patients]        ← receptionist/doctor creates record (UHID auto-generated)
      ↓
[appointments]    ← booked for a doctor on a date (token auto-assigned)
      ↓
[visits]          ← doctor opens a visit (OPD encounter)
      ↓
[prescriptions]   ← doctor prescribes medications (child of visit)
```

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `patients` | uhid, full_name, dob, gender, phone, email, address, blood_group, allergies (free-text), emergency_contact_name/phone, notify_whatsapp_consent | `patients.ts` → `createPatient()`, also `emergency.ts` for walk-ins |
| `appointments` | patient_id, doctor_id, department_id, scheduled_at, token_no, status, reason | `appointments.ts` → `bookAppointment()` |
| `visits` | patient_id, doctor_id, appointment_id, type (opd/emergency), visit_date, vitals (JSON), complaint, diagnosis, icd_code, notes, consultation_fee, billing_status | `opd.ts` → `startVisit()` / `closeVisit()` |
| `prescriptions` | visit_id, drug_name, dosage, frequency, duration, instructions | `opd.ts` → `savePrescriptions()` |

**Appointment status lifecycle:**
```
booked → checked_in → done
              ↘ cancelled
              ↘ no_show
```

**Visit status lifecycle:**
```
open → closed
```

**Billing hook:** When a bill is generated, `visits.billing_status` flips from `unbilled` → `billed`.

---

## 5. IPD (Inpatient) & Emergency

```
PATIENT NEEDS ADMISSION
      ↓
[wards]              ← admin sets up wards (General, ICU, Maternity…)
[beds]               ← admin adds beds to wards (Bed A1, A2…)
      ↓
[admissions]         ← atomic RPC: claim_bed_and_admit()
                        marks bed.status = 'occupied'
                        creates admission row
      ↓
[ipd_progress_notes] ← doctor/nurse adds daily notes + vitals JSON
      ↓
DISCHARGE → bed.status = 'available' again

EMERGENCY ARRIVAL
      ↓
[patients]           ← created if new patient
      ↓
[emergency_cases]    ← triage_level 1-5, arrival_mode, complaint
      ↓
[visits]             ← linked to same patient (type='emergency')
```

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `wards` | name, ward_type, department_id, daily_rate | `wards.ts` → `createWard()` |
| `beds` | ward_id, bed_no, status (available/occupied/maintenance) | `wards.ts` → `addBeds()` |
| `admissions` | patient_id, admitting_doctor_id, ward_id, bed_id, reason, admitted_at, discharged_at, discharge_summary, status, billing_status | RPC `claim_bed_and_admit()` via `ipd.ts` → `admitPatient()` |
| `ipd_progress_notes` | admission_id, author_id, note, vitals (JSON) | `ipd.ts` → `addProgressNote()`, `transferBed()` |
| `emergency_cases` | patient_id, triage_level, arrival_mode, complaint, attended_by, status, arrived_at | `emergency.ts` → `registerEmergency()` |

**Admission status lifecycle:**
```
admitted → discharged
         → transferred
```

**Emergency status lifecycle:**
```
waiting → in_treatment → admitted
                       → discharged
                       → referred
```

**Concurrency safety:** `claim_bed_and_admit()` uses `UPDATE WHERE status='available'` as a test-and-set. Two concurrent admissions to the same bed — only one succeeds.

---

## 6. Diagnostics — Lab & Radiology

```
DOCTOR ORDERS TESTS (during OPD visit)
      ↓
[lab_orders]       ← one order header per patient visit
[lab_order_items]  ← one row per individual test in the order
      ↓
lab_tech enters results into lab_order_items
      ↓
lab_orders.status: ordered → collected → processing → reported
      ↓
billing_status flips to 'billed' when bill is generated
```

Same pattern for radiology.

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `lab_tests_catalog` | name, code, sample_type, unit, ref_low, ref_high, reference_range, price, is_active | `lab.ts` → `createTest()` |
| `lab_orders` | patient_id, visit_id, ordered_by, status, billing_status, ordered_at, reported_at | `lab.ts` → `placeOrder()` |
| `lab_order_items` | lab_order_id, test_id, price_snapshot, result_value, result_text, unit, flag (pending/normal/high/low) | `lab.ts` → `placeOrder()` (items array), `enterResult()` |
| `radiology_catalog` | name, modality, price, is_active | `radiology.ts` → `createCatalogItem()` |
| `radiology_orders` | patient_id, visit_id, test_id, ordered_by, price_snapshot, status, billing_status, report, image_url, ordered_at, reported_at | `radiology.ts` → `placeOrder()` |

**Lab order status lifecycle:**
```
ordered → collected → processing → reported
        ↘ cancelled
```

---

## 7. Pharmacy

```
PHARMACIST RECEIVES STOCK
      ↓
[drugs]        ← drug master catalog (Paracetamol 500mg tablet)
[drug_batches] ← batch with expiry date, qty_available, purchase_price, mrp
      ↓
DOCTOR PRESCRIBES → [prescriptions]
      ↓
PHARMACIST DISPENSES
      ↓
RPC dispense_drug()
  → atomically decrements drug_batches.qty_available
  → checks expiry > today
  → creates [dispenses] row
  → billing_status = 'unbilled'
```

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `drugs` | name, generic_name, form, strength, unit, reorder_level, is_active | `pharmacy.ts` → `addDrug()` |
| `drug_batches` | drug_id, batch_no, expiry (date), qty_available, purchase_price, mrp | `pharmacy.ts` → `addBatch()` |
| `dispenses` | patient_id, prescription_id, drug_id, drug_batch_id, qty, price_snapshot, billing_status, dispensed_by, dispensed_at | RPC `dispense_drug()` via `pharmacy.ts` → `dispenseDrug()` |

**Concurrency safety:** `dispense_drug()` uses `UPDATE WHERE qty_available >= qty AND expiry > today`. Prevents oversell and expired-batch dispense.

**FEFO (First Expiry First Out):** The app queries batches ordered by `expiry ASC` and picks the soonest-expiring non-expired batch.

---

## 8. Operation Theatre & Blood Bank

```
OT FLOW:
[ot_rooms]       ← admin creates rooms (OT-1, OT-2…)
      ↓
[ot_schedules]   ← surgery booked
                   EXCLUDE constraint prevents double-booking same room same time
      ↓
[ot_consumables] ← materials used during surgery recorded
      ↓
billing_status → 'billed' when bill generated

BLOOD BANK FLOW:
[blood_donors]   ← donor registered
      ↓
[blood_units]    ← one row per blood bag (blood_group, component, expiry, status)
      ↓
[blood_requests] ← doctor requests blood for patient
      ↓
RPC issue_blood_unit()
  → atomically sets blood_units.status = 'issued'
  → verifies blood_group + component match request
  → creates [blood_issues] row
  → flips request.status = 'issued' when all units satisfied
```

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `ot_rooms` | name, is_active | `ot.ts` → `createRoom()` |
| `ot_schedules` | patient_id, surgeon_id, anaesthetist_id, ot_room_id, procedure_name, scheduled_start, scheduled_end, status, price_snapshot, billing_status | `ot.ts` → `scheduleSurgery()` |
| `ot_consumables` | ot_schedule_id, description, qty, unit_price | `ot.ts` → `addConsumable()` |
| `blood_donors` | name, blood_group, phone, last_donation_date | `blood.ts` → `registerDonor()` |
| `blood_units` | blood_group, component (whole/prbc/plasma/platelets), donor_id, expiry, status | `blood.ts` → `addUnit()` |
| `blood_requests` | patient_id, blood_group, component, units_required, status (requested→cross_matched→issued), requested_by | `blood.ts` → `requestBlood()` |
| `blood_issues` | request_id, blood_unit_id, patient_id, price_snapshot, billing_status, issued_by, issued_at | RPC `issue_blood_unit()` via `blood.ts` → `issueBlood()` |

**OT overlap exclusion:** PostgreSQL `EXCLUDE USING gist` on `(ot_room_id, tstzrange(start, end))` — no two scheduled/in_progress surgeries can overlap in the same room. Any booking attempt that overlaps returns error code `23P01`.

---

## 9. Billing & Insurance

```
CHARGE SOURCES (all start billing_status = 'unbilled'):
  visits            → consultation_fee
  admissions        → bed charges (daily_rate × days)
  lab_orders        → lab fees
  radiology_orders  → scan fees
  dispenses         → pharmacy charges
  ot_schedules      → surgery charges
  ot_consumables    → material charges
  blood_issues      → blood unit charges
        ↓
ACCOUNTANT generates bill:
[bills]       ← header row (bill_no, subtotal, discount, tax, total, paid, status)
[bill_items]  ← one row per charge (source column identifies origin, ref_id links back)
        ↓
All source rows → billing_status = 'billed'
  (double-bill guard: UPDATE WHERE billing_status='unbilled' — if already billed, 0 rows updated → error)
        ↓
[payments]    ← cash/card/UPI/insurance payment recorded
  bills.paid += payment.amount
  bills.status → partial → paid
        ↓
If insurance:
[insurance_policies] ← patient's active policy
[insurance_claims]   ← claim filed against a bill
                        claim_amount → approved_amount → settled
```

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `tariffs` | key, label, amount (e.g. `default_consultation_fee` = ₹300) | `billing.ts` → `updateTariff()` |
| `bills` | patient_id, visit_id, admission_id, bill_no, subtotal, discount, tax, total, paid, status, created_by | `billing.ts` → `generateBill()` |
| `bill_items` | bill_id, source, ref_id, description, qty, unit_price, amount, tenant_id | `billing.ts` → `generateBill()` |
| `payments` | bill_id, amount, method (cash/card/upi/bank_transfer/insurance), reference, received_by, received_at | `billing.ts` → `recordPayment()` |
| `insurance_policies` | patient_id, provider, policy_no, valid_till, coverage_amount | `insurance.ts` → `addPolicy()` |
| `insurance_claims` | bill_id, policy_id, claim_amount, approved_amount, status, remarks, submitted_at | `insurance.ts` → `fileClaim()` |

**Bill status lifecycle:**
```
draft → unpaid → partial → paid
              ↘ cancelled
```

**Insurance claim status lifecycle:**
```
draft → preauth → submitted → approved → settled
                            → rejected
```

**`bill_items.source` values:**
`consultation` | `bed` | `lab` | `radiology` | `pharmacy` | `ot` | `ot_consumable` | `blood` | `manual`

---

## 10. Inventory & Stores

```
[suppliers]        ← vendor list
      ↓
[purchase_orders]  ← PO raised (PO-2026-00001)
[po_items]         ← line items (item, qty ordered, unit_price, received_qty)
      ↓
Goods received:
  po_items.received_qty updated
  [stock_movements] row (reason=purchase, change=+qty)
  inventory_items.qty_in_stock += qty
      ↓
Item issued to department:
  [stock_movements] row (reason=issue, change=-qty)
  inventory_items.qty_in_stock -= qty
      ↓
Manual correction:
  [stock_movements] row (reason=adjustment)
```

| Table | Key columns | Written by |
|-------|-------------|-----------|
| `suppliers` | name, contact_person, phone, email | `inventory.ts` → `createSupplier()` |
| `inventory_items` | name, category, unit, qty_in_stock, reorder_level, is_active | `inventory.ts` → `createItem()` |
| `purchase_orders` | po_no, supplier_id, status (draft/ordered/received/partially_received/cancelled), total, created_by | `inventory.ts` → `createPurchaseOrder()` |
| `po_items` | po_id, item_id, qty, unit_price, received_qty | `inventory.ts` → `createPurchaseOrder()` |
| `stock_movements` | item_id, change (+/-), reason (purchase/issue/adjustment), ref_id, note, created_by | `inventory.ts` → `receiveGoods()`, `issueItem()`, `adjustStock()` |

---

## 11. Notifications & EMR

| Table | What it stores | Written by |
|-------|---------------|-----------|
| `notification_templates` | WhatsApp/SMS message templates with `{{1}}` `{{2}}` placeholders. 4 default templates: appointment_reminder, bill_ready, prescription_ready, lab_result_ready | Auto-seeded in `onboarding.ts` on signup |
| `notifications` | Log of every message sent — patient, channel, template_key, recipient_phone, ref_type, ref_id, status (queued/sent/delivered/failed), provider_message_id | `notifications.ts` → `sendNotification()` |
| `patient_allergies` | Structured allergy records — allergen, reaction, severity (mild/moderate/severe), recorded_by | `allergies.ts` → `addAllergy()` |
| `patient_documents` | Metadata for uploaded files — title, category, file_path in Supabase Storage bucket `documents`, uploaded_by | `documents.ts` → `saveDocumentRecord()` |

**`patient_documents.category` values:**
`external_report` | `referral` | `consent_form` | `identity` | `insurance` | `other`

**Storage:** Actual files live in Supabase Storage bucket `documents` under path `tenants/{tenantId}/patients/{patientId}/{uuid}.ext`. The `file_path` column stores this path.

---

## 12. Materialized Views (Dashboard KPIs)

Pre-computed read-only snapshots. **Refreshed every 5 minutes** by pg_cron.
Shown as "UNRESTRICTED" in Supabase UI — no RLS needed because they are filtered by `tenant_id` in the SQL query itself (not by policy).
Read via `getReadClient()` (read replica) in `dashboard.ts` → `getAdminDashboard()`.

| View | What it computes | Source tables | Partition key used |
|------|-----------------|---------------|-------------------|
| `mv_daily_revenue_by_tenant` | Revenue per tenant per day | `payments.received_at`, `payments.amount` | `received_at` |
| `mv_bed_occupancy_by_tenant` | Total beds vs occupied beds | `beds`, `admissions` | — |
| `mv_daily_footfall_by_tenant` | OPD visits + emergency arrivals per day | `visits.visit_date`, `emergency_cases.arrived_at` | `visit_date`, `arrived_at` |
| `mv_lowstock_alerts_by_tenant` | Drugs and items below reorder level | `drug_batches`, `drugs`, `inventory_items` | — |
| `mv_pending_bills_by_tenant` | Count and total of unpaid/partial bills | `bills` | — |

**pg_cron schedules:**
- `*/5 * * * *` — refresh all 5 materialized views (CONCURRENTLY)
- `0 9 * * *` — alert if any partition is missing for next month
- `5 0 1 * *` — create next month's partitions on the 1st of each month

---

## 13. Partitioning — How It Works & Why Tables Are Empty

### The 5 partitioned tables (P badge in Supabase)

| Parent table | Partition key | Child naming | Range |
|-------------|---------------|--------------|-------|
| `appointments` | `scheduled_at` (timestamptz) | `appointments_y2026m04` | Apr → Aug 2026 (5 partitions) |
| `visits` | `visit_date` (timestamptz) | `visits_y2026m04` | Apr → Aug 2026 |
| `audit_logs` | `created_at` (timestamptz) | `audit_logs_y2026m04` | Apr → Aug 2026 |
| `bill_items` | `created_at` (timestamptz) | `bill_items_y2026m04` | Apr → Aug 2026 |
| `lab_order_items` | `created_at` (timestamptz) | `lab_order_items_y2026m04` | Apr → Aug 2026 |

### How routing works

The parent table **contains no rows itself**. Every `INSERT` is automatically routed by PostgreSQL:

```sql
-- You write this:
INSERT INTO appointments (id, tenant_id, patient_id, scheduled_at, ...)
VALUES (..., '2026-06-15T10:00:00Z', ...);

-- PostgreSQL silently routes it to:
-- appointments_y2026m06
-- because 2026-06-15 falls in [2026-06-01, 2026-07-01)
```

When you `SELECT * FROM appointments`, PostgreSQL scans all child partitions and returns unified results. The partitioning is completely transparent to the app.

### Why all child tables are empty right now

**No data has been inserted yet.** This is a fresh dev environment with no patients, appointments, or billing activity. The moment you:
- Register a patient and book an appointment → `appointments_y2026m06` gets a row
- Doctor opens a visit → `visits_y2026m06` gets a row
- Any server action fires → `audit_logs_y2026m06` gets a row
- Bill is generated → `bill_items_y2026m06` gets rows
- Lab order is placed → `lab_order_items_y2026m06` gets rows

Since today is June 2026, all new data goes to the `_y2026m06` partitions.

### What "UNRESTRICTED" means

RLS policies are defined only on the **parent table** (e.g. `appointments`).
Child partitions (`appointments_y2026m06`) **inherit** those policies automatically.
Supabase UI shows child partitions as "UNRESTRICTED" because no policies are *directly attached* to the child — **this is correct and expected. It is not a security gap.**

### Auto-partition creation

`create_next_month_partitions()` runs on the **1st of every month at 00:05 UTC**.
On 2026-09-01 it will automatically create `appointments_y2026m09`, `visits_y2026m09`, etc.
**You never need to manually create partitions.**

### Composite PKs on partitioned tables

PostgreSQL requires the partition key to be part of the Primary Key on partitioned tables:
- `appointments` PK: `(id, scheduled_at)`
- `visits` PK: `(id, visit_date)`
- `audit_logs` PK: `(id, created_at)`
- `bill_items` PK: `(id, created_at)`
- `lab_order_items` PK: `(id, created_at)`

This means **foreign keys into these tables from other tables are not possible** (PostgreSQL cannot FK to a non-unique column set on a partitioned table). Cross-table references into partitioned tables are **app-enforced**, not DB-enforced.

---

## 14. Quick Summary — Hot Tables

| Frequency | Tables |
|-----------|--------|
| **Every patient registration** | `patients`, `uhid_counter` |
| **Every appointment** | `appointments` (→ child partition), `appointment_token_counter` |
| **Every clinical visit** | `visits` (→ child partition), `prescriptions` |
| **Every clinical action** | `audit_logs` (→ child partition) — every server action logs here |
| **Every lab order** | `lab_orders`, `lab_order_items` (→ child partition) |
| **Every radiology order** | `radiology_orders` |
| **Every drug dispense** | `dispenses`, `drug_batches` (qty decremented) |
| **Every bill** | `bills`, `bill_items` (→ child partition), source rows flipped to billed |
| **Every payment** | `payments` |
| **Set up once** | `departments`, `wards`, `beds`, `ot_rooms`, `drugs`, `suppliers`, `inventory_items`, `lab_tests_catalog`, `radiology_catalog`, `notification_templates`, `tariffs` |
| **Platform only** | `tenants`, `platform_admins`, `subscriptions` |

---

## 15. Full Relationship Map

```
tenants
  └── profiles (tenant_id)
        └── staff_profiles (profile_id 1:1)
        └── staff_attendance (profile_id)
        └── duty_roster (profile_id → wards)
  └── departments (tenant_id)
  └── patients (tenant_id)
        └── appointments (patient_id) ──→ profiles (doctor_id)
        └── visits (patient_id) ──→ profiles (doctor_id)
              └── prescriptions (visit_id)
        └── admissions (patient_id) ──→ beds ──→ wards
              └── ipd_progress_notes (admission_id)
        └── emergency_cases (patient_id)
        └── lab_orders (patient_id) ──→ visits
              └── lab_order_items (lab_order_id) ──→ lab_tests_catalog
        └── radiology_orders (patient_id) ──→ radiology_catalog
        └── dispenses (patient_id) ──→ drug_batches ──→ drugs
        └── ot_schedules (patient_id) ──→ ot_rooms
              └── ot_consumables (ot_schedule_id)
        └── blood_requests (patient_id)
              └── blood_issues (request_id) ──→ blood_units ──→ blood_donors
        └── bills (patient_id) ──→ visits, admissions
              └── bill_items (bill_id)
              └── payments (bill_id)
              └── insurance_claims (bill_id) ──→ insurance_policies ──→ patients
        └── patient_allergies (patient_id)
        └── patient_documents (patient_id)
        └── notifications (patient_id)
  └── wards (tenant_id)
        └── beds (ward_id)
  └── drugs (tenant_id)
        └── drug_batches (drug_id)
  └── suppliers (tenant_id)
        └── purchase_orders (supplier_id)
              └── po_items (po_id) ──→ inventory_items
  └── inventory_items (tenant_id)
        └── stock_movements (item_id)
  └── audit_logs (tenant_id, actor_id)

MATERIALIZED VIEWS (read-only, no FK):
  mv_daily_revenue_by_tenant       ← payments
  mv_bed_occupancy_by_tenant       ← beds, admissions
  mv_daily_footfall_by_tenant      ← visits, emergency_cases
  mv_lowstock_alerts_by_tenant     ← drug_batches, drugs, inventory_items
  mv_pending_bills_by_tenant       ← bills

PARTITIONED TABLES (P badge):
  appointments    → appointments_y2026m04 … m08  (partition by scheduled_at)
  visits          → visits_y2026m04 … m08        (partition by visit_date)
  audit_logs      → audit_logs_y2026m04 … m08    (partition by created_at)
  bill_items      → bill_items_y2026m04 … m08    (partition by created_at)
  lab_order_items → lab_order_items_y2026m04…m08 (partition by created_at)

SEQUENCE/COUNTER TABLES (DB internal only):
  uhid_counter, appointment_token_counter, bill_no_seq, po_no_seq
```

---

*End of document. Total tables: 48 (including partitions and views).*
*Generated from migrations 0001–0013 and action files in src/app/actions/*
