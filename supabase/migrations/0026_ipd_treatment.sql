-- Phase 17: IPD Treatment / Medication Administration Record (MAR)

-- Doctor's medication orders for admitted patients
create table if not exists ipd_medication_orders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  admission_id    uuid not null references admissions(id),
  ordered_by      uuid not null references profiles(id),
  type            text not null check (type in ('medication','iv_infusion','oxygen')),
  -- medication / injection fields
  drug_name       text,
  dose            numeric,
  dose_unit       text,   -- mg, ml, g, units, mcg
  route           text,   -- iv, im, oral, sc, inhale, topical
  -- iv_infusion fields
  fluid_name      text,
  volume_ml       numeric,
  rate_ml_per_hr  numeric,
  -- oxygen fields
  flow_rate_lpm   numeric,
  delivery_method text,   -- nasal_cannula, simple_mask, venturi_mask, non_rebreather
  -- scheduling
  frequency_type  text not null check (
    frequency_type in ('stat','daily','twice_daily','thrice_daily','every_x_hours','sos','continuous')
  ),
  frequency_hours integer,  -- used when frequency_type = 'every_x_hours'
  start_at        timestamptz not null default now(),
  stop_at         timestamptz,
  status          text not null default 'active' check (status in ('active','stopped')),
  notes           text,
  copied_from_visit_id uuid,
  created_at      timestamptz default now()
);

-- Auto-generated administration schedule slots
create table if not exists ipd_admin_schedule (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  order_id     uuid not null references ipd_medication_orders(id) on delete cascade,
  admission_id uuid not null references admissions(id),
  due_at       timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending','given','missed','held')),
  given_at     timestamptz,
  given_by     uuid references profiles(id),
  given_notes  text,
  created_at   timestamptz default now()
);

-- Pharmacy dispense requests auto-created when a medication order is placed
create table if not exists ipd_pharmacy_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  order_id      uuid not null references ipd_medication_orders(id) on delete cascade,
  admission_id  uuid not null references admissions(id),
  item_name     text not null,
  quantity      numeric not null default 1,
  unit          text,
  status        text not null default 'pending'
                check (status in ('pending','dispensed','cancelled')),
  dispensed_by  uuid references profiles(id),
  dispensed_at  timestamptz,
  notes         text,
  created_at    timestamptz default now()
);

-- RLS
alter table ipd_medication_orders  enable row level security;
alter table ipd_admin_schedule     enable row level security;
alter table ipd_pharmacy_requests  enable row level security;

create policy tenant_isolation on ipd_medication_orders
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ipd_admin_schedule
  using (tenant_id = current_tenant_id());

create policy tenant_isolation on ipd_pharmacy_requests
  using (tenant_id = current_tenant_id());

-- Indexes
create index on ipd_medication_orders(admission_id, status);
create index on ipd_medication_orders(tenant_id, created_at desc);
create index on ipd_admin_schedule(order_id);
create index on ipd_admin_schedule(admission_id, due_at);
create index on ipd_admin_schedule(tenant_id, status, due_at);
create index on ipd_pharmacy_requests(admission_id, status);
create index on ipd_pharmacy_requests(tenant_id, status, created_at desc);
