-- Tracks the advance obligation created at admission.
-- A row here means "this patient should pay ₹X at the case counter."
-- The actual money (admission_advances pool row) is only written when
-- the cashier marks it collected, not at admission time.
create table if not exists advance_deposit_requests (
  id           uuid primary key,
  tenant_id    uuid not null references tenants(id),
  admission_id uuid not null references admissions(id),
  amount       numeric not null check (amount > 0),
  status       text not null default 'pending'
               check (status in ('pending', 'collected', 'waived')),
  method       text check (method in ('cash', 'card', 'upi', 'bank_transfer')),
  advance_id   uuid references admission_advances(id),
  created_by   uuid references profiles(id),
  collected_by uuid references profiles(id),
  collected_at timestamptz,
  created_at   timestamptz default now()
);

alter table advance_deposit_requests enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'advance_deposit_requests' and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on advance_deposit_requests
      using (tenant_id = current_tenant_id());
  end if;
end $$;
