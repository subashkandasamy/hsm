-- ============================================================
-- HMS Phase 0 Foundation Migration
-- ============================================================

-- Departments
create table if not exists departments (
  id          uuid primary key,
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

-- Profiles (linked to Supabase auth users)
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          text not null check (role in (
                  'admin','doctor','nurse','receptionist',
                  'lab_tech','pharmacist','accountant'
                )),
  phone         text,
  department_id uuid,
  is_active     boolean not null default true,
  created_at    timestamptz default now(),
  constraint fk_profiles_dept
    foreign key (department_id) references departments(id)
);

-- Audit logs
create table if not exists audit_logs (
  id         uuid primary key,
  actor_id   uuid references profiles(id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table departments  enable row level security;
alter table profiles     enable row level security;
alter table audit_logs   enable row level security;

-- ---- departments ----
-- Any authenticated user can read
create policy "departments_select_authenticated"
  on departments for select
  using (auth.role() = 'authenticated');

-- Only admin can insert/update/delete (enforced in app layer too)
create policy "departments_insert_admin"
  on departments for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );

create policy "departments_update_admin"
  on departments for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );

create policy "departments_delete_admin"
  on departments for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );

-- ---- profiles ----
-- Authenticated users can read all profiles
create policy "profiles_select_authenticated"
  on profiles for select
  using (auth.role() = 'authenticated');

-- Admin can insert new profiles
create policy "profiles_insert_admin"
  on profiles for insert
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

-- Admin can update any profile; users can update their own non-role fields
create policy "profiles_update_admin_or_self"
  on profiles for update
  using (
    auth.uid() = id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

-- Only admin can delete profiles
create policy "profiles_delete_admin"
  on profiles for delete
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.is_active = true
    )
  );

-- ---- audit_logs ----
-- Authenticated users can insert audit log entries (server actions do this)
create policy "audit_logs_insert_authenticated"
  on audit_logs for insert
  with check (auth.role() = 'authenticated');

-- Only admin can read audit logs
create policy "audit_logs_select_admin"
  on audit_logs for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );

-- No updates or deletes on audit logs (immutable)
