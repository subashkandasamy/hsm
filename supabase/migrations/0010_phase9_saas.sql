-- ============================================================
-- Phase 9: SaaS Multi-Tenancy
-- ============================================================
-- Migration order (live-data-safe, dependency-correct):
--   1. Create tenant + platform_admin tables (RLS enabled, NO policies yet)
--   2. Add tenant_id NULLABLE to all tables
--   3. Insert default tenant + backfill existing rows
--   4. Add NOT NULL + FK constraints
--   5. Add composite indexes
--   6. Create current_tenant_id() SECURITY DEFINER helper
--   7. Create ALL RLS policies (tenants, platform_admins, and every other table)
--   8. Scope counter sequences per tenant
--   9. Fix unique constraints (uhid, bill_no, po_no per tenant)
--  10. Add subscriptions table + its policies
-- ============================================================

-- ── 1. TENANT TABLES (no policies yet) ───────────────────────────────────────

create table if not exists tenants (
  id            uuid primary key,
  name          text not null,
  slug          text unique not null,
  status        text not null default 'trial'
                check (status in ('trial','active','past_due','suspended','cancelled')),
  plan          text not null default 'starter',
  custom_domain text unique,
  trial_ends_at timestamptz,
  created_at    timestamptz default now()
);

create table if not exists platform_admins (
  id         uuid primary key references auth.users(id),
  full_name  text not null,
  created_at timestamptz default now()
);

alter table tenants         enable row level security;
alter table platform_admins enable row level security;

-- ── 2. ADD tenant_id NULLABLE TO ALL TABLES ──────────────────────────────────

-- Phase 0
alter table departments  add column if not exists tenant_id uuid;
alter table profiles     add column if not exists tenant_id uuid;
alter table audit_logs   add column if not exists tenant_id uuid;

-- Phase 1 (counters upgraded in step 8)
alter table patients      add column if not exists tenant_id uuid;
alter table appointments  add column if not exists tenant_id uuid;
alter table visits        add column if not exists tenant_id uuid;
alter table prescriptions add column if not exists tenant_id uuid;

-- Phase 2
alter table wards              add column if not exists tenant_id uuid;
alter table beds               add column if not exists tenant_id uuid;
alter table admissions         add column if not exists tenant_id uuid;
alter table ipd_progress_notes add column if not exists tenant_id uuid;
alter table emergency_cases    add column if not exists tenant_id uuid;

-- Phase 3: Lab
alter table lab_tests_catalog add column if not exists tenant_id uuid;
alter table lab_orders        add column if not exists tenant_id uuid;
alter table lab_order_items   add column if not exists tenant_id uuid;

-- Phase 3: Radiology
alter table radiology_catalog add column if not exists tenant_id uuid;
alter table radiology_orders  add column if not exists tenant_id uuid;

-- Phase 3: Pharmacy
alter table drugs        add column if not exists tenant_id uuid;
alter table drug_batches add column if not exists tenant_id uuid;
alter table dispenses    add column if not exists tenant_id uuid;

-- Phase 4: OT
alter table ot_rooms       add column if not exists tenant_id uuid;
alter table ot_schedules   add column if not exists tenant_id uuid;
alter table ot_consumables add column if not exists tenant_id uuid;

-- Phase 4: Blood Bank
alter table blood_donors   add column if not exists tenant_id uuid;
alter table blood_units    add column if not exists tenant_id uuid;
alter table blood_requests add column if not exists tenant_id uuid;
alter table blood_issues   add column if not exists tenant_id uuid;

-- Phase 5: Billing
alter table tariffs            add column if not exists tenant_id uuid;
alter table bills              add column if not exists tenant_id uuid;
alter table bill_items         add column if not exists tenant_id uuid;
alter table payments           add column if not exists tenant_id uuid;
alter table insurance_policies add column if not exists tenant_id uuid;
alter table insurance_claims   add column if not exists tenant_id uuid;

