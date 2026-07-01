-- Add doctor-specified duration to IPD medication orders
alter table ipd_medication_orders
  add column if not exists duration_days integer not null default 3;
