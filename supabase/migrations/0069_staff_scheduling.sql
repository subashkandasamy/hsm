-- =====================================================================
-- 0069_staff_scheduling.sql
-- Staff Scheduling & Nurse Rostering module.
--   * Configurable shift definitions (replaces hardcoded morning/night)
--   * Ward coverage rules (nurse:patient ratios)
--   * Ward in-charge delegation (decentralised rostering)
--   * Leave request/approval workflow
--   * Cyclic roster patterns
--   * duty_roster lifecycle (draft/published, source, created_by)
-- RLS follows the project pattern: tenant isolation only; write-authority
-- (admin / ward in-charge) is enforced in server actions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. shift_definitions — configurable shift types per tenant
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_definitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,                 -- stable key, e.g. 'morning'
  label            TEXT NOT NULL,                 -- 'Morning (7a–7p)'
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  crosses_midnight BOOLEAN NOT NULL DEFAULT false,
  sort_order       INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_shift_definitions_tenant
  ON shift_definitions (tenant_id, sort_order);

ALTER TABLE shift_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_definitions_tenant_all ON shift_definitions;
CREATE POLICY shift_definitions_tenant_all ON shift_definitions
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- Seed the current default shifts for every existing tenant.
-- Morning + Night active (mirrors today's 12h M/N behaviour); Evening seeded
-- but inactive so hospitals can turn it on without breaking existing billing.
INSERT INTO shift_definitions (tenant_id, code, label, start_time, end_time, crosses_midnight, sort_order, is_active)
SELECT t.id, v.code, v.label, v.start_time::time, v.end_time::time, v.crosses_midnight, v.sort_order, v.is_active
FROM tenants t
CROSS JOIN (VALUES
  ('morning', 'Morning', '07:00', '19:00', false, 1, true),
  ('evening', 'Evening', '14:00', '21:00', false, 2, false),
  ('night',   'Night',   '19:00', '07:00', true,  3, true)
) AS v(code, label, start_time, end_time, crosses_midnight, sort_order, is_active)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. ward_coverage_rules — nurse:patient ratio per ward per shift
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ward_coverage_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ward_id       UUID NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  shift_code    TEXT NOT NULL,                    -- references shift_definitions.code
  patient_ratio NUMERIC NOT NULL DEFAULT 6,       -- 1 nurse : N patients
  min_nurses    INT NOT NULL DEFAULT 1,           -- floor regardless of census
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ward_id, shift_code),
  CONSTRAINT ward_coverage_rules_ratio_chk CHECK (patient_ratio > 0),
  CONSTRAINT ward_coverage_rules_min_chk   CHECK (min_nurses >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ward_coverage_rules_ward
  ON ward_coverage_rules (tenant_id, ward_id);

ALTER TABLE ward_coverage_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ward_coverage_rules_tenant_all ON ward_coverage_rules;
CREATE POLICY ward_coverage_rules_tenant_all ON ward_coverage_rules
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 3. ward_incharges — which nurse manages which ward's roster/leave
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ward_incharges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ward_id     UUID NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ward_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_ward_incharges_profile ON ward_incharges (tenant_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_ward_incharges_ward    ON ward_incharges (tenant_id, ward_id);

ALTER TABLE ward_incharges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ward_incharges_tenant_all ON ward_incharges;
CREATE POLICY ward_incharges_tenant_all ON ward_incharges
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 4. leave_requests — request → approve → feeds roster generator
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type   TEXT NOT NULL DEFAULT 'casual',
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  reviewed_by  UUID REFERENCES profiles(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_type_chk   CHECK (leave_type IN ('annual','casual','sick','unpaid','maternity','other')),
  CONSTRAINT leave_requests_status_chk CHECK (status IN ('pending','approved','rejected','cancelled')),
  CONSTRAINT leave_requests_dates_chk  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_profile ON leave_requests (tenant_id, profile_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status  ON leave_requests (tenant_id, status, start_date);
-- Range lookup used by the roster generator ("is nurse on approved leave on date D")
CREATE INDEX IF NOT EXISTS idx_leave_requests_range   ON leave_requests (tenant_id, profile_id, status, start_date, end_date);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_requests_tenant_all ON leave_requests;
CREATE POLICY leave_requests_tenant_all ON leave_requests
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 5. roster_patterns + members — reusable cyclic templates
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roster_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  cycle_days  INT NOT NULL,
  -- day_plan[i] = shift code for cycle day i, or 'off'
  day_plan    TEXT[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roster_patterns_cycle_chk CHECK (cycle_days > 0 AND cycle_days = cardinality(day_plan))
);

CREATE INDEX IF NOT EXISTS idx_roster_patterns_tenant ON roster_patterns (tenant_id);

ALTER TABLE roster_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roster_patterns_tenant_all ON roster_patterns;
CREATE POLICY roster_patterns_tenant_all ON roster_patterns
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS roster_pattern_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pattern_id  UUID NOT NULL REFERENCES roster_patterns(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ward_id     UUID REFERENCES wards(id) ON DELETE SET NULL,
  anchor_date DATE NOT NULL,
  offset_days INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, pattern_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_roster_pattern_members_pattern ON roster_pattern_members (tenant_id, pattern_id);

ALTER TABLE roster_pattern_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roster_pattern_members_tenant_all ON roster_pattern_members;
CREATE POLICY roster_pattern_members_tenant_all ON roster_pattern_members
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 6. duty_roster lifecycle columns
-- ---------------------------------------------------------------------
ALTER TABLE duty_roster
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

DO $$ BEGIN
  ALTER TABLE duty_roster ADD CONSTRAINT duty_roster_status_chk
    CHECK (status IN ('draft','published'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE duty_roster ADD CONSTRAINT duty_roster_source_chk
    CHECK (source IN ('manual','copy_forward','pattern','auto_fill'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Composite index for the roster grid (ward + week window)
CREATE INDEX IF NOT EXISTS idx_duty_roster_ward_date ON duty_roster (tenant_id, ward_id, date);

-- ---------------------------------------------------------------------
-- 7. Configurable-shift swap: drop hardcoded CHECKs, add composite FKs
--    to shift_definitions(tenant_id, code). Seeds above guarantee every
--    existing shift value (morning/evening/night) resolves.
-- ---------------------------------------------------------------------
ALTER TABLE duty_roster                 DROP CONSTRAINT IF EXISTS duty_roster_shift_check;
ALTER TABLE staff_attendance            DROP CONSTRAINT IF EXISTS staff_attendance_shift_check;
ALTER TABLE admission_nurse_assignments DROP CONSTRAINT IF EXISTS admission_nurse_assignments_shift_check;

DO $$ BEGIN
  ALTER TABLE duty_roster ADD CONSTRAINT duty_roster_shift_fk
    FOREIGN KEY (tenant_id, shift) REFERENCES shift_definitions (tenant_id, code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_attendance ADD CONSTRAINT staff_attendance_shift_fk
    FOREIGN KEY (tenant_id, shift) REFERENCES shift_definitions (tenant_id, code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE admission_nurse_assignments ADD CONSTRAINT admission_nurse_assignments_shift_fk
    FOREIGN KEY (tenant_id, shift) REFERENCES shift_definitions (tenant_id, code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reload PostgREST schema cache so the new tables/columns are queryable.
NOTIFY pgrst, 'reload schema';
