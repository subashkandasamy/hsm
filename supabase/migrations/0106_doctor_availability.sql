-- =====================================================================
-- 0106_doctor_availability.sql
-- Patient portal #2: doctor OPD availability. Weekly recurring sessions per
-- doctor (day-of-week + time range + optional label + optional token cap).
-- Powers the patient day-picker (grey out days a doctor isn't in) and the
-- token/queue booking flow. OPD is token-based (get_next_appointment_token),
-- so this is availability, not fixed time slots.
-- =====================================================================

CREATE TABLE IF NOT EXISTS doctor_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  label        TEXT,           -- e.g. 'Morning', 'Evening'
  token_cap    INTEGER,        -- optional max tokens for the session (NULL = unlimited)
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_avail ON doctor_availability (tenant_id, doctor_id, day_of_week);

ALTER TABLE doctor_availability ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY doctor_avail_tenant_all ON doctor_availability
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
