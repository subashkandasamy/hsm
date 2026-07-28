-- get_next_bill_no() derived the tenant from current_tenant_id(), which reads
-- auth.uid() → profiles.tenant_id. In a headless / service-role context (the
-- daily-billing cron) there is no auth.uid(), so current_tenant_id() is NULL and
-- the function hit bill_no_seq's NOT NULL tenant_id constraint — silently failing
-- every cron-generated bill insert (autoIpdBill swallows the null return).
--
-- Add an explicit tenant argument that falls back to current_tenant_id() so the
-- existing no-arg session callers keep working unchanged, while headless callers
-- (autoIpdBill) pass the tenant they already hold.

-- Drop the old zero-arg version first, otherwise a no-arg call would be ambiguous
-- between it and the new default-argument overload.
drop function if exists get_next_bill_no();

create or replace function get_next_bill_no(p_tenant_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, current_tenant_id());
  v_year      int  := extract(year from current_date)::int;
  v_seq       int;
begin
  if v_tenant_id is null then
    raise exception 'get_next_bill_no: tenant_id could not be resolved (no argument and no session tenant)';
  end if;
  insert into bill_no_seq (tenant_id, year, last_no) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_no = bill_no_seq.last_no + 1
  returning last_no into v_seq;
  return 'BILL-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

grant execute on function get_next_bill_no(uuid) to authenticated, service_role;
