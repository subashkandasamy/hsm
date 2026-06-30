-- ============================================================
-- HMS Phase 15: Point-of-Sale Billing Overhaul
-- ============================================================
-- Bills auto-generate at booking/ordering time.
-- OPD steps (consultation, sample collection, scan) gate on payment.
-- Pharmacy uses a cart-then-fulfill model.
-- IPD uses an advance-ledger + daily-billing model gated only at discharge.
-- ============================================================

-- ---- 1. Extend bills to link to appointments ----
-- No FK here: appointments is a partitioned table whose PK is (id, scheduled_at),
-- so id alone cannot be referenced. Same app-enforced pattern used by visits.appointment_id.
alter table bills add column if not exists appointment_id uuid;
create index if not exists bills_appointment_idx on bills (appointment_id);

-- ---- 2. Add 'advance' as a valid payment method ----
alter table payments drop constraint if exists payments_method_check;
alter table payments add constraint payments_method_check
  check (method in ('cash','card','upi','bank_transfer','insurance','advance'));

-- Update types enum in billing type definition (mirror in types/index.ts)

-- ---- 3. Per-doctor consultation fee override ----
alter table staff_profiles add column if not exists consultation_fee numeric;

-- ---- 4. Pharmacy sale carts ----
-- NOTE: visit_id has no FK — visits is a partitioned table (PK: id, visit_date);
-- referencing only id would fail 42830. App-enforced reference, same pattern as Phase 12.
create table if not exists pharmacy_sales (
  id           uuid        primary key,
  tenant_id    uuid        not null references tenants(id),
  patient_id   uuid        not null references patients(id),
  visit_id     uuid,
  bill_id      uuid        references bills(id),
  status       text        not null default 'draft'
    check (status in ('draft','billed','paid','fulfilled','cancelled')),
  created_by   uuid        references profiles(id),
  created_at   timestamptz default now()
);
create index if not exists pharmacy_sales_patient_idx on pharmacy_sales (patient_id);
create index if not exists pharmacy_sales_visit_idx   on pharmacy_sales (visit_id);
create index if not exists pharmacy_sales_status_idx  on pharmacy_sales (status);

-- ---- 4b. Extend bill_items.source CHECK to include new sources ----
-- Phase 10 created bill_items with: ('consultation','bed','lab','radiology','pharmacy',
--   'ot','ot_consumable','blood','manual').
-- Phase 12 added dental billing but missed extending this constraint.
-- Phase 15 adds pharmacy_sale_item. Both are added here together.
alter table bill_items drop constraint if exists bill_items_source_check;
alter table bill_items add constraint bill_items_source_check
  check (source in (
    'consultation','bed','lab','radiology','pharmacy',
    'ot','ot_consumable','blood','manual',
    'dental','pharmacy_sale_item'
  ));

create table if not exists pharmacy_sale_items (
  id                uuid    primary key,
  tenant_id         uuid    not null references tenants(id),
  pharmacy_sale_id  uuid    not null references pharmacy_sales(id) on delete cascade,
  prescription_id   uuid    references prescriptions(id),
  drug_id           uuid    not null references drugs(id),
  qty               int     not null check (qty > 0),
  unit_price        numeric not null default 0,
  amount            numeric not null default 0
);
create index if not exists pharmacy_sale_items_sale_idx on pharmacy_sale_items (pharmacy_sale_id);

-- ---- 5. Procedure tariffs ----
create table if not exists procedure_tariffs (
  id            uuid        primary key,
  tenant_id     uuid        not null references tenants(id),
  name          text        not null,
  category      text        check (category in ('surgery','procedure','package')),
  default_price numeric     not null default 0,
  is_active     boolean     not null default true,
  created_at    timestamptz default now()
);
create index if not exists procedure_tariffs_tenant_idx on procedure_tariffs (tenant_id);

-- ---- 6. IPD advance ledger ----
create table if not exists admission_advances (
  id           uuid        primary key,
  tenant_id    uuid        not null references tenants(id),
  admission_id uuid        not null references admissions(id),
  amount       numeric     not null check (amount > 0),
  method       text        not null check (method in ('cash','card','upi','bank_transfer')),
  received_by  uuid        references profiles(id),
  received_at  timestamptz default now()
);
create index if not exists admission_advances_admission_idx on admission_advances (admission_id);

create table if not exists admission_advance_refunds (
  id           uuid        primary key,
  tenant_id    uuid        not null references tenants(id),
  admission_id uuid        not null references admissions(id),
  amount       numeric     not null check (amount > 0),
  method       text        not null check (method in ('cash','card','upi','bank_transfer')),
  refunded_by  uuid        references profiles(id),
  refunded_at  timestamptz default now()
);
create index if not exists admission_advance_refunds_admission_idx on admission_advance_refunds (admission_id);

-- ---- 7. RLS on all new tables ----

alter table pharmacy_sales          enable row level security;
alter table pharmacy_sale_items     enable row level security;
alter table procedure_tariffs       enable row level security;
alter table admission_advances      enable row level security;
alter table admission_advance_refunds enable row level security;

-- pharmacy_sales: full access for authenticated users in tenant
create policy "pharmacy_sales_tenant_all" on pharmacy_sales for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "pharmacy_sale_items_tenant_all" on pharmacy_sale_items for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "procedure_tariffs_tenant_all" on procedure_tariffs for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "admission_advances_tenant_all" on admission_advances for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "admission_advance_refunds_tenant_all" on admission_advance_refunds for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ---- 8. pg_cron daily billing job (runs at 00:05 UTC every day) ----
-- Calls the generateDailyAdmissionBills server action indirectly via
-- a Postgres function — placeholder; actual scheduling done via Supabase
-- Dashboard cron or external scheduler calling the Next.js endpoint.
-- No SQL cron definition here as Supabase manages pg_cron separately.
