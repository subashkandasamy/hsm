-- Link lab and radiology orders to IPD admissions
alter table lab_orders
  add column if not exists admission_id uuid references admissions(id);

alter table radiology_orders
  add column if not exists admission_id uuid references admissions(id);

create index if not exists lab_orders_admission_idx       on lab_orders (admission_id);
create index if not exists radiology_orders_admission_idx on radiology_orders (admission_id);
