-- A vaccine can be stocked as several products ───────────────────────────────
-- A clinic usually keeps more than one brand of the same schedule vaccine (e.g.
-- Pentavac SD, painful, and Pentaxim, painless), and the parents choose.
-- vaccine_products becomes one row per linked product; the "government (free)"
-- setting is a property of the vaccine, so it moves to its own table.

CREATE TABLE IF NOT EXISTS vaccine_settings (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vaccine     TEXT NOT NULL,
  free_supply BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, vaccine)
);
ALTER TABLE vaccine_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY vaccine_settings_tenant_all ON vaccine_settings FOR ALL
    USING (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated')
    WITH CHECK (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON vaccine_settings FROM anon;

-- Keep whatever was already set.
INSERT INTO vaccine_settings (tenant_id, vaccine, free_supply, updated_by, updated_at)
SELECT tenant_id, vaccine, free_supply, updated_by, updated_at FROM vaccine_products
ON CONFLICT (tenant_id, vaccine) DO NOTHING;

DO $$ BEGIN
  ALTER TABLE vaccine_products DROP CONSTRAINT vaccine_products_pkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
ALTER TABLE vaccine_products ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
-- Rows that only carried the free-supply flag have no product to keep.
DELETE FROM vaccine_products WHERE drug_master_id IS NULL AND drug_id IS NULL;
DO $$ BEGIN
  ALTER TABLE vaccine_products ADD PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition THEN NULL; END $$;
ALTER TABLE vaccine_products DROP COLUMN IF EXISTS free_supply;
ALTER TABLE vaccine_products ADD CONSTRAINT vaccine_products_has_product
  CHECK (drug_master_id IS NOT NULL OR drug_id IS NOT NULL) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS vaccine_products_unique
  ON vaccine_products (tenant_id, vaccine, COALESCE(drug_master_id, drug_id));
CREATE INDEX IF NOT EXISTS idx_vaccine_products_tenant ON vaccine_products (tenant_id, vaccine);

NOTIFY pgrst, 'reload schema';
