-- Per-tenant uniqueness fixes ─────────────────────────────────────────────────
-- lab_tests_catalog.code was unique across ALL tenants. Activating a test from
-- the shared master copies its code, so once one hospital activated e.g. IgA
-- (code IGA) no other hospital could activate or create a test with that code.
ALTER TABLE lab_tests_catalog DROP CONSTRAINT IF EXISTS lab_tests_catalog_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS lab_tests_catalog_tenant_code_key
  ON lab_tests_catalog (tenant_id, code) WHERE code IS NOT NULL;

-- tariffs.id had no default, so inserts without an explicit id failed.
ALTER TABLE tariffs ALTER COLUMN id SET DEFAULT gen_random_uuid();

NOTIFY pgrst, 'reload schema';
