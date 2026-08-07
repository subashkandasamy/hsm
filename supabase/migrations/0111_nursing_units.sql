-- Migration 0111: Nursing Units (wings) for staff scheduling.
--
-- A hospital is Block → Floor → Wing, and each Wing has one central nursing
-- station covering a set of mixed-class rooms. Nurses are rostered to the WING,
-- not to individual rooms or to a billing class (AC/general/…). Until now the
-- roster keyed off `wards` rows — but a `wards` row is really a room/bed-group,
-- so single rooms each showed up as a separate "ward" in the roster dropdown.
--
-- This introduces `nursing_units` (the wing) and repoints the three scheduling
-- tables from ward(room) → nursing_unit. Existing roster/incharge/coverage rows
-- are test data and are cleared. Room CLASSES (ward_room_types) are untouched —
-- they remain a billing concept.

-- ── 1. nursing_units (the rosterable wing) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS nursing_units (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  block         TEXT        NOT NULL,
  floor         TEXT        NOT NULL,
  wing          TEXT        NOT NULL,
  station_name  TEXT,
  target_ratio  NUMERIC     NOT NULL DEFAULT 6,   -- 1 nurse : N patients (per-shift overrides live in ward_coverage_rules)
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, block, floor, wing),
  CONSTRAINT nursing_units_ratio_chk CHECK (target_ratio > 0)
);
CREATE INDEX IF NOT EXISTS idx_nursing_units_tenant ON nursing_units (tenant_id);

ALTER TABLE nursing_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nursing_units_tenant_all ON nursing_units;
CREATE POLICY nursing_units_tenant_all ON nursing_units
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ── 2. rooms (wards) belong to a nursing unit ────────────────────────────────
ALTER TABLE wards ADD COLUMN IF NOT EXISTS nursing_unit_id UUID REFERENCES nursing_units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wards_nursing_unit ON wards (nursing_unit_id) WHERE nursing_unit_id IS NOT NULL;

-- ── 3. repoint scheduling tables ward(room) → nursing_unit (test data cleared) ─
TRUNCATE duty_roster, ward_incharges, ward_coverage_rules;

-- duty_roster: DROP CASCADE also removes idx_duty_roster_ward_date
ALTER TABLE duty_roster DROP COLUMN IF EXISTS ward_id CASCADE;
ALTER TABLE duty_roster ADD COLUMN nursing_unit_id UUID REFERENCES nursing_units(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_duty_roster_unit_date ON duty_roster (tenant_id, nursing_unit_id, date);

-- ward_incharges: DROP CASCADE removes the old unique + ward index
ALTER TABLE ward_incharges DROP COLUMN IF EXISTS ward_id CASCADE;
ALTER TABLE ward_incharges ADD COLUMN nursing_unit_id UUID REFERENCES nursing_units(id) ON DELETE CASCADE;
ALTER TABLE ward_incharges ALTER COLUMN nursing_unit_id SET NOT NULL;
ALTER TABLE ward_incharges ADD CONSTRAINT ward_incharges_unit_uk UNIQUE (tenant_id, nursing_unit_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_ward_incharges_unit ON ward_incharges (tenant_id, nursing_unit_id);

-- ward_coverage_rules: DROP CASCADE removes the old unique
ALTER TABLE ward_coverage_rules DROP COLUMN IF EXISTS ward_id CASCADE;
ALTER TABLE ward_coverage_rules ADD COLUMN nursing_unit_id UUID REFERENCES nursing_units(id) ON DELETE CASCADE;
ALTER TABLE ward_coverage_rules ALTER COLUMN nursing_unit_id SET NOT NULL;
ALTER TABLE ward_coverage_rules ADD CONSTRAINT ward_coverage_rules_unit_uk UNIQUE (tenant_id, nursing_unit_id, shift_code);

-- roster_pattern_members carries an optional default target; repoint it too.
ALTER TABLE roster_pattern_members DROP COLUMN IF EXISTS ward_id CASCADE;
ALTER TABLE roster_pattern_members ADD COLUMN nursing_unit_id UUID REFERENCES nursing_units(id) ON DELETE SET NULL;
