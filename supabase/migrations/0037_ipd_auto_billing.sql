-- Phase 17: IPD Auto-Billing
-- Adds billing_date + bill_source to bills for daily dedup, nursing source type,
-- and performance indexes for the auto-billing queries.

-- 1. Extend bills table
alter table bills
  add column if not exists billing_date  date,
  add column if not exists bill_source   text
    check (bill_source in ('bed','lab','radiology','ipd_pharmacy','nursing'));

-- 2. Extend bill_items source constraint to include 'nursing'
alter table bill_items drop constraint if exists bill_items_source_check;
alter table bill_items add constraint bill_items_source_check
  check (source in (
    'consultation','bed','lab','radiology','pharmacy','ipd_pharmacy',
    'ot','ot_consumable','blood','manual','dental','pharmacy_sale_item','nursing'
  ));

-- 3. Dedup index: one bill per (tenant, admission, date, source) — excludes cancelled
--    so a cancelled bill can be replaced by a fresh one on the same day.
create unique index if not exists idx_bills_ipd_daily_dedup
  on bills (tenant_id, admission_id, billing_date, bill_source)
  where admission_id is not null
    and billing_date is not null
    and bill_source is not null
    and status != 'cancelled';

-- 4. Performance index for daily charge queries
create index if not exists idx_bills_admission_billing_date
  on bills (tenant_id, admission_id, billing_date)
  where billing_date is not null;

create index if not exists idx_bills_bill_source
  on bills (tenant_id, bill_source, billing_date)
  where bill_source is not null;

-- 5. Nurse assignment billing lookup index
create index if not exists idx_nurse_assignments_admission_date
  on admission_nurse_assignments (tenant_id, admission_id, assigned_date);
