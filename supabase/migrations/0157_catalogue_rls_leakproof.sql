-- Searching the shared catalogues must use their indexes ─────────────────────
--
-- ILIKE is not leakproof, so Postgres may not apply it before a row-security
-- check: on drug_brands (242k rows) the trigram index was skipped and the whole
-- table scanned. Measured: search_drugs_v1('bcg') took 781 ms as a logged-in user
-- and 21 ms without row security.
--
-- These four tables are a shared catalogue — the same rows for every hospital —
-- so the policy only ever asked "are you logged in?". That is now enforced by the
-- grant instead: `anon` loses SELECT, and the policy becomes a plain true, which
-- the planner can see past. Tenant data is untouched.
REVOKE SELECT ON drug_master, drug_brands, icd_codes, immunization_schedule FROM anon;

DROP POLICY IF EXISTS drug_master_read ON drug_master;
CREATE POLICY drug_master_read ON drug_master FOR SELECT USING (true);

DROP POLICY IF EXISTS drug_brands_read ON drug_brands;
CREATE POLICY drug_brands_read ON drug_brands FOR SELECT USING (true);

DROP POLICY IF EXISTS icd_codes_read ON icd_codes;
CREATE POLICY icd_codes_read ON icd_codes FOR SELECT USING (true);

DROP POLICY IF EXISTS immunization_schedule_read ON immunization_schedule;
CREATE POLICY immunization_schedule_read ON immunization_schedule FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
