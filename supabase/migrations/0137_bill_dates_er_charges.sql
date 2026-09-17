-- Bill dates, ER charges and per-tenant tariffs ────────────────────────────────

-- 1. Every bill gets an IST billing date. Several OPD bill paths never set it,
--    so reports fell back to created_at sliced in UTC (a bill raised before
--    05:30 IST landed on the previous day). Default for any path that omits it,
--    and backfill existing rows from created_at in IST.
ALTER TABLE bills ALTER COLUMN billing_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);
UPDATE bills SET billing_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date WHERE billing_date IS NULL;

-- 2. Emergency charges (registration fee, ER procedures) are billed against the
--    ER case, which may not have a consultation visit yet. The link also lets
--    the charges move onto the IPD bill when the patient is admitted from ER.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS emergency_case_id UUID REFERENCES emergency_cases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bills_emergency_case ON bills (emergency_case_id) WHERE emergency_case_id IS NOT NULL;

-- 3. ER procedure charges are procedure tariffs in their own category.
ALTER TABLE procedure_tariffs DROP CONSTRAINT IF EXISTS procedure_tariffs_category_check;
ALTER TABLE procedure_tariffs ADD CONSTRAINT procedure_tariffs_category_check
  CHECK (category = ANY (ARRAY['general', 'surgery', 'procedure', 'package', 'emergency']));

-- 4. tariffs.key was unique across ALL tenants, so only one hospital could ever
--    set e.g. default_consultation_fee. Keys are per tenant.
ALTER TABLE tariffs DROP CONSTRAINT IF EXISTS tariffs_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS tariffs_tenant_key_key ON tariffs (tenant_id, key);

NOTIFY pgrst, 'reload schema';
