-- Per-tenant custom daily charge line items for IPD billing
create table if not exists ipd_custom_charges (
  id          uuid         primary key,
  tenant_id   uuid         not null references tenants(id),
  name        text         not null,
  amount      numeric      not null check (amount >= 0),
  is_active   boolean      not null default true,
  created_at  timestamptz  default now()
);

alter table ipd_custom_charges enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ipd_custom_charges' and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on ipd_custom_charges
      using (tenant_id = current_tenant_id());
  end if;
end $$;
