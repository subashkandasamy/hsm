-- =====================================================================
-- 0084_bloodbank_phase3_crossmatch.sql
-- Blood Bank v2 — Phase 3: real cross-match records + compatible issue.
-- A unit is released only when a COMPATIBLE cross-match exists for the exact
-- (request, unit) pair — recorded against the recipient's sample. Compatibility
-- (incl. group substitution like O- universal donor) is validated in the app;
-- the DB enforces "a compatible cross-match must exist" as the release gate.
-- =====================================================================

ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS recipient_sample_no TEXT;

CREATE TABLE IF NOT EXISTS blood_crossmatches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id         UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  blood_unit_id      UUID NOT NULL REFERENCES blood_units(id),
  recipient_sample_no TEXT,
  major_result       TEXT NOT NULL CHECK (major_result IN ('compatible','incompatible')),
  minor_result       TEXT CHECK (minor_result IN ('compatible','incompatible')),
  compatible         BOOLEAN NOT NULL,
  technician_id      UUID REFERENCES profiles(id),
  crossmatched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blood_crossmatches_request ON blood_crossmatches (request_id);
CREATE INDEX IF NOT EXISTS idx_blood_crossmatches_unit    ON blood_crossmatches (blood_unit_id);

ALTER TABLE blood_crossmatches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY blood_crossmatches_tenant_all ON blood_crossmatches
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Release gate: screening-passed AND a compatible cross-match for this exact
-- (request, unit). Group equality is replaced by the cross-match requirement so
-- clinically-compatible substitutions (e.g. O- to any recipient) are allowed.
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
  v_xm    boolean;
  v_issued_count int;
BEGIN
  SELECT * INTO v_unit FROM blood_units WHERE id = p_blood_unit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Blood unit not found');
  END IF;
  IF v_unit.screening_status <> 'passed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit not screening-passed — complete TTI screening before issue');
  END IF;

  SELECT * INTO v_req FROM blood_requests WHERE id = p_request_id;
  IF v_unit.component <> v_req.component THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Component mismatch');
  END IF;

  -- Require a compatible cross-match for this exact request + unit
  SELECT compatible INTO v_xm FROM blood_crossmatches
   WHERE request_id = p_request_id AND blood_unit_id = p_blood_unit_id
   ORDER BY crossmatched_at DESC LIMIT 1;
  IF v_xm IS NULL OR v_xm = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No compatible cross-match on record for this unit — cross-match before issue');
  END IF;

  -- Atomic claim (unit may be 'available' or 'reserved' from cross-match)
  UPDATE blood_units
  SET    status = 'issued'
  WHERE  id = p_blood_unit_id
    AND  status IN ('available','reserved')
    AND  expiry >= CURRENT_DATE
    AND  screening_status = 'passed'
  RETURNING * INTO v_unit;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit unavailable, already issued, or expired');
  END IF;

  INSERT INTO blood_issues (id, request_id, blood_unit_id, patient_id, price_snapshot, billing_status, issued_by)
  VALUES (p_issue_id, p_request_id, p_blood_unit_id, p_patient_id, p_price_snapshot, 'unbilled', p_issued_by);

  SELECT COUNT(*) INTO v_issued_count FROM blood_issues WHERE request_id = p_request_id;
  IF v_issued_count >= v_req.units_required THEN
    UPDATE blood_requests SET status = 'issued' WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION issue_blood_unit(uuid,uuid,uuid,uuid,numeric,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
