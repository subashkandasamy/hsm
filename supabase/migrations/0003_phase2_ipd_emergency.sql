-- ============================================================
-- HMS Phase 2: IPD & Emergency
-- ============================================================

CREATE TABLE IF NOT EXISTS wards (
  id            uuid        PRIMARY KEY,
  name          text        NOT NULL,
  ward_type     text,
  department_id uuid        REFERENCES departments(id),
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beds (
  id         uuid  PRIMARY KEY,
  ward_id    uuid  NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  bed_no     text  NOT NULL,
  status     text  NOT NULL DEFAULT 'available'
             CHECK (status IN ('available','occupied','maintenance')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (ward_id, bed_no)
);
CREATE INDEX IF NOT EXISTS beds_ward_status_idx ON beds (ward_id, status);

CREATE TABLE IF NOT EXISTS admissions (
  id                  uuid        PRIMARY KEY,
  patient_id          uuid        NOT NULL REFERENCES patients(id),
  admitting_doctor_id uuid        NOT NULL REFERENCES profiles(id),
  ward_id             uuid        NOT NULL REFERENCES wards(id),
  bed_id              uuid        NOT NULL REFERENCES beds(id),
  reason              text,
  admitted_at         timestamptz DEFAULT now(),
  discharged_at       timestamptz,
  status              text        NOT NULL DEFAULT 'admitted'
                      CHECK (status IN ('admitted','discharged','transferred')),
  discharge_summary   text
);
CREATE INDEX IF NOT EXISTS admissions_status_idx  ON admissions (status);
CREATE INDEX IF NOT EXISTS admissions_patient_idx ON admissions (patient_id);
CREATE INDEX IF NOT EXISTS admissions_bed_idx     ON admissions (bed_id);

CREATE TABLE IF NOT EXISTS ipd_progress_notes (
  id           uuid        PRIMARY KEY,
  admission_id uuid        NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  author_id    uuid        REFERENCES profiles(id),
  note         text        NOT NULL,
  vitals       jsonb,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ipd_notes_admission_idx ON ipd_progress_notes (admission_id);

CREATE TABLE IF NOT EXISTS emergency_cases (
  id           uuid        PRIMARY KEY,
  patient_id   uuid        NOT NULL REFERENCES patients(id),
  triage_level int         NOT NULL CHECK (triage_level BETWEEN 1 AND 5),
  arrival_mode text,
  complaint    text,
  attended_by  uuid        REFERENCES profiles(id),
  status       text        NOT NULL DEFAULT 'waiting'
               CHECK (status IN ('waiting','in_treatment','admitted','discharged','referred')),
  outcome      text,
  arrived_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emergency_triage_idx ON emergency_cases (status, triage_level, arrived_at);

-- ============================================================
-- Concurrency-safe atomic functions
-- ============================================================

-- Claim bed and create admission in one atomic operation.
-- UPDATE WHERE status='available' acts as a test-and-set under READ COMMITTED;
-- a concurrent claim will find status='occupied' and return ok=false.
CREATE OR REPLACE FUNCTION claim_bed_and_admit(
  p_admission_id uuid,
  p_patient_id   uuid,
  p_doctor_id    uuid,
  p_bed_id       uuid,
  p_reason       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ward_id uuid;
BEGIN
  UPDATE beds SET status = 'occupied'
  WHERE id = p_bed_id AND status = 'available'
  RETURNING ward_id INTO v_ward_id;

  IF v_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bed is no longer available');
  END IF;

  INSERT INTO admissions (id, patient_id, admitting_doctor_id, ward_id, bed_id, reason, status)
  VALUES (p_admission_id, p_patient_id, p_doctor_id, v_ward_id, p_bed_id, p_reason, 'admitted');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Atomic bed transfer: claim new bed, free old bed, update admission.
CREATE OR REPLACE FUNCTION transfer_bed(
  p_admission_id uuid,
  p_old_bed_id   uuid,
  p_new_bed_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_ward_id uuid;
BEGIN
  UPDATE beds SET status = 'occupied'
  WHERE id = p_new_bed_id AND status = 'available'
  RETURNING ward_id INTO v_new_ward_id;

  IF v_new_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target bed is no longer available');
  END IF;

  UPDATE beds SET status = 'available' WHERE id = p_old_bed_id;

  UPDATE admissions
  SET bed_id = p_new_bed_id, ward_id = v_new_ward_id
  WHERE id = p_admission_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_bed_and_admit(uuid, uuid, uuid, uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_bed(uuid, uuid, uuid)                        TO authenticated;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE wards                ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipd_progress_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_cases      ENABLE ROW LEVEL SECURITY;

-- Helper inline: clinical staff check
-- Wards + Beds: all authenticated clinical staff read; admin write
CREATE POLICY "wards_read" ON wards FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true));

CREATE POLICY "wards_write" ON wards FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

CREATE POLICY "beds_read" ON beds FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true));

CREATE POLICY "beds_write_admin" ON beds FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

CREATE POLICY "beds_update_admin" ON beds FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin') AND p.is_active = true));

-- Admissions: clinical read; doctor/admin write (functions bypass via SECURITY DEFINER)
CREATE POLICY "admissions_read" ON admissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor','nurse','receptionist') AND p.is_active = true));

CREATE POLICY "admissions_insert" ON admissions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor') AND p.is_active = true));

CREATE POLICY "admissions_update" ON admissions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor') AND p.is_active = true));

-- IPD progress notes: doctor/nurse read+write
CREATE POLICY "ipd_notes_read" ON ipd_progress_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));

CREATE POLICY "ipd_notes_insert" ON ipd_progress_notes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));

-- Emergency cases: broad read; receptionist/nurse/doctor write
CREATE POLICY "emergency_read" ON emergency_cases FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor','nurse','receptionist') AND p.is_active = true));

CREATE POLICY "emergency_insert" ON emergency_cases FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor','nurse','receptionist') AND p.is_active = true));

CREATE POLICY "emergency_update" ON emergency_cases FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','doctor','nurse','receptionist') AND p.is_active = true));