-- Phase 6: Inventory / HR
alter table suppliers        add column if not exists tenant_id uuid;
alter table inventory_items  add column if not exists tenant_id uuid;
alter table purchase_orders  add column if not exists tenant_id uuid;
alter table po_items         add column if not exists tenant_id uuid;
alter table stock_movements  add column if not exists tenant_id uuid;
alter table staff_profiles   add column if not exists tenant_id uuid;
alter table staff_attendance add column if not exists tenant_id uuid;
alter table duty_roster      add column if not exists tenant_id uuid;

-- Phase 7: Notifications
alter table notification_templates add column if not exists tenant_id uuid;
alter table notifications          add column if not exists tenant_id uuid;

-- Phase 8: EMR
alter table patient_allergies add column if not exists tenant_id uuid;
alter table patient_documents add column if not exists tenant_id uuid;

-- ── 3. INSERT DEFAULT TENANT + BACKFILL ──────────────────────────────────────

insert into tenants (id, name, slug, status, plan, trial_ends_at)
values (
  '00000000-0000-0000-0000-000000000001',
  'Default Hospital',
  'default',
  'active',
  'starter',
  null
)
on conflict (id) do nothing;

update departments          set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update profiles             set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update audit_logs           set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update patients             set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update appointments         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update visits               set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update prescriptions        set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update wards                set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update beds                 set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update admissions           set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update ipd_progress_notes   set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update emergency_cases      set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update lab_tests_catalog    set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update lab_orders           set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update lab_order_items      set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update radiology_catalog    set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update radiology_orders     set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update drugs                set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update drug_batches         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update dispenses            set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update ot_rooms             set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update ot_schedules         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update ot_consumables       set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update blood_donors         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update blood_units          set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update blood_requests       set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update blood_issues         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update tariffs              set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update bills                set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update bill_items           set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update payments             set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update insurance_policies   set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update insurance_claims     set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update suppliers            set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update inventory_items      set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update purchase_orders      set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update po_items             set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update stock_movements      set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update staff_profiles       set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update staff_attendance     set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update duty_roster          set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update notification_templates set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update notifications        set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update patient_allergies    set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update patient_documents    set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

-- ── 4. ADD NOT NULL + FK CONSTRAINTS ─────────────────────────────────────────

