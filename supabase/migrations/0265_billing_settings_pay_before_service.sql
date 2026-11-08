-- Which services a hospital takes payment for BEFORE providing them.
--
-- Six gates block a service until its bill is paid: starting the consultation,
-- collecting a lab sample, releasing a lab report, performing a scan, handing
-- over medicines (dispatch and the counter), issuing blood. Every hospital got
-- the same rule. That suits a corporate hospital. A small one cannot work this
-- way: patients refuse to pay before seeing the doctor, and the consultation
-- gate fires whenever a doctor has a fee, because booking raises the bill.
--
-- One row per hospital, one switch per service. TRUE — the default — is the
-- behaviour every hospital has today, so nothing changes until an admin
-- changes it. Switching a service off does not stop the bill being raised; it
-- only stops the service waiting for the payment, which is then collected from
-- Billing like any other unpaid bill. A cashless (insurance-approved) encounter
-- still goes ahead unpaid whichever way the switch is set. Admitted patients
-- were never gated and still are not.
--
-- The application reads this through src/lib/payGate.ts, and falls back to the
-- defaults if the row is missing — or if this migration has not been applied.

CREATE TABLE IF NOT EXISTS billing_settings (
  tenant_id            uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  prepay_consultation  boolean NOT NULL DEFAULT true,
  prepay_lab           boolean NOT NULL DEFAULT true,
  prepay_radiology     boolean NOT NULL DEFAULT true,
  prepay_pharmacy      boolean NOT NULL DEFAULT true,
  prepay_blood         boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE billing_settings IS
  'Per-hospital billing rules. prepay_* = the service waits for its bill to be paid. Default true (every service pre-paid) is the behaviour before this table existed.';
COMMENT ON COLUMN billing_settings.prepay_consultation IS 'Consultation cannot start until the booking-time consultation bill is paid.';
COMMENT ON COLUMN billing_settings.prepay_lab IS 'OPD lab sample cannot be collected, nor the report released, until paid.';
COMMENT ON COLUMN billing_settings.prepay_radiology IS 'OPD scan cannot be performed until paid.';
COMMENT ON COLUMN billing_settings.prepay_pharmacy IS 'Medicines cannot be dispatched or handed over at the counter until paid.';
COMMENT ON COLUMN billing_settings.prepay_blood IS 'OPD blood cannot be issued until paid (an emergency request is always exempt).';

ALTER TABLE billing_settings ENABLE ROW LEVEL SECURITY;

-- Read by every member of staff: the gates run on whoever is collecting the
-- sample or handing over the medicine.
DROP POLICY IF EXISTS billing_settings_read ON billing_settings;
CREATE POLICY billing_settings_read ON billing_settings
  FOR SELECT
  USING (tenant_id = (SELECT current_tenant_id()));

-- Written by an active admin of the same hospital only — the same rule as the
-- hospital profile (0264). current_active_role() checks is_active as well.
DROP POLICY IF EXISTS billing_settings_admin_insert ON billing_settings;
CREATE POLICY billing_settings_admin_insert ON billing_settings
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

DROP POLICY IF EXISTS billing_settings_admin_update ON billing_settings;
CREATE POLICY billing_settings_admin_update ON billing_settings
  FOR UPDATE
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

REVOKE ALL ON billing_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON billing_settings TO authenticated;

NOTIFY pgrst, 'reload schema';
