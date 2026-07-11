-- Store drug references (master or tenant) on IPD medication orders and pharmacy requests
-- so stock lookup, deduction and billing never rely on name string matching.

ALTER TABLE ipd_medication_orders
  ADD COLUMN IF NOT EXISTS drug_master_id UUID REFERENCES drug_master(id),
  ADD COLUMN IF NOT EXISTS drug_id        UUID REFERENCES drugs(id);

ALTER TABLE ipd_pharmacy_requests
  ADD COLUMN IF NOT EXISTS drug_master_id UUID REFERENCES drug_master(id),
  ADD COLUMN IF NOT EXISTS drug_id        UUID REFERENCES drugs(id);

CREATE INDEX IF NOT EXISTS idx_ipd_med_orders_drug_master
  ON ipd_medication_orders(drug_master_id) WHERE drug_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ipd_med_orders_drug
  ON ipd_medication_orders(drug_id) WHERE drug_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ipd_pharm_req_drug_master
  ON ipd_pharmacy_requests(drug_master_id) WHERE drug_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ipd_pharm_req_drug
  ON ipd_pharmacy_requests(drug_id) WHERE drug_id IS NOT NULL;