alter table departments          alter column tenant_id set not null;
alter table departments          add constraint fk_departments_tenant    foreign key (tenant_id) references tenants(id);
alter table profiles             alter column tenant_id set not null;
alter table profiles             add constraint fk_profiles_tenant       foreign key (tenant_id) references tenants(id);
alter table audit_logs           alter column tenant_id set not null;
alter table audit_logs           add constraint fk_audit_logs_tenant     foreign key (tenant_id) references tenants(id);
alter table patients             alter column tenant_id set not null;
alter table patients             add constraint fk_patients_tenant       foreign key (tenant_id) references tenants(id);
alter table appointments         alter column tenant_id set not null;
alter table appointments         add constraint fk_appointments_tenant   foreign key (tenant_id) references tenants(id);
alter table visits               alter column tenant_id set not null;
alter table visits               add constraint fk_visits_tenant         foreign key (tenant_id) references tenants(id);
alter table prescriptions        alter column tenant_id set not null;
alter table prescriptions        add constraint fk_prescriptions_tenant  foreign key (tenant_id) references tenants(id);
alter table wards                alter column tenant_id set not null;
alter table wards                add constraint fk_wards_tenant          foreign key (tenant_id) references tenants(id);
alter table beds                 alter column tenant_id set not null;
alter table beds                 add constraint fk_beds_tenant           foreign key (tenant_id) references tenants(id);
alter table admissions           alter column tenant_id set not null;
alter table admissions           add constraint fk_admissions_tenant     foreign key (tenant_id) references tenants(id);
alter table ipd_progress_notes   alter column tenant_id set not null;
alter table ipd_progress_notes   add constraint fk_ipd_notes_tenant      foreign key (tenant_id) references tenants(id);
alter table emergency_cases      alter column tenant_id set not null;
alter table emergency_cases      add constraint fk_emergency_tenant      foreign key (tenant_id) references tenants(id);
alter table lab_tests_catalog    alter column tenant_id set not null;
alter table lab_tests_catalog    add constraint fk_lab_catalog_tenant    foreign key (tenant_id) references tenants(id);
alter table lab_orders           alter column tenant_id set not null;
alter table lab_orders           add constraint fk_lab_orders_tenant     foreign key (tenant_id) references tenants(id);
alter table lab_order_items      alter column tenant_id set not null;
alter table lab_order_items      add constraint fk_lab_items_tenant      foreign key (tenant_id) references tenants(id);
alter table radiology_catalog    alter column tenant_id set not null;
alter table radiology_catalog    add constraint fk_rad_catalog_tenant    foreign key (tenant_id) references tenants(id);
alter table radiology_orders     alter column tenant_id set not null;
alter table radiology_orders     add constraint fk_rad_orders_tenant     foreign key (tenant_id) references tenants(id);
alter table drugs                alter column tenant_id set not null;
alter table drugs                add constraint fk_drugs_tenant          foreign key (tenant_id) references tenants(id);
alter table drug_batches         alter column tenant_id set not null;
alter table drug_batches         add constraint fk_drug_batches_tenant   foreign key (tenant_id) references tenants(id);
alter table dispenses            alter column tenant_id set not null;
alter table dispenses            add constraint fk_dispenses_tenant      foreign key (tenant_id) references tenants(id);
alter table ot_rooms             alter column tenant_id set not null;
alter table ot_rooms             add constraint fk_ot_rooms_tenant       foreign key (tenant_id) references tenants(id);
alter table ot_schedules         alter column tenant_id set not null;
alter table ot_schedules         add constraint fk_ot_schedules_tenant   foreign key (tenant_id) references tenants(id);
alter table ot_consumables       alter column tenant_id set not null;
alter table ot_consumables       add constraint fk_ot_consumables_tenant foreign key (tenant_id) references tenants(id);
alter table blood_donors         alter column tenant_id set not null;
alter table blood_donors         add constraint fk_blood_donors_tenant   foreign key (tenant_id) references tenants(id);
alter table blood_units          alter column tenant_id set not null;
alter table blood_units          add constraint fk_blood_units_tenant    foreign key (tenant_id) references tenants(id);
alter table blood_requests       alter column tenant_id set not null;
alter table blood_requests       add constraint fk_blood_requests_tenant foreign key (tenant_id) references tenants(id);
alter table blood_issues         alter column tenant_id set not null;
alter table blood_issues         add constraint fk_blood_issues_tenant   foreign key (tenant_id) references tenants(id);
alter table tariffs              alter column tenant_id set not null;
alter table tariffs              add constraint fk_tariffs_tenant        foreign key (tenant_id) references tenants(id);
alter table bills                alter column tenant_id set not null;
alter table bills                add constraint fk_bills_tenant          foreign key (tenant_id) references tenants(id);
alter table bill_items           alter column tenant_id set not null;
alter table bill_items           add constraint fk_bill_items_tenant     foreign key (tenant_id) references tenants(id);
alter table payments             alter column tenant_id set not null;
alter table payments             add constraint fk_payments_tenant       foreign key (tenant_id) references tenants(id);
alter table insurance_policies   alter column tenant_id set not null;
alter table insurance_policies   add constraint fk_ins_policies_tenant   foreign key (tenant_id) references tenants(id);
alter table insurance_claims     alter column tenant_id set not null;
alter table insurance_claims     add constraint fk_ins_claims_tenant     foreign key (tenant_id) references tenants(id);
alter table suppliers            alter column tenant_id set not null;
alter table suppliers            add constraint fk_suppliers_tenant      foreign key (tenant_id) references tenants(id);
alter table inventory_items      alter column tenant_id set not null;
alter table inventory_items      add constraint fk_inv_items_tenant      foreign key (tenant_id) references tenants(id);
alter table purchase_orders      alter column tenant_id set not null;
alter table purchase_orders      add constraint fk_po_tenant             foreign key (tenant_id) references tenants(id);
alter table po_items             alter column tenant_id set not null;
alter table po_items             add constraint fk_po_items_tenant       foreign key (tenant_id) references tenants(id);
alter table stock_movements      alter column tenant_id set not null;
alter table stock_movements      add constraint fk_stock_mvmt_tenant     foreign key (tenant_id) references tenants(id);
alter table staff_profiles       alter column tenant_id set not null;
alter table staff_profiles       add constraint fk_staff_profiles_tenant foreign key (tenant_id) references tenants(id);
alter table staff_attendance     alter column tenant_id set not null;
alter table staff_attendance     add constraint fk_attendance_tenant     foreign key (tenant_id) references tenants(id);
alter table duty_roster          alter column tenant_id set not null;
alter table duty_roster          add constraint fk_duty_roster_tenant    foreign key (tenant_id) references tenants(id);
alter table notification_templates alter column tenant_id set not null;
alter table notification_templates add constraint fk_notif_tpl_tenant    foreign key (tenant_id) references tenants(id);
alter table notifications        alter column tenant_id set not null;
alter table notifications        add constraint fk_notifications_tenant  foreign key (tenant_id) references tenants(id);
alter table patient_allergies    alter column tenant_id set not null;
alter table patient_allergies    add constraint fk_allergies_tenant      foreign key (tenant_id) references tenants(id);
alter table patient_documents    alter column tenant_id set not null;
alter table patient_documents    add constraint fk_documents_tenant      foreign key (tenant_id) references tenants(id);

