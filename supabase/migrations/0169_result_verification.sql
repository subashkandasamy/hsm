-- Results must be authorised by a person before anyone outside the lab sees them.
--
-- Until now a result became visible the moment it was typed: entering a value
-- moved the order to 'processing', 'reported' was a single click by the same
-- person, and the patient portal filtered on nothing at all — so an order still
-- being worked on was already readable by the patient.
--
-- That is a live exposure on its own. It becomes a serious one the moment an
-- analyzer starts writing results without a human in the loop, which is the
-- next thing we build. So the gate goes in first.
--
-- 'verified' sits between the work and the release:
--
--   lab:        ordered → collected → processing → verified → reported
--   radiology:  ordered → performed              → verified → reported
--
-- Deliberately NOT a four-eyes rule. A small hospital's laboratory is often one
-- technician, and requiring a second person would stop the day. lab:verify is
-- granted to the technician by default; a larger hospital can hold it to a
-- senior. The safety win is that releasing is an explicit act by a human, not
-- that it is a different human.

-- ── Lab ──────────────────────────────────────────────────────────────────────

ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_status_check;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_status_check
  CHECK (status = ANY (ARRAY[
    'ordered', 'collected', 'processing', 'verified', 'reported', 'cancelled'
  ]));

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN lab_orders.verified_by IS
  'Who authorised these results for release. Null until verified.';

-- ── Radiology ────────────────────────────────────────────────────────────────

ALTER TABLE radiology_orders DROP CONSTRAINT IF EXISTS radiology_orders_status_check;
ALTER TABLE radiology_orders ADD CONSTRAINT radiology_orders_status_check
  CHECK (status = ANY (ARRAY[
    'ordered', 'performed', 'verified', 'reported', 'cancelled'
  ]));

ALTER TABLE radiology_orders
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN radiology_orders.verified_by IS
  'Who authorised this report for release. Null until verified.';

-- Existing 'reported' rows keep their status. They were released under the old
-- rules and rewriting history would be worse than leaving the gap visible:
-- verified_by stays null, which is truthfully "we do not know who released this".

-- The worklist filters on status; the portal now filters on it too.
CREATE INDEX IF NOT EXISTS idx_rad_orders_tenant_status
  ON radiology_orders (tenant_id, status);
