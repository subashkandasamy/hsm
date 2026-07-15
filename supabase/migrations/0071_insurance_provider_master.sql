-- =====================================================================
-- 0071_insurance_provider_master.sql
-- Global insurance-provider master (shared across tenants, like drug_master)
-- plus per-tenant custom providers. Pre-seed the standard Indian TPA list for
-- every tenant so both fields come pre-populated.
--
-- insurance_providers.tenant_id: NULL = global (platform-managed, seeded here),
-- non-null = a tenant's own custom insurer, visible only to that tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS insurance_providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique names: one namespace for globals, one per tenant (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS ux_insurance_providers_global
  ON insurance_providers (lower(name)) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_insurance_providers_tenant
  ON insurance_providers (tenant_id, lower(name)) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_providers_tenant ON insurance_providers (tenant_id);

ALTER TABLE insurance_providers ENABLE ROW LEVEL SECURITY;

-- Read: everyone sees globals + their own custom rows.
DROP POLICY IF EXISTS insurance_providers_read ON insurance_providers;
CREATE POLICY insurance_providers_read ON insurance_providers
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (tenant_id IS NULL OR tenant_id = current_tenant_id())
  );

-- Write: a tenant may only add/edit/remove its OWN custom rows. Global rows are
-- managed by the platform (service role, which bypasses RLS).
DROP POLICY IF EXISTS insurance_providers_write ON insurance_providers;
CREATE POLICY insurance_providers_write ON insurance_providers
  FOR ALL
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Seed the global insurer list (Indian health insurers + govt schemes).
-- ---------------------------------------------------------------------
INSERT INTO insurance_providers (tenant_id, name)
SELECT NULL, v.name FROM (VALUES
  ('Star Health & Allied Insurance'),
  ('Care Health Insurance'),
  ('Niva Bupa Health Insurance'),
  ('ICICI Lombard General Insurance'),
  ('HDFC ERGO General Insurance'),
  ('Bajaj Allianz General Insurance'),
  ('Tata AIG General Insurance'),
  ('Reliance General Insurance'),
  ('SBI General Insurance'),
  ('Aditya Birla Health Insurance'),
  ('ManipalCigna Health Insurance'),
  ('New India Assurance'),
  ('National Insurance'),
  ('Oriental Insurance'),
  ('United India Insurance'),
  ('Cholamandalam MS General Insurance'),
  ('Future Generali India Insurance'),
  ('IFFCO Tokio General Insurance'),
  ('Universal Sompo General Insurance'),
  ('Kotak Mahindra General Insurance'),
  ('Go Digit General Insurance'),
  ('Acko General Insurance'),
  ('Navi General Insurance'),
  ('Zuno General Insurance'),
  ('Ayushman Bharat (PMJAY)'),
  ('CGHS'),
  ('ECHS'),
  ('ESIC'),
  ('State Government Health Scheme')
) AS v(name)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Pre-seed the standard TPA list for every existing tenant (tenant-scoped).
-- New tenants get the same list seeded during onboarding.
-- ---------------------------------------------------------------------
INSERT INTO insurance_tpas (tenant_id, name)
SELECT t.id, v.name
FROM tenants t
CROSS JOIN (VALUES
  ('Medi Assist'),
  ('Paramount Health Services'),
  ('MDIndia Health Insurance TPA'),
  ('Health India TPA'),
  ('Vidal Health TPA'),
  ('Family Health Plan (FHPL)'),
  ('Heritage Health TPA'),
  ('Raksha Health Insurance TPA'),
  ('Ericson TPA'),
  ('Good Health TPA'),
  ('Vipul MedCorp TPA'),
  ('Safeway TPA'),
  ('East West Assist TPA'),
  ('Park Mediclaim TPA'),
  ('Genins India TPA')
) AS v(name)
ON CONFLICT (tenant_id, name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