-- ── 5. COMPOSITE INDEXES (tenant_id leading) ──────────────────────────────────

create index if not exists idx_departments_tenant         on departments (tenant_id);
create index if not exists idx_profiles_tenant            on profiles (tenant_id);
create index if not exists idx_patients_tenant            on patients (tenant_id);
create index if not exists idx_appointments_tenant_date   on appointments (tenant_id, scheduled_at);
create index if not exists idx_appointments_tenant_status on appointments (tenant_id, status);
create index if not exists idx_visits_tenant_date         on visits (tenant_id, visit_date);
create index if not exists idx_wards_tenant               on wards (tenant_id);
create index if not exists idx_beds_tenant_status         on beds (tenant_id, status);
create index if not exists idx_admissions_tenant_status   on admissions (tenant_id, status);
create index if not exists idx_emergency_tenant_status    on emergency_cases (tenant_id, status);
create index if not exists idx_lab_orders_tenant_status   on lab_orders (tenant_id, status);
create index if not exists idx_rad_orders_tenant_status   on radiology_orders (tenant_id, status);
create index if not exists idx_ot_schedules_tenant_date   on ot_schedules (tenant_id, scheduled_start);
create index if not exists idx_bills_tenant_status        on bills (tenant_id, status);
create index if not exists idx_bills_tenant_date          on bills (tenant_id, created_at);
create index if not exists idx_payments_tenant_date       on payments (tenant_id, received_at);
create index if not exists idx_inv_items_tenant           on inventory_items (tenant_id);
create index if not exists idx_po_tenant_status           on purchase_orders (tenant_id, status);
create index if not exists idx_stock_mvmt_tenant_date     on stock_movements (tenant_id, created_at);
create index if not exists idx_attendance_tenant_date     on staff_attendance (tenant_id, date);
create index if not exists idx_duty_roster_tenant_date    on duty_roster (tenant_id, date);
create index if not exists idx_notifications_tenant_date  on notifications (tenant_id, created_at);
create index if not exists idx_patient_docs_tenant        on patient_documents (tenant_id, patient_id);
create index if not exists idx_patient_allergies_tenant   on patient_allergies (tenant_id, patient_id);

-- ── 6. AUTH.TENANT_ID() HELPER ───────────────────────────────────────────────
-- Security definer bypasses profiles' own RLS; only reads the caller's tenant.
-- All RLS policies below must be defined AFTER this function exists.

create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- ── 7. RLS POLICIES ───────────────────────────────────────────────────────────
-- All columns and current_tenant_id() are now guaranteed to exist.
-- Pattern: tenant_id = current_tenant_id() AND role/activity check.

-- ── tenants ──
create policy "tenants_own_read" on tenants for select
  using (
    id = current_tenant_id()
    or exists (select 1 from platform_admins where id = auth.uid())
  );

