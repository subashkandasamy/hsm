-- Phase 8: EMR — Structured Allergies + Patient Documents

-- Structured allergy tracking (additive — patients.allergies free-text stays as quick-entry fallback)
create table patient_allergies (
  id uuid primary key,
  patient_id uuid not null references patients(id) on delete cascade,
  allergen text not null,
  reaction text,
  severity text not null default 'moderate'
    check (severity in ('mild', 'moderate', 'severe')),
  recorded_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index on patient_allergies (patient_id);

-- Manually uploaded documents (external reports, referrals, consent forms, ID proofs)
-- Distinct from auto-generated bill/prescription PDFs which stay linked to their own records.
create table patient_documents (
  id uuid primary key,
  patient_id uuid not null references patients(id) on delete cascade,
  title text not null,
  category text not null default 'other'
    check (category in ('external_report', 'referral', 'consent_form', 'identity', 'insurance', 'other')),
  file_path text not null,           -- path within 'documents' storage bucket (patients/{patient_id}/...)
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now()
);
create index on patient_documents (patient_id);

-- RLS
alter table patient_allergies enable row level security;
alter table patient_documents  enable row level security;

-- Authenticated staff can read/write both tables
create policy "staff_read_allergies"   on patient_allergies for select using (auth.role() = 'authenticated');
create policy "staff_write_allergies"  on patient_allergies for insert with check (auth.role() = 'authenticated');
create policy "staff_delete_allergies" on patient_allergies for delete using (auth.role() = 'authenticated');

create policy "staff_read_documents"   on patient_documents for select using (auth.role() = 'authenticated');
create policy "staff_write_documents"  on patient_documents for insert with check (auth.role() = 'authenticated');
create policy "staff_delete_documents" on patient_documents for delete using (auth.role() = 'authenticated');
