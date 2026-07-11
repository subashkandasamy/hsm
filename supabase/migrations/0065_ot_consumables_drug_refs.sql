-- Add drug reference and pharmacy request tracking to OT consumables

ALTER TABLE ot_consumables
  ADD COLUMN IF NOT EXISTS drug_master_id UUID REFERENCES drug_master(id),
  ADD COLUMN IF NOT EXISTS drug_id        UUID REFERENCES drugs(id),
  ADD COLUMN IF NOT EXISTS pharmacy_request_id UUID REFERENCES ipd_pharmacy_requests(id);
