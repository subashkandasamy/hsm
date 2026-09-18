-- Which product (brand) was chosen for a recorded dose, so the pharmacy hands
-- over the same brand the parents were charged for.
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS product_drug_master_id UUID REFERENCES drug_master(id) ON DELETE SET NULL;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS product_drug_id        UUID REFERENCES drugs(id) ON DELETE SET NULL;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS product_name           TEXT;
NOTIFY pgrst, 'reload schema';
