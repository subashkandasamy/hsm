-- =====================================================================
-- 0083_bloodbank_phase2_screening.sql
-- Blood Bank v2 — Phase 2: mandatory TTI (transfusion-transmissible infection)
-- screening. A unit may not be issued until screening_status = 'passed'.
-- Markers: HIV, HBsAg, HCV, Syphilis (VDRL), Malaria — India NBTC-mandated.
-- Also: unit bag number + collected volume.
-- =====================================================================

ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS screening_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS hiv       TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS hbsag     TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS hcv       TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS syphilis  TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS malaria   TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS screened_by UUID REFERENCES profiles(id);
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS screened_at TIMESTAMPTZ;
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS bag_number  TEXT;
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS volume_ml   INT;

DO $$ BEGIN
  ALTER TABLE blood_units ADD CONSTRAINT blood_units_screening_status_chk
    CHECK (screening_status IN ('pending','passed','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE blood_units ADD CONSTRAINT blood_units_markers_chk CHECK (
    hiv      IN ('pending','reactive','non_reactive') AND
    hbsag    IN ('pending','reactive','non_reactive') AND
    hcv      IN ('pending','reactive','non_reactive') AND
    syphilis IN ('pending','reactive','non_reactive') AND
    malaria  IN ('pending','reactive','non_reactive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS blood_units_bag_no_uq
  ON blood_units (tenant_id, bag_number) WHERE bag_number IS NOT NULL;

-- Gate issue on screening: a unit must be screening-passed to be claimed.
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
  -- Screening gate (clear message before the atomic claim)
  SELECT * INTO v_unit FROM blood_units WHERE id = p_blood_unit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Blood unit not found');
  END IF;
  IF v_unit.screening_status <> 'passed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit not screening-passed — complete TTI screening before issue');
  END IF;

  -- Lock and claim the unit atomically (screening re-checked to avoid races)
  UPDATE blood_units
  SET    status = 'issued'
  WHERE  id = p_blood_unit_id
    AND  status = 'available'
    AND  expiry >= CURRENT_DATE
    AND  screening_status = 'passed'
  RETURNING * INTO v_unit;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit unavailable, already issued, or expired');
  END IF;

  SELECT * INTO v_req FROM blood_requests WHERE id = p_request_id;
  IF v_unit.blood_group <> v_req.blood_group OR v_unit.component <> v_req.component THEN
    UPDATE blood_units SET status = 'available' WHERE id = p_blood_unit_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Blood group or component mismatch');
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
