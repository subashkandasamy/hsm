-- Migration 0029: Drop orphaned pre-multitenancy RLS policies
--
-- Migration 0010 (phase9_saas) added correct tenant-scoped policies but failed to
-- drop the old phase5 policies because the DROP statements used different policy names.
-- PostgreSQL ORs multiple permissive policies, so the old USING(true) / role-only
-- policies allowed any authenticated user to read data across all tenants.
--
-- Affected tables:
--   bills           → "bills_write"       (FOR ALL, role-only USING, no tenant check)
--   insurance_policies → "ins_policies_read" (USING true), "ins_policies_write"
--   insurance_claims   → "ins_claims_read"  (USING true), "ins_claims_write"
--   bill_no_seq     → "bill_no_seq_all"   (USING true) — seq only, low risk but clean up
--
-- The correct tenant-scoped replacements already exist from migration 0010:
--   bills_tenant_all, ins_policies_tenant_all, ins_claims_tenant_all
-- so simply dropping the orphaned policies is sufficient.

drop policy if exists "bills_write"         on bills;
drop policy if exists "ins_policies_read"   on insurance_policies;
drop policy if exists "ins_policies_write"  on insurance_policies;
drop policy if exists "ins_claims_read"     on insurance_claims;
drop policy if exists "ins_claims_write"    on insurance_claims;
drop policy if exists "bill_no_seq_all"     on bill_no_seq;
