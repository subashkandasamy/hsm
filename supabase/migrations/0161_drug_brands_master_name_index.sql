-- Taking the first few brands of a molecule ("Paracetamol" has 6,395) sorted by
-- name had to read and sort them all. This index returns them already ordered.
CREATE INDEX IF NOT EXISTS idx_drug_brands_master_name ON drug_brands (drug_master_id, brand_name);
