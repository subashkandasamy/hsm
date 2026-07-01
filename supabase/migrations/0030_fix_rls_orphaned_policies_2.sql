-- Migration 0030: Drop all remaining orphaned pre-multitenancy RLS policies
--
-- Full audit of pg_policies revealed many old phase-1–8 policies still active
-- alongside the correct tenant-scoped replacements added in migration 0010.
-- PostgreSQL ORs permissive policies, so the old ones bypass tenant isolation.
--
-- Each dropped policy has a verified tenant-scoped replacement already in place.

-- ── profiles ─────────────────────────────────────────────────────────────────
-- OLD: any authenticated user can SELECT all profiles (cross-tenant doctor list)
drop policy if exists "profiles_select_authenticated"  on profiles;
-- OLD: admin from any tenant can insert/update/delete any profile
drop policy if exists "profiles_insert_admin"          on profiles;
drop policy if exists "profiles_update_admin_or_self"  on profiles;
drop policy if exists "profiles_delete_admin"          on profiles;

-- ── departments ───────────────────────────────────────────────────────────────
-- OLD: any authenticated user can SELECT all departments across tenants
drop policy if exists "departments_select_authenticated" on departments;
drop policy if exists "departments_insert_admin"         on departments;
drop policy if exists "departments_update_admin"         on departments;
drop policy if exists "departments_delete_admin"         on departments;

-- ── notification_templates ────────────────────────────────────────────────────
drop policy if exists "templates_read_all"  on notification_templates;
drop policy if exists "templates_admin"     on notification_templates;

-- ── drug_batches ──────────────────────────────────────────────────────────────
-- OLD: any authenticated user can read all drug batches across tenants
drop policy if exists "batches_read"  on drug_batches;
drop policy if exists "batches_write" on drug_batches;

-- ── audit_logs ────────────────────────────────────────────────────────────────
drop policy if exists "audit_logs_select_admin"         on audit_logs;
drop policy if exists "audit_logs_insert_authenticated" on audit_logs;

-- ── beds ──────────────────────────────────────────────────────────────────────
drop policy if exists "beds_update_admin" on beds;
drop policy if exists "beds_write_admin"  on beds;

-- ── duty_roster ───────────────────────────────────────────────────────────────
drop policy if exists "roster_read"  on duty_roster;
drop policy if exists "roster_write" on duty_roster;

-- ── inventory_items ───────────────────────────────────────────────────────────
drop policy if exists "inv_items_read"  on inventory_items;
drop policy if exists "inv_items_write" on inventory_items;

-- ── purchase_orders ───────────────────────────────────────────────────────────
drop policy if exists "po_read"  on purchase_orders;
drop policy if exists "po_write" on purchase_orders;

-- ── staff_attendance ──────────────────────────────────────────────────────────
drop policy if exists "attendance_read"  on staff_attendance;
drop policy if exists "attendance_write" on staff_attendance;

-- ── no-qual INSERT policies (allow inserting with any tenant_id) ───────────────
-- All tables below have a FOR ALL tenant-scoped policy with proper WITH CHECK.
drop policy if exists "admissions_insert"    on admissions;
drop policy if exists "blood_requests_insert" on blood_requests;
drop policy if exists "dispenses_insert"     on dispenses;
drop policy if exists "emergency_insert"     on emergency_cases;
drop policy if exists "ipd_notes_insert"     on ipd_progress_notes;
drop policy if exists "lab_orders_insert"    on lab_orders;
drop policy if exists "notifications_insert" on notifications;
drop policy if exists "ot_schedules_insert"  on ot_schedules;
drop policy if exists "rad_orders_insert"    on radiology_orders;
