-- Vaccines are pharmacy stock ────────────────────────────────────────────────
-- The doctor records the dose as given straight away; the pharmacy collects the
-- payment and dispenses the vial from stock (dispensing is blocked until paid).

-- Which pharmacy product is used for each vaccine of the schedule, per hospital.
-- free_supply = government (UIP) stock: recorded with no charge and no pharmacy step.
CREATE TABLE IF NOT EXISTS vaccine_products (
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vaccine         TEXT NOT NULL,
  drug_master_id  UUID REFERENCES drug_master(id) ON DELETE SET NULL,
  drug_id         UUID REFERENCES drugs(id) ON DELETE SET NULL,
  free_supply     BOOLEAN NOT NULL DEFAULT false,
  updated_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, vaccine)
);
ALTER TABLE vaccine_products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY vaccine_products_tenant_all ON vaccine_products FOR ALL
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON vaccine_products FROM anon;

-- Fulfilment of a recorded dose:
--   not_required — free / government supply, or recorded as given earlier
--   pending      — billed, waiting for payment and the vial to be dispensed
--   dispensed    — paid and taken out of stock (batch and expiry kept with the dose)
--   cancelled    — the pharmacy order was cancelled; the dose stays recorded
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS fulfilment    TEXT NOT NULL DEFAULT 'not_required'
  CHECK (fulfilment IN ('not_required', 'pending', 'dispensed', 'cancelled'));
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS bill_id       UUID REFERENCES bills(id) ON DELETE SET NULL;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS dispense_id   UUID;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS drug_batch_id UUID REFERENCES drug_batches(id) ON DELETE SET NULL;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS batch_no      TEXT;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS expiry_date   DATE;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(10,2);
CREATE INDEX IF NOT EXISTS idx_patient_immun_fulfilment ON patient_immunizations (tenant_id, fulfilment)
  WHERE fulfilment IN ('pending', 'dispensed');

-- Vaccination income shows on its own, not lumped in with pharmacy sales.
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check CHECK (bill_source = ANY (ARRAY[
  'bed', 'lab', 'radiology', 'ipd_pharmacy', 'nursing', 'nursing_morning', 'nursing_night',
  'consolidated', 'advance_refund', 'appointment_refund', 'ot', 'blood', 'consultation', 'icu', 'manual', 'vaccine']));
ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_source_check;
ALTER TABLE bill_items ADD CONSTRAINT bill_items_source_check CHECK (source = ANY (ARRAY[
  'consultation', 'bed', 'lab', 'radiology', 'pharmacy', 'ipd_pharmacy', 'ot', 'ot_consumable', 'blood',
  'manual', 'dental', 'pharmacy_sale_item', 'nursing', 'nursing_morning', 'nursing_night', 'icu', 'vaccine']));

NOTIFY pgrst, 'reload schema';
