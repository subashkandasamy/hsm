-- ============================================================
-- HMS Phase 4: Operation Theatre & Blood Bank
-- ============================================================

-- Required for the OT overlap exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ===== Operation Theatre =====

CREATE TABLE IF NOT EXISTS ot_rooms (
  id        uuid    PRIMARY KEY,
  name      text    NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ot_schedules (
  id               uuid        PRIMARY KEY,
  patient_id       uuid        NOT NULL REFERENCES patients(id),
  surgeon_id       uuid        NOT NULL REFERENCES profiles(id),
  anaesthetist_id  uuid        REFERENCES profiles(id),
  ot_room_id       uuid        NOT NULL REFERENCES ot_rooms(id),
  procedure_name   text        NOT NULL,
  scheduled_start  timestamptz NOT NULL,
  scheduled_end    timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  notes            text,
  price_snapshot   numeric     NOT NULL DEFAULT 0,
  billing_status   text        NOT NULL DEFAULT 'unbilled'
                   CHECK (billing_status IN ('unbilled','billed')),
  created_at       timestamptz DEFAULT now(),
  CHECK (scheduled_end > scheduled_start),
  EXCLUDE USING gist (
    ot_room_id WITH =,
    tstzrange(scheduled_start, scheduled_end) WITH &&
  ) WHERE (status IN ('scheduled','in_progress'))
);
CREATE INDEX IF NOT EXISTS ot_schedules_room_date_idx ON ot_schedules (ot_room_id, scheduled_start);
CREATE INDEX IF NOT EXISTS ot_schedules_patient_idx   ON ot_schedules (patient_id);
CREATE INDEX IF NOT EXISTS ot_schedules_surgeon_idx   ON ot_schedules (surgeon_id);

CREATE TABLE IF NOT EXISTS ot_consumables (
  id              uuid    PRIMARY KEY,
  ot_schedule_id  uuid    NOT NULL REFERENCES ot_schedules(id) ON DELETE CASCADE,
  description     text    NOT NULL,
  qty             int     NOT NULL DEFAULT 1,
  unit_price      numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ot_consumables_schedule_idx ON ot_consumables (ot_schedule_id);

-- ===== Blood Bank =====

CREATE TABLE IF NOT EXISTS blood_donors (
  id                 uuid  PRIMARY KEY,
  name               text  NOT NULL,
  blood_group        text  NOT NULL,
  phone              text,
  last_donation_date date,
  created_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blood_units (
  id           uuid PRIMARY KEY,
  blood_group  text NOT NULL
               CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  component    text NOT NULL
               CHECK (component IN ('whole','prbc','plasma','platelets')),
  donor_id     uuid REFERENCES blood_donors(id),
  collected_at date,
  expiry       date NOT NULL,
  status       text NOT NULL DEFAULT 'available'
               CHECK (status IN ('available','reserved','issued','expired','discarded')),
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blood_units_inventory_idx ON blood_units (blood_group, component, status);
CREATE INDEX IF NOT EXISTS blood_units_expiry_idx    ON blood_units (expiry);

CREATE TABLE IF NOT EXISTS blood_requests (
  id             uuid        PRIMARY KEY,
  patient_id     uuid        NOT NULL REFERENCES patients(id),
  blood_group    text        NOT NULL,
  component      text        NOT NULL,
  units_required int         NOT NULL CHECK (units_required > 0),
  status         text        NOT NULL DEFAULT 'requested'
                 CHECK (status IN ('requested','cross_matched','issued','cancelled')),
  requested_by   uuid        REFERENCES profiles(id),
  notes          text,
  requested_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blood_requests_patient_idx ON blood_requests (patient_id);
CREATE INDEX IF NOT EXISTS blood_requests_status_idx  ON blood_requests (status);

CREATE TABLE IF NOT EXISTS blood_issues (
  id            uuid        PRIMARY KEY,
  request_id    uuid        NOT NULL REFERENCES blood_requests(id),
  blood_unit_id uuid        NOT NULL REFERENCES blood_units(id),
  patient_id    uuid        NOT NULL REFERENCES patients(id),
  price_snapshot numeric     NOT NULL,
  billing_status text        NOT NULL DEFAULT 'unbilled'
                 CHECK (billing_status IN ('unbilled','billed')),
  issued_by      uuid        REFERENCES profiles(id),
  issued_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blood_issues_request_idx  ON blood_issues (request_id);
CREATE INDEX IF NOT EXISTS blood_issues_patient_idx  ON blood_issues (patient_id);

-- ============================================================
-- Concurrency-safe blood unit issue.
-- UPDATE WHERE status='available' acts as test-and-set.
-- ============================================================
CREATE OR REPLACE FUNCTION issue_blood_unit(
  p_issue_id      uuid,
  p_request_id    uuid,
  p_blood_unit_id uuid,
  p_patient_id    uuid,
  p_price_snapshot numeric,
  p_issued_by     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit  blood_units%ROWTYPE;
  v_req   blood_requests%ROWTYPE;
  v_issued_count int;
BEGIN
  -- Lock and claim the unit atomically
  UPDATE blood_units
  SET    status = 'issued'
  WHERE  id = p_blood_unit_id
    AND  status = 'available'
    AND  expiry >= CURRENT_DATE
  RETURNING * INTO v_unit;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit unavailable, already issued, or expired');
  END IF;

  -- Verify blood group + component match the request
  SELECT * INTO v_req FROM blood_requests WHERE id = p_request_id;
  IF v_unit.blood_group <> v_req.blood_group OR v_unit.component <> v_req.component THEN
    -- Roll back the status update
    UPDATE blood_units SET status = 'available' WHERE id = p_blood_unit_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Blood group or component mismatch');
  END IF;

  -- Record the issue
  INSERT INTO blood_issues (id, request_id, blood_unit_id, patient_id, price_snapshot, billing_status, issued_by)
  VALUES (p_issue_id, p_request_id, p_blood_unit_id, p_patient_id, p_price_snapshot, 'unbilled', p_issued_by);

  -- Check if request is fully satisfied
  SELECT COUNT(*) INTO v_issued_count FROM blood_issues WHERE request_id = p_request_id;
  IF v_issued_count >= v_req.units_required THEN
    UPDATE blood_requests SET status = 'issued' WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION issue_blood_unit(uuid,uuid,uuid,uuid,numeric,uuid) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE ot_rooms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_donors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_units    ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_issues   ENABLE ROW LEVEL SECURITY;

-- OT rooms: read by clinical staff; write by admin
CREATE POLICY "ot_rooms_read"  ON ot_rooms FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));
CREATE POLICY "ot_rooms_write" ON ot_rooms FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role = 'admin' AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role = 'admin' AND p.is_active = true));

-- OT schedules: read by clinical; insert by doctor/admin; update by doctor/nurse/admin
CREATE POLICY "ot_schedules_read" ON ot_schedules FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));
CREATE POLICY "ot_schedules_insert" ON ot_schedules FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor') AND p.is_active = true));
CREATE POLICY "ot_schedules_update" ON ot_schedules FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));

-- OT consumables: same as schedules
CREATE POLICY "ot_consumables_read" ON ot_consumables FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));
CREATE POLICY "ot_consumables_write" ON ot_consumables FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));

-- Blood donors: read by clinical; write by lab_tech/admin
CREATE POLICY "blood_donors_read" ON blood_donors FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
CREATE POLICY "blood_donors_write" ON blood_donors FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','lab_tech') AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','lab_tech') AND p.is_active = true));

-- Blood units: read by clinical; write by lab_tech/admin
CREATE POLICY "blood_units_read" ON blood_units FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
CREATE POLICY "blood_units_write" ON blood_units FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','lab_tech') AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','lab_tech') AND p.is_active = true));

-- Blood requests: read by clinical; insert by doctor/nurse; update by lab_tech/admin
CREATE POLICY "blood_requests_read" ON blood_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
CREATE POLICY "blood_requests_insert" ON blood_requests FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse') AND p.is_active = true));
CREATE POLICY "blood_requests_update" ON blood_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','lab_tech') AND p.is_active = true));

-- Blood issues: read by clinical; insert via RPC (SECURITY DEFINER handles auth)
CREATE POLICY "blood_issues_read" ON blood_issues FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
