-- Link pharmacy dispenses to IPD admissions so they appear in IPD billing
alter table dispenses
  add column if not exists admission_id uuid references admissions(id);

create index if not exists dispenses_admission_idx on dispenses (admission_id);