create policy "platform_admin_all_tenants" on tenants for all
  using (exists (select 1 from platform_admins where id = auth.uid()))
  with check (exists (select 1 from platform_admins where id = auth.uid()));

-- ── platform_admins ──
create policy "platform_admins_read" on platform_admins for select
  using (exists (select 1 from platform_admins pa where pa.id = auth.uid()));

create policy "platform_admins_write" on platform_admins for insert
  with check (exists (select 1 from platform_admins pa where pa.id = auth.uid()));

-- ── departments ──
drop policy if exists "departments_select_authenticated" on departments;
drop policy if exists "departments_insert_admin"         on departments;
drop policy if exists "departments_update_admin"         on departments;
drop policy if exists "departments_delete_admin"         on departments;

create policy "departments_tenant_read" on departments for select
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "departments_tenant_admin_write" on departments for all
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id = current_tenant_id())
  )
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id = current_tenant_id())
  );

-- ── profiles ──
drop policy if exists "profiles_select_authenticated" on profiles;
drop policy if exists "profiles_insert_admin"         on profiles;
drop policy if exists "profiles_update_admin_or_self" on profiles;
drop policy if exists "profiles_delete_admin"         on profiles;

create policy "profiles_tenant_read" on profiles for select
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "profiles_tenant_self_update" on profiles for update
  using (
    tenant_id = current_tenant_id()
    and (id = auth.uid()
         or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.tenant_id = current_tenant_id()))
  )
  with check (tenant_id = current_tenant_id());

create policy "profiles_tenant_admin_insert" on profiles for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.tenant_id = current_tenant_id())
  );

create policy "profiles_tenant_admin_delete" on profiles for delete
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.tenant_id = current_tenant_id())
  );

-- ── audit_logs ──
drop policy if exists "audit_logs_insert_authenticated" on audit_logs;
drop policy if exists "audit_logs_select_admin"         on audit_logs;

create policy "audit_logs_tenant_insert" on audit_logs for insert
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

create policy "audit_logs_tenant_admin_read" on audit_logs for select
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id = current_tenant_id())
  );

-- ── patients ──
drop policy if exists "patients_read"   on patients;
drop policy if exists "patients_insert" on patients;
drop policy if exists "patients_update" on patients;

create policy "patients_tenant_read" on patients for select
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id()
      and p.role in ('admin','doctor','nurse','receptionist','lab_tech','pharmacist','accountant'))
  );

create policy "patients_tenant_write" on patients for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist'))
  );

create policy "patients_tenant_update" on patients for update
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist'))
  );

-- ── appointments ──
drop policy if exists "appointments_read"   on appointments;
drop policy if exists "appointments_insert" on appointments;
drop policy if exists "appointments_update" on appointments;

create policy "appointments_tenant_read" on appointments for select
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist'))
  );

create policy "appointments_tenant_write" on appointments for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist'))
  );

create policy "appointments_tenant_update" on appointments for update
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist'))
  );

-- ── visits ──
drop policy if exists "visits_read"   on visits;
drop policy if exists "visits_insert" on visits;
drop policy if exists "visits_update" on visits;

create policy "visits_tenant_read" on visits for select
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist'))
  );

create policy "visits_tenant_write" on visits for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse'))
  );

create policy "visits_tenant_update" on visits for update
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse'))
  );

-- ── prescriptions ──
drop policy if exists "prescriptions_read"   on prescriptions;
drop policy if exists "prescriptions_insert" on prescriptions;
drop policy if exists "prescriptions_delete" on prescriptions;

create policy "prescriptions_tenant_read" on prescriptions for select
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor','nurse','receptionist','pharmacist'))
  );

create policy "prescriptions_tenant_write" on prescriptions for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor'))
  );

create policy "prescriptions_tenant_delete" on prescriptions for delete
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_active = true
      and p.tenant_id = current_tenant_id() and p.role in ('admin','doctor'))
  );

-- ── wards / beds ──
drop policy if exists "wards_read"  on wards;
drop policy if exists "wards_write" on wards;
drop policy if exists "beds_read"   on beds;
drop policy if exists "beds_write"  on beds;

