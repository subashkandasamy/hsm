-- ============================================================
-- HMS Phase 1: Outpatient Clinical Core
-- ============================================================

-- UHID year-keyed counter
CREATE TABLE IF NOT EXISTS uhid_counter (
  year    int PRIMARY KEY,
  last_val int NOT NULL DEFAULT 0
);

-- Appointment token counter (per doctor per day)
CREATE TABLE IF NOT EXISTS appointment_token_counter (
  doctor_id uuid NOT NULL,
  date      date NOT NULL,
  last_token int  NOT NULL DEFAULT 0,
  PRIMARY KEY (doctor_id, date)
);

-- ---- Race-safe functions (SECURITY DEFINER so they bypass RLS on counters) ----

CREATE OR REPLACE FUNCTION get_next_uhid()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  curr_year int := extract(year FROM now())::int;
  next_val  int;
BEGIN
  INSERT INTO uhid_counter (year, last_val) VALUES (curr_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_val = uhid_counter.last_val + 1
  RETURNING last_val INTO next_val;

  RETURN 'UH-' || curr_year::text || '-' || lpad(next_val::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION get_next_appointment_token(p_doctor_id uuid, p_date date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_token int;
BEGIN
  INSERT INTO appointment_token_counter (doctor_id, date, last_token)
  VALUES (p_doctor_id, p_date, 1)
  ON CONFLICT (doctor_id, date) DO UPDATE
    SET last_token = appointment_token_counter.last_token + 1
  RETURNING last_token INTO next_token;

  RETURN next_token;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_uhid()                                  TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_appointment_token(uuid, date)           TO authenticated;

-- ---- Clinical tables ----

CREATE TABLE IF NOT EXISTS patients (
  id                      uuid        PRIMARY KEY,
  uhid                    text        UNIQUE NOT NULL,
  full_name               text        NOT NULL,
  dob                     date,
  gender                  text        CHECK (gender IN ('male','female','other')),
  phone                   text        NOT NULL,
  email                   text,
  address                 text,
  blood_group             text,
  allergies               text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  created_by              uuid        REFERENCES profiles(id),
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patients_phone_idx     ON patients (phone);
CREATE INDEX IF NOT EXISTS patients_name_idx      ON patients (full_name);
CREATE INDEX IF NOT EXISTS patients_uhid_idx      ON patients (uhid);

CREATE TABLE IF NOT EXISTS appointments (
  id            uuid        PRIMARY KEY,
  patient_id    uuid        NOT NULL REFERENCES patients(id),
  doctor_id     uuid        NOT NULL REFERENCES profiles(id),
  department_id uuid        REFERENCES departments(id),
  scheduled_at  timestamptz NOT NULL,
  token_no      int,
  status        text        NOT NULL DEFAULT 'booked'
                            CHECK (status IN ('booked','checked_in','done','cancelled','no_show')),
  reason        text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_doc_date_idx ON appointments (doctor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS appointments_patient_idx  ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS appointments_status_idx   ON appointments (status);

CREATE TABLE IF NOT EXISTS visits (
  id             uuid        PRIMARY KEY,
  patient_id     uuid        NOT NULL REFERENCES patients(id),
  doctor_id      uuid        NOT NULL REFERENCES profiles(id),
  appointment_id uuid        REFERENCES appointments(id),
  type           text        NOT NULL DEFAULT 'opd',
  visit_date     timestamptz DEFAULT now(),
  vitals         jsonb,
  complaint      text,
  diagnosis      text,
  icd_code       text,
  notes          text,
  status         text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','closed')),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visits_patient_idx     ON visits (patient_id);
CREATE INDEX IF NOT EXISTS visits_appt_idx        ON visits (appointment_id);
CREATE INDEX IF NOT EXISTS visits_doctor_idx      ON visits (doctor_id);

CREATE TABLE IF NOT EXISTS prescriptions (
  id           uuid PRIMARY KEY,
  visit_id     uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  drug_name    text NOT NULL,
  dosage       text,
  frequency    text,
  duration     text,
  instructions text
);

CREATE INDEX IF NOT EXISTS prescriptions_visit_idx ON prescriptions (visit_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE uhid_counter              ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_token_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions             ENABLE ROW LEVEL SECURITY;

-- Counters: only accessible via security definer functions
CREATE POLICY "uhid_counter_deny"  ON uhid_counter              FOR ALL USING (false);
CREATE POLICY "token_counter_deny" ON appointment_token_counter FOR ALL USING (false);

-- Patients: all active clinical staff can read; admin/doctor/nurse/receptionist can write
CREATE POLICY "patients_read" ON patients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist','lab_tech','pharmacist','accountant')
    )
  );

CREATE POLICY "patients_insert" ON patients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist')
    )
  );

CREATE POLICY "patients_update" ON patients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist')
    )
  );

-- Appointments: clinical roles read+write
CREATE POLICY "appointments_read" ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist')
    )
  );

CREATE POLICY "appointments_insert" ON appointments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist')
    )
  );

CREATE POLICY "appointments_update" ON appointments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist')
    )
  );

-- Visits: admin/doctor/nurse/receptionist read; admin/doctor/nurse write
CREATE POLICY "visits_read" ON visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist')
    )
  );

CREATE POLICY "visits_insert" ON visits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse')
    )
  );

CREATE POLICY "visits_update" ON visits FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse')
    )
  );

-- Prescriptions: clinical + pharmacist read; admin/doctor write/delete
CREATE POLICY "prescriptions_read" ON prescriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor','nurse','receptionist','pharmacist')
    )
  );

CREATE POLICY "prescriptions_insert" ON prescriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor')
    )
  );

CREATE POLICY "prescriptions_delete" ON prescriptions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_active = true
        AND p.role IN ('admin','doctor')
    )
  );
