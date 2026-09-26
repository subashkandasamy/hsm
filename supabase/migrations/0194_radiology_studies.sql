-- Radiology, as the machines see it.
--
-- ── Why this is not the lab model with different words ─────────────────────
--
-- An analyzer produces the answer: a number, which is the result. A scanner
-- produces images, and the answer is a radiologist's reading of them. So there
-- is no "auto reporting" here in the sense there is for lab, and this schema
-- does not pretend otherwise: it tracks the images arriving and leaves the
-- report exactly where it is, written and authorised by a person.
--
-- What it does automate is everything around that. The worklist reaches the
-- machine so a technologist stops typing patient names, and the study finds
-- its order by itself when it comes back.
--
-- ── Where the images live ──────────────────────────────────────────────────
--
-- On the hospital's own disk, not here. A CT study is 100 MB to 1 GB and a
-- busy hospital makes several gigabytes a day; holding that centrally costs
-- more per month than the subscription and it compounds for ever. So this
-- table records what exists and where, and the bytes stay where they were
-- made. A cloud copy is a later decision, and a separate one.

-- ── An accession number, which radiology never had ─────────────────────────
--
-- Lab has had one since 0135. Radiology has been running without, which was
-- survivable while a human typed everything but is not now: the accession
-- number is the key DICOM carries. It goes out on the worklist, the machine
-- writes it into every image, and it is what brings the study back to the
-- right order. Prefixed R so it cannot be mistaken for a lab accession at a
-- glance or in a search box.

CREATE TABLE IF NOT EXISTS radiology_accession_seq (
  tenant_id uuid NOT NULL,
  day       date NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);

ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS accession_no text;