create policy "wards_tenant_read"  on wards for select
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "wards_tenant_write" on wards for all
  using (tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id = current_tenant_id()))
  with check (tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id = current_tenant_id()));

create policy "beds_tenant_read"  on beds for select
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "beds_tenant_write" on beds for all
  using (tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin','nurse') and tenant_id = current_tenant_id()))
  with check (tenant_id = current_tenant_id()
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin','nurse') and tenant_id = current_tenant_id()));

-- ── admissions ──
drop policy if exists "admissions_read"   on admissions;
drop policy if exists "admissions_write"  on admissions;
drop policy if exists "admissions_update" on admissions;

create policy "admissions_tenant_all" on admissions for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── ipd_progress_notes ──
drop policy if exists "ipd_notes_read"  on ipd_progress_notes;
drop policy if exists "ipd_notes_write" on ipd_progress_notes;

create policy "ipd_notes_tenant_all" on ipd_progress_notes for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── emergency_cases ──
drop policy if exists "emergency_read"   on emergency_cases;
drop policy if exists "emergency_write"  on emergency_cases;
drop policy if exists "emergency_update" on emergency_cases;

create policy "emergency_tenant_all" on emergency_cases for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── lab tables ──
drop policy if exists "lab_catalog_read"  on lab_tests_catalog;
drop policy if exists "lab_catalog_write" on lab_tests_catalog;
drop policy if exists "lab_orders_read"   on lab_orders;
drop policy if exists "lab_orders_write"  on lab_orders;
drop policy if exists "lab_orders_update" on lab_orders;
drop policy if exists "lab_items_read"    on lab_order_items;
drop policy if exists "lab_items_write"   on lab_order_items;
drop policy if exists "lab_items_update"  on lab_order_items;

create policy "lab_catalog_tenant_all" on lab_tests_catalog for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "lab_orders_tenant_all"  on lab_orders for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "lab_items_tenant_all"   on lab_order_items for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── radiology tables ──
drop policy if exists "rad_catalog_read"  on radiology_catalog;
drop policy if exists "rad_catalog_write" on radiology_catalog;
drop policy if exists "rad_orders_read"   on radiology_orders;
drop policy if exists "rad_orders_write"  on radiology_orders;
drop policy if exists "rad_orders_update" on radiology_orders;

create policy "rad_catalog_tenant_all" on radiology_catalog for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "rad_orders_tenant_all"  on radiology_orders for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── pharmacy tables ──
drop policy if exists "drugs_read"         on drugs;
drop policy if exists "drugs_write"        on drugs;
drop policy if exists "drug_batches_read"  on drug_batches;
drop policy if exists "drug_batches_write" on drug_batches;
drop policy if exists "dispenses_read"     on dispenses;
drop policy if exists "dispenses_write"    on dispenses;

create policy "drugs_tenant_all"        on drugs for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "drug_batches_tenant_all" on drug_batches for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "dispenses_tenant_all"    on dispenses for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── OT tables ──
drop policy if exists "ot_rooms_read"        on ot_rooms;
drop policy if exists "ot_rooms_write"       on ot_rooms;
drop policy if exists "ot_schedules_read"    on ot_schedules;
drop policy if exists "ot_schedules_write"   on ot_schedules;
drop policy if exists "ot_schedules_update"  on ot_schedules;
drop policy if exists "ot_consumables_read"  on ot_consumables;
drop policy if exists "ot_consumables_write" on ot_consumables;

create policy "ot_rooms_tenant_all"       on ot_rooms for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "ot_schedules_tenant_all"   on ot_schedules for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "ot_consumables_tenant_all" on ot_consumables for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── blood bank ──
drop policy if exists "blood_donors_read"     on blood_donors;
drop policy if exists "blood_donors_write"    on blood_donors;
drop policy if exists "blood_units_read"      on blood_units;
drop policy if exists "blood_units_write"     on blood_units;
drop policy if exists "blood_units_update"    on blood_units;
drop policy if exists "blood_requests_read"   on blood_requests;
drop policy if exists "blood_requests_write"  on blood_requests;
drop policy if exists "blood_requests_update" on blood_requests;
drop policy if exists "blood_issues_read"     on blood_issues;
drop policy if exists "blood_issues_write"    on blood_issues;

create policy "blood_donors_tenant_all"   on blood_donors   for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "blood_units_tenant_all"    on blood_units     for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "blood_requests_tenant_all" on blood_requests  for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "blood_issues_tenant_all"   on blood_issues    for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── billing ──
drop policy if exists "tariffs_read"           on tariffs;
drop policy if exists "tariffs_write"          on tariffs;
drop policy if exists "bills_read"             on bills;
drop policy if exists "bills_insert"           on bills;
drop policy if exists "bills_update"           on bills;
drop policy if exists "bill_items_read"        on bill_items;
drop policy if exists "bill_items_write"       on bill_items;
drop policy if exists "payments_read"          on payments;
drop policy if exists "payments_write"         on payments;
drop policy if exists "insurance_policy_read"  on insurance_policies;
drop policy if exists "insurance_policy_write" on insurance_policies;
drop policy if exists "insurance_claim_read"   on insurance_claims;
drop policy if exists "insurance_claim_write"  on insurance_claims;
drop policy if exists "insurance_claim_update" on insurance_claims;

create policy "tariffs_tenant_all"      on tariffs            for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "bills_tenant_all"        on bills              for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "bill_items_tenant_all"   on bill_items         for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "payments_tenant_all"     on payments           for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "ins_policies_tenant_all" on insurance_policies for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "ins_claims_tenant_all"   on insurance_claims   for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── inventory / HR ──
drop policy if exists "suppliers_read"         on suppliers;
drop policy if exists "suppliers_write"        on suppliers;
drop policy if exists "inventory_items_read"   on inventory_items;
drop policy if exists "inventory_items_write"  on inventory_items;
drop policy if exists "purchase_orders_read"   on purchase_orders;
drop policy if exists "purchase_orders_write"  on purchase_orders;
drop policy if exists "purchase_orders_update" on purchase_orders;
drop policy if exists "po_items_read"          on po_items;
drop policy if exists "po_items_write"         on po_items;
drop policy if exists "po_items_update"        on po_items;
drop policy if exists "stock_movements_read"   on stock_movements;
drop policy if exists "stock_movements_write"  on stock_movements;
drop policy if exists "staff_profiles_read"    on staff_profiles;
drop policy if exists "staff_profiles_write"   on staff_profiles;
drop policy if exists "staff_attendance_read"  on staff_attendance;
drop policy if exists "staff_attendance_write" on staff_attendance;
drop policy if exists "duty_roster_read"       on duty_roster;
drop policy if exists "duty_roster_write"      on duty_roster;

create policy "suppliers_tenant_all"      on suppliers        for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "inv_items_tenant_all"      on inventory_items  for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "po_tenant_all"             on purchase_orders  for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "po_items_tenant_all"       on po_items         for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "stock_mvmt_tenant_all"     on stock_movements  for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "staff_profiles_tenant_all" on staff_profiles   for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "attendance_tenant_all"     on staff_attendance for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "duty_roster_tenant_all"    on duty_roster      for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── notifications ──
drop policy if exists "notif_tpl_read"       on notification_templates;
drop policy if exists "notif_tpl_write"      on notification_templates;
drop policy if exists "notifications_read"   on notifications;
drop policy if exists "notifications_write"  on notifications;
drop policy if exists "notifications_update" on notifications;

create policy "notif_tpl_tenant_all"     on notification_templates for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "notifications_tenant_all" on notifications          for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── patient_allergies / patient_documents (Phase 8) ──
drop policy if exists "staff_read_allergies"   on patient_allergies;
drop policy if exists "staff_write_allergies"  on patient_allergies;
drop policy if exists "staff_delete_allergies" on patient_allergies;
drop policy if exists "staff_read_documents"   on patient_documents;
drop policy if exists "staff_write_documents"  on patient_documents;
drop policy if exists "staff_delete_documents" on patient_documents;

create policy "allergies_tenant_all" on patient_allergies for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');
create policy "documents_tenant_all" on patient_documents for all
  using (tenant_id = current_tenant_id() and auth.role() = 'authenticated')
  with check (tenant_id = current_tenant_id() and auth.role() = 'authenticated');

-- ── 8. TENANT-SCOPED COUNTER SEQUENCES ───────────────────────────────────────

-- uhid_counter
alter table uhid_counter drop constraint uhid_counter_pkey;
alter table uhid_counter add column if not exists tenant_id uuid;
update uhid_counter set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table uhid_counter alter column tenant_id set not null;
alter table uhid_counter add primary key (tenant_id, year);

-- appointment_token_counter
alter table appointment_token_counter drop constraint appointment_token_counter_pkey;
alter table appointment_token_counter add column if not exists tenant_id uuid;
update appointment_token_counter set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table appointment_token_counter alter column tenant_id set not null;
alter table appointment_token_counter add primary key (tenant_id, doctor_id, date);

-- bill_no_seq
alter table bill_no_seq drop constraint bill_no_seq_pkey;
alter table bill_no_seq add column if not exists tenant_id uuid;
update bill_no_seq set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table bill_no_seq alter column tenant_id set not null;
alter table bill_no_seq add primary key (tenant_id, year);

-- po_no_seq
alter table po_no_seq drop constraint po_no_seq_pkey;
alter table po_no_seq add column if not exists tenant_id uuid;
update po_no_seq set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table po_no_seq alter column tenant_id set not null;
alter table po_no_seq add primary key (tenant_id, year);

-- Rewrite counter RPC functions with tenant scope
create or replace function get_next_uhid()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from now())::int;
  v_next      int;
begin
  insert into uhid_counter (tenant_id, year, last_val) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_val = uhid_counter.last_val + 1
  returning last_val into v_next;
  return 'UH-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
end;
$$;

create or replace function get_next_appointment_token(p_doctor_id uuid, p_date date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id  uuid := current_tenant_id();
  v_next_token int;
begin
  insert into appointment_token_counter (tenant_id, doctor_id, date, last_token)
  values (v_tenant_id, p_doctor_id, p_date, 1)
  on conflict (tenant_id, doctor_id, date) do update
    set last_token = appointment_token_counter.last_token + 1
  returning last_token into v_next_token;
  return v_next_token;
end;
$$;

create or replace function get_next_bill_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from current_date)::int;
  v_seq       int;
begin
  insert into bill_no_seq (tenant_id, year, last_no) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_no = bill_no_seq.last_no + 1
  returning last_no into v_seq;
  return 'BILL-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

create or replace function get_next_po_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from current_date)::int;
  v_seq       int;
