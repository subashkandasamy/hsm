-- ===== Phase 7: Notifications & Audit =====

-- Consent columns on patients
alter table patients add column if not exists notify_whatsapp_consent boolean not null default false;
alter table patients add column if not exists notify_sms_consent       boolean not null default false;

-- Notification templates (seeded below)
create table if not exists notification_templates (
  id                    uuid primary key,
  key                   text unique not null,
  channel               text not null check (channel in ('whatsapp','sms')),
  provider_template_name text,
  body_preview          text,
  is_active             boolean not null default true
);

-- Notifications log
create table if not exists notifications (
  id                  uuid primary key,
  patient_id          uuid references patients(id),
  channel             text not null check (channel in ('whatsapp','sms')),
  template_key        text references notification_templates(key),
  recipient_phone     text not null,
  ref_type            text not null,
  ref_id              uuid,
  status              text not null default 'queued'
    check (status in ('queued','sent','delivered','failed')),
  provider_message_id text,
  error               text,
  sent_by             uuid references profiles(id),
  created_at          timestamptz default now()
);
create index if not exists notifications_patient_created on notifications (patient_id, created_at);
create index if not exists notifications_status on notifications (status);

-- Storage bucket for generated documents (bills, prescriptions)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- RLS: notification_templates
alter table notification_templates enable row level security;
create policy "templates_read_all"  on notification_templates for select using (auth.role() = 'authenticated');
create policy "templates_admin"     on notification_templates for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- RLS: notifications
alter table notifications enable row level security;
create policy "notifications_read"  on notifications for select using (auth.role() = 'authenticated');
create policy "notifications_insert" on notifications for insert
  with check (sent_by = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "notifications_update" on notifications for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Seed notification templates
-- NOTE: provider_template_name must be filled in once each template is approved by the BSP/Meta
insert into notification_templates (id, key, channel, provider_template_name, body_preview) values
  (gen_random_uuid(), 'appointment_reminder',  'whatsapp', null,
   'Hello {{1}}, your appointment is scheduled for {{2}} at {{3}}. Please arrive 10 minutes early. — Uyirly'),
  (gen_random_uuid(), 'bill_ready',            'whatsapp', null,
   'Dear {{1}}, your bill #{{2}} for ₹{{3}} is ready. View/download: {{4}} — Uyirly'),
  (gen_random_uuid(), 'prescription_ready',    'whatsapp', null,
   'Dear {{1}}, your prescription from {{2}} is ready. Download: {{3}} — Uyirly'),
  (gen_random_uuid(), 'lab_result_ready',      'whatsapp', null,
   'Dear {{1}}, your lab results for {{2}} are now available. Please visit the reception. — Uyirly')
on conflict (key) do nothing;