CREATE OR REPLACE FUNCTION set_radiology_accession_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date := (COALESCE(NEW.ordered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_seq int;
BEGIN
  IF NEW.accession_no IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO radiology_accession_seq (tenant_id, day, last_no) VALUES (NEW.tenant_id, v_day, 1)
  ON CONFLICT (tenant_id, day) DO UPDATE SET last_no = radiology_accession_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  NEW.accession_no := 'R' || to_char(v_day, 'YYMMDD') || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION set_radiology_accession_no() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_radiology_orders_accession_no ON radiology_orders;
CREATE TRIGGER trg_radiology_orders_accession_no
  BEFORE INSERT ON radiology_orders
  FOR EACH ROW EXECUTE FUNCTION set_radiology_accession_no();

-- Existing orders, numbered by the day they were placed so the sequence stays
-- meaningful rather than everything landing on today.
WITH numbered AS (
  SELECT id, tenant_id,
         (COALESCE(ordered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date AS d,
         row_number() OVER (PARTITION BY tenant_id,
           (COALESCE(ordered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date
           ORDER BY ordered_at, id) AS rn
    FROM radiology_orders WHERE accession_no IS NULL
)
UPDATE radiology_orders o
   SET accession_no = 'R' || to_char(n.d, 'YYMMDD') || lpad(n.rn::text, 4, '0')
  FROM numbered n WHERE n.id = o.id;

INSERT INTO radiology_accession_seq (tenant_id, day, last_no)
SELECT tenant_id, (COALESCE(ordered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date, count(*)
  FROM radiology_orders GROUP BY 1, 2
ON CONFLICT (tenant_id, day) DO UPDATE
  SET last_no = GREATEST(radiology_accession_seq.last_no, EXCLUDED.last_no);

CREATE UNIQUE INDEX IF NOT EXISTS radiology_orders_accession_key
  ON radiology_orders (tenant_id, accession_no) WHERE accession_no IS NOT NULL;

-- ── The machines ───────────────────────────────────────────────────────────
--
-- DICOM is less self-describing than ASTM: a machine is identified by an AE
-- title somebody typed into it, not by a name it announces. So we cannot
-- recognise a model the way the lab connector does — but we can still accept
-- whatever connects and list it as discovered, so the hospital configures
-- nothing on our side.

CREATE TABLE IF NOT EXISTS radiology_modalities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id    uuid REFERENCES connectors(id) ON DELETE SET NULL,
  -- What the machine calls itself when it connects. The only identity DICOM
  -- gives us, and it is whatever the service engineer typed.
  ae_title        text NOT NULL,
  -- CT, MR, CR, DX, US, MG… taken from the images themselves, which is more
  -- reliable than the AE title.
  modality        text,
  manufacturer    text,
  model           text,
  station_name    text,
  -- discovered → seen, not yet trusted.  live → studies attach to orders.
  -- paused → switched off by the hospital.
  status          text NOT NULL DEFAULT 'discovered',
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_study_at   timestamptz,
  CONSTRAINT radiology_modalities_status_check
    CHECK (status = ANY (ARRAY['discovered','live','paused'])),
  CONSTRAINT radiology_modalities_ae_key UNIQUE (tenant_id, ae_title)
);

CREATE INDEX IF NOT EXISTS idx_radiology_modalities_tenant
  ON radiology_modalities (tenant_id, status);

-- ── Studies ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radiology_studies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Null while unmatched. A study whose accession number belongs to no order
  -- waits for a person, exactly as an unmatched lab result does — attaching
  -- images to the nearest plausible patient is not a mistake worth risking.
  radiology_order_id  uuid REFERENCES radiology_orders(id) ON DELETE SET NULL,
  modality_id         uuid REFERENCES radiology_modalities(id) ON DELETE SET NULL,
  -- DICOM's own identifier for the study. Globally unique by construction, and
  -- what makes a re-send idempotent.
  study_instance_uid  text NOT NULL,
  accession_number    text,
  -- What the machine believed. Kept for a person resolving a mismatch, never
  -- matched on.
  patient_name_raw    text,
  patient_id_raw      text,
  modality            text,
  study_description   text,
  study_datetime      timestamptz,
  series_count        int NOT NULL DEFAULT 0,
  instance_count      int NOT NULL DEFAULT 0,
  size_bytes          bigint NOT NULL DEFAULT 0,
  -- Where the connector put it on the hospital's disk. Not a URL: nothing here
  -- is reachable from outside that building.
  storage_path        text,
  status              text NOT NULL DEFAULT 'received',
  error               text,
  received_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT radiology_studies_status_check
    CHECK (status = ANY (ARRAY['received','matched','unmatched','ignored'])),
  CONSTRAINT radiology_studies_uid_key UNIQUE (tenant_id, study_instance_uid)
);

CREATE INDEX IF NOT EXISTS idx_radiology_studies_order
  ON radiology_studies (radiology_order_id);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_open
  ON radiology_studies (tenant_id, status, received_at DESC);

-- Series are worth a row; instances are not. A CT study holds hundreds of
-- images and the database has no use for them individually — the connector
-- serves them from disk by series.
CREATE TABLE IF NOT EXISTS radiology_series (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  study_id            uuid NOT NULL REFERENCES radiology_studies(id) ON DELETE CASCADE,
  series_instance_uid text NOT NULL,
  series_number       int,
  modality            text,
  description         text,
  instance_count      int NOT NULL DEFAULT 0,
  storage_path        text,
  CONSTRAINT radiology_series_uid_key UNIQUE (study_id, series_instance_uid)
);

CREATE INDEX IF NOT EXISTS idx_radiology_series_study ON radiology_series (study_id);

-- ── Row level security ─────────────────────────────────────────────────────

ALTER TABLE radiology_modalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiology_studies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiology_series     ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiology_accession_seq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS radiology_modalities_tenant_all ON radiology_modalities;
CREATE POLICY radiology_modalities_tenant_all ON radiology_modalities FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS radiology_studies_tenant_all ON radiology_studies;
CREATE POLICY radiology_studies_tenant_all ON radiology_studies FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS radiology_series_tenant_all ON radiology_series;
CREATE POLICY radiology_series_tenant_all ON radiology_series FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- The sequence table is written only by the SECURITY DEFINER trigger.
DROP POLICY IF EXISTS radiology_accession_seq_none ON radiology_accession_seq;
CREATE POLICY radiology_accession_seq_none ON radiology_accession_seq FOR SELECT
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');