begin
  insert into po_no_seq (tenant_id, year, last_no) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_no = po_no_seq.last_no + 1
  returning last_no into v_seq;
  return 'PO-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

-- ── 9. FIX UNIQUE CONSTRAINTS ─────────────────────────────────────────────────

alter table patients       drop constraint if exists patients_uhid_key;
alter table bills          drop constraint if exists bills_bill_no_key;
alter table purchase_orders drop constraint if exists purchase_orders_po_no_key;

create unique index if not exists patients_tenant_uhid_unique   on patients (tenant_id, uhid);
create unique index if not exists bills_tenant_bill_no_unique   on bills (tenant_id, bill_no);
create unique index if not exists po_tenant_po_no_unique        on purchase_orders (tenant_id, po_no);

-- ── 10. SUBSCRIPTIONS TABLE ───────────────────────────────────────────────────

create table if not exists subscriptions (
  id                     uuid primary key,
  tenant_id              uuid not null references tenants(id) unique,
  stripe_customer_id     text not null,
  stripe_subscription_id text,
  plan                   text not null,
  status                 text not null,
  current_period_end     timestamptz,
  created_at             timestamptz default now()
);

alter table subscriptions enable row level security;

create policy "subscriptions_tenant_read" on subscriptions for select
  using (
    tenant_id = current_tenant_id()
    or exists (select 1 from platform_admins where id = auth.uid())
  );

create policy "subscriptions_service_write" on subscriptions for all
  using (exists (select 1 from platform_admins where id = auth.uid()))
  with check (exists (select 1 from platform_admins where id = auth.uid()));
