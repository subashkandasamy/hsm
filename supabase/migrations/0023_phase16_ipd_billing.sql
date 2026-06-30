-- Phase 16: IPD Admission & Daily Billing
-- Advance pool, configurable daily charges, nursing assignment

-- ── 1. Tenants: advance percentage ───────────────────────────────────────────
alter table tenants
  add column if not exists advance_percentage numeric not null default 50
    check (advance_percentage >= 0 and advance_percentage <= 100);

-- ── 2. Admissions: treatment snapshot ───────────────────────────────────────
alter table admissions
  add column if not exists procedure_tariff_id uuid references procedure_tariffs(id);
alter table admissions
  add column if not exists treatment_value numeric;      -- snapshot of tariff price at admission time

-- ── 3. Staff profiles: nursing charge per shift ─────────────────────────────
alter table staff_profiles
  add column if not exists nursing_charge_per_shift numeric;

-- ── 4. IPD daily-bill composition config (per tenant) ───────────────────────
create table if not exists ipd_billing_config (
  tenant_id              uuid      primary key references tenants(id),
  charge_room_rent       boolean   not null default true,
  charge_doctor_fee      boolean   not null default true,
  charge_nursing         boolean   not null default true,
  charge_medicines       boolean   not null default true,
  charge_admission_fee   boolean   not null default false,
  admission_fee_amount   numeric   not null default 0,
  service_charge_per_day numeric   not null default 0,
  updated_at             timestamptz default now()
);

alter table ipd_billing_config enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ipd_billing_config' and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on ipd_billing_config
      using (tenant_id = current_tenant_id());
  end if;
end $$;

-- ── 5. Admission nurse assignments (patient-specific, billing-driven) ────────
create table if not exists admission_nurse_assignments (
  id               uuid        primary key,
  tenant_id        uuid        not null references tenants(id),
  admission_id     uuid        not null references admissions(id),
  nurse_id         uuid        not null references profiles(id),
  shift            text        not null check (shift in ('morning', 'night')),
  assigned_date    date        not null,
  charge_snapshot  numeric     not null default 0,
  created_at       timestamptz default now(),
  unique (admission_id, shift, assigned_date)
);

alter table admission_nurse_assignments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'admission_nurse_assignments' and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on admission_nurse_assignments
      using (tenant_id = current_tenant_id());
  end if;
end $$;

-- ── 6. Seed default ipd_billing_config for existing tenants ─────────────────
insert into ipd_billing_config (tenant_id)
select id from tenants
on conflict (tenant_id) do nothing;
