-- IPD Labour & Delivery ────────────────────────────────────────────────────────

-- Partograph readings can belong to an admission without an antenatal record
-- (booked elsewhere / unbooked). Descent is recorded as fifths palpable.
ALTER TABLE partograph_obs ALTER COLUMN anc_id DROP NOT NULL;
ALTER TABLE partograph_obs ADD COLUMN IF NOT EXISTS oxytocin TEXT;
ALTER TABLE partograph_obs ADD COLUMN IF NOT EXISTS urine_protein TEXT;
DO $$ BEGIN
  ALTER TABLE partograph_obs ADD CONSTRAINT partograph_obs_scope_chk CHECK (anc_id IS NOT NULL OR admission_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_partograph_admission ON partograph_obs (admission_id, recorded_at) WHERE admission_id IS NOT NULL;

-- One delivery per admission (twins are babies of the same delivery).
CREATE TABLE IF NOT EXISTS deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id      UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  anc_id            UUID REFERENCES anc_records(id) ON DELETE SET NULL,
  delivered_at      TIMESTAMPTZ NOT NULL,
  gestation_days    INTEGER CHECK (gestation_days BETWEEN 140 AND 320),
  mode              TEXT NOT NULL CHECK (mode IN ('normal_vaginal', 'vacuum', 'forceps', 'vaginal_breech', 'caesarean_elective', 'caesarean_emergency')),
  indication        TEXT,
  anaesthesia       TEXT CHECK (anaesthesia IN ('none', 'local', 'pudendal', 'spinal', 'epidural', 'general')),
  episiotomy        BOOLEAN NOT NULL DEFAULT false,
  perineal_tear     TEXT NOT NULL DEFAULT 'none' CHECK (perineal_tear IN ('none', 'first', 'second', 'third', 'fourth')),
  placenta          TEXT CHECK (placenta IN ('complete', 'incomplete', 'manual_removal')),
  amtsl_oxytocin    BOOLEAN,
  blood_loss_ml     INTEGER CHECK (blood_loss_ml BETWEEN 0 AND 10000),
  conducted_by      TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admission_id)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_patient ON deliveries (patient_id);

CREATE TABLE IF NOT EXISTS delivery_babies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_id          UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  birth_order          INTEGER NOT NULL DEFAULT 1 CHECK (birth_order BETWEEN 1 AND 6),
  born_at              TIMESTAMPTZ NOT NULL,
  sex                  TEXT NOT NULL CHECK (sex IN ('male', 'female', 'indeterminate')),
  outcome              TEXT NOT NULL CHECK (outcome IN ('live_birth', 'fresh_stillbirth', 'macerated_stillbirth')),
  birth_weight_kg      NUMERIC(5,3) CHECK (birth_weight_kg > 0 AND birth_weight_kg < 7),
  length_cm            NUMERIC(4,1),
  head_circ_cm         NUMERIC(4,1),
  apgar_1              INTEGER CHECK (apgar_1 BETWEEN 0 AND 10),
  apgar_5              INTEGER CHECK (apgar_5 BETWEEN 0 AND 10),
  resuscitation        BOOLEAN NOT NULL DEFAULT false,
  breastfed_within_1h  BOOLEAN,
  vitamin_k            BOOLEAN,
  nicu                 BOOLEAN NOT NULL DEFAULT false,
  anomalies            TEXT,
  baby_patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, birth_order)
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_babies_patient_key ON delivery_babies (baby_patient_id) WHERE baby_patient_id IS NOT NULL;

-- Mother's observations after delivery (fourth stage / post-caesarean).
CREATE TABLE IF NOT EXISTS postpartum_obs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bp           TEXT,
  pulse        INTEGER,
  temp         NUMERIC(4,1),
  uterus       TEXT CHECK (uterus IN ('contracted', 'boggy')),
  bleeding     TEXT CHECK (bleeding IN ('normal', 'heavy')),
  bladder      TEXT CHECK (bladder IN ('passed_urine', 'catheter', 'distended')),
  wound        TEXT,
  notes        TEXT,
  recorded_by  UUID REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_postpartum_obs_admission ON postpartum_obs (admission_id, recorded_at);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['deliveries', 'delivery_babies', 'postpartum_obs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL
        USING (tenant_id = current_tenant_id() AND auth.role() = ''authenticated'')
        WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = ''authenticated'')', tbl || '_tenant_all', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    EXECUTE format('REVOKE ALL ON %I FROM anon', tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
