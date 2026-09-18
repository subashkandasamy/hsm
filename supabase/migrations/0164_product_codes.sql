-- Teaching the counter what a scanned pack is ────────────────────────────────
--
-- Only ~300 formulations must carry a QR today (Schedule H2; the June 2026
-- amendment widens it to whole categories only from July 2027), and the plain
-- EAN-13 that is on nearly every pack carries no batch or expiry. So a scanned
-- code means nothing until someone says what it is. The first scan of an unknown
-- code is taught once; every scan after that is instant.
--
-- Kept per hospital on purpose: one shop mis-teaching a code must not reach any
-- other hospital's counter.

CREATE TABLE IF NOT EXISTS product_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  /**
   * The lookup key. For a GS1 code this is the GTIN alone — batch and serial
   * differ on every pack, so keying on the whole scanned string would make each
   * individual pack a new unknown code. Non-GTIN codes are stored as scanned.
   */
  code           TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'gtin' CHECK (kind IN ('gtin', 'raw')),
  drug_master_id UUID REFERENCES drug_master(id),
  drug_id        UUID REFERENCES drugs(id) ON DELETE CASCADE,
  /** The brand on the pack, so the counter shows what the cashier is holding. */
  brand_name     TEXT,
  times_used     INTEGER NOT NULL DEFAULT 0,
  last_used_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_codes_one_drug CHECK (num_nonnulls(drug_master_id, drug_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_codes_tenant_code ON product_codes (tenant_id, code);

ALTER TABLE product_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY product_codes_tenant_all ON product_codes FOR ALL
    USING (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated')
    WITH CHECK (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON product_codes FROM anon;

NOTIFY pgrst, 'reload schema';
