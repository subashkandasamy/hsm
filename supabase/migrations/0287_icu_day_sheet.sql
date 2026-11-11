-- 0287 — The ICU Day sheet: lines & tubes, care bundles, neuro and ventilator detail.
--
-- KMCH's ICU Critical Care Chart (one double-sided sheet per ICU day, 08:00 →
-- 07:00) carries what Uyirly had nowhere to put: every line and tube with the
-- days it has been in (a central line on day 7 is an infection risk the
-- doctor must see), the FAST HUG checklist and the VAP / CRBSI / CAUTI
-- bundles signed per shift (A / B / N), pupils and limb power, and the
-- ventilator's pressures.
--
-- Two small tables for the two new things; everything else is columns on the
-- row a round already writes (icu_observations).

-- ── Lines and tubes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ipd_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id   uuid NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('peripheral_iv', 'central_line', 'arterial_line', 'picc', 'dialysis_catheter',
                                               'urinary_catheter', 'et_tube', 'tracheostomy', 'ryles_tube', 'drain', 'other')),
  site           text,
  size           text,
  inserted_at    timestamptz NOT NULL DEFAULT now(),
  inserted_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at     timestamptz,
  removed_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  removal_reason text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ipd_lines_removed_after_inserted CHECK (removed_at IS NULL OR removed_at >= inserted_at)
);
CREATE INDEX IF NOT EXISTS idx_ipd_lines_admission ON ipd_lines (admission_id, inserted_at);

-- ── Care bundles, signed per shift ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS icu_bundle_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id uuid NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  sheet_day    date NOT NULL,
  shift        text NOT NULL CHECK (shift IN ('morning', 'evening', 'night')),
  bundle       text NOT NULL CHECK (bundle IN ('fast_hug', 'vap', 'crbsi', 'cauti')),
  items        jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT icu_bundle_checks_once UNIQUE (admission_id, sheet_day, shift, bundle)
);

-- Both are clinical records: the clinical roles of this hospital only.
ALTER TABLE ipd_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_bundle_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ipd_lines_clinical ON ipd_lines;
CREATE POLICY ipd_lines_clinical ON ipd_lines FOR ALL TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'doctor', 'nurse'))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'doctor', 'nurse'));
DROP POLICY IF EXISTS icu_bundle_checks_clinical ON icu_bundle_checks;
CREATE POLICY icu_bundle_checks_clinical ON icu_bundle_checks FOR ALL TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'doctor', 'nurse'))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'doctor', 'nurse'));
REVOKE ALL ON ipd_lines FROM anon;
REVOKE ALL ON icu_bundle_checks FROM anon;

-- ── Neuro and ventilator detail on the round ─────────────────────────────────
ALTER TABLE icu_observations
  ADD COLUMN IF NOT EXISTS pupil_l_mm    numeric(3,1),
  ADD COLUMN IF NOT EXISTS pupil_r_mm    numeric(3,1),
  ADD COLUMN IF NOT EXISTS pupil_l_react text,
  ADD COLUMN IF NOT EXISTS pupil_r_react text,
  ADD COLUMN IF NOT EXISTS power_rul     smallint,
  ADD COLUMN IF NOT EXISTS power_lul     smallint,
  ADD COLUMN IF NOT EXISTS power_rll     smallint,
  ADD COLUMN IF NOT EXISTS power_lll     smallint,
  ADD COLUMN IF NOT EXISTS pip           smallint,
  ADD COLUMN IF NOT EXISTS pplat         smallint,
  ADD COLUMN IF NOT EXISTS pressure_support smallint,
  ADD COLUMN IF NOT EXISTS mve           numeric(4,1);

ALTER TABLE icu_observations DROP CONSTRAINT IF EXISTS icu_observations_neuro_vent_check;
ALTER TABLE icu_observations ADD CONSTRAINT icu_observations_neuro_vent_check CHECK (
  (pupil_l_mm IS NULL OR pupil_l_mm BETWEEN 1 AND 9) AND (pupil_r_mm IS NULL OR pupil_r_mm BETWEEN 1 AND 9)
  AND (pupil_l_react IS NULL OR pupil_l_react = ANY (ARRAY['brisk', 'sluggish', 'fixed']))
  AND (pupil_r_react IS NULL OR pupil_r_react = ANY (ARRAY['brisk', 'sluggish', 'fixed']))
  AND (power_rul IS NULL OR power_rul BETWEEN 0 AND 5) AND (power_lul IS NULL OR power_lul BETWEEN 0 AND 5)
  AND (power_rll IS NULL OR power_rll BETWEEN 0 AND 5) AND (power_lll IS NULL OR power_lll BETWEEN 0 AND 5)
  AND (pip IS NULL OR pip BETWEEN 0 AND 80) AND (pplat IS NULL OR pplat BETWEEN 0 AND 80)
  AND (pressure_support IS NULL OR pressure_support BETWEEN 0 AND 50) AND (mve IS NULL OR mve BETWEEN 0 AND 60));

COMMENT ON TABLE ipd_lines IS 'Lines and tubes in place on a stay (KMCH ICU sheet) — the day count from inserted_at is what the doctor watches.';
COMMENT ON TABLE icu_bundle_checks IS 'FAST HUG and the VAP / CRBSI / CAUTI bundles, signed per shift (KMCH A / B / N = morning / evening / night). Items: src/lib/icuBundles.ts.';

NOTIFY pgrst, 'reload schema';
