-- ============================================================
-- Migration 0043: Global Drug Master table
--
-- Architecture:
--   drug_master   — global catalog (Uyirly-curated + Growth tenants can add)
--   drug_batches  — per-tenant stock; references drug_master OR drugs (tenant custom)
--   dispenses     — per-tenant; references drug_master OR drugs
--
-- Both drug_batches.drug_id and drug_batches.drug_master_id are nullable;
-- at least one must be set (CHECK constraint).
-- ============================================================

-- ── 1. Create drug_master ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drug_master (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text    NOT NULL,
  generic_name text,
  category     text,
  form         text,
  strength     text,
  unit         text,
  is_active    boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_drug_master_name ON drug_master (name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_drug_master_category ON drug_master (category);

ALTER TABLE drug_master ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read global drug master
CREATE POLICY "drug_master_read" ON drug_master FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service role / platform admin can write (no authenticated INSERT policy)

-- ── 2. Extend drug_batches ───────────────────────────────────────────────────

-- Make drug_id nullable so new master-linked batches can have drug_id = NULL
ALTER TABLE drug_batches ALTER COLUMN drug_id DROP NOT NULL;

-- Add drug_master_id FK
ALTER TABLE drug_batches
  ADD COLUMN IF NOT EXISTS drug_master_id uuid REFERENCES drug_master(id),
  ADD COLUMN IF NOT EXISTS reorder_level   int NOT NULL DEFAULT 0;

-- Exactly one of drug_id / drug_master_id must be non-null
ALTER TABLE drug_batches DROP CONSTRAINT IF EXISTS chk_drug_batch_ref;
ALTER TABLE drug_batches ADD CONSTRAINT chk_drug_batch_ref
  CHECK (
    (drug_id IS NOT NULL AND drug_master_id IS NULL) OR
    (drug_id IS NULL     AND drug_master_id IS NOT NULL)
  );

-- Index for FEFO stock queries by drug_master
CREATE INDEX IF NOT EXISTS idx_batches_drug_master_tenant
  ON drug_batches (drug_master_id, tenant_id, expiry)
  WHERE drug_master_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batches_drug_id_tenant
  ON drug_batches (drug_id, tenant_id, expiry)
  WHERE drug_id IS NOT NULL;

-- ── 3. Extend dispenses ──────────────────────────────────────────────────────

ALTER TABLE dispenses ALTER COLUMN drug_id DROP NOT NULL;

ALTER TABLE dispenses
  ADD COLUMN IF NOT EXISTS drug_master_id uuid REFERENCES drug_master(id);

ALTER TABLE dispenses DROP CONSTRAINT IF EXISTS chk_dispense_drug_ref;
ALTER TABLE dispenses ADD CONSTRAINT chk_dispense_drug_ref
  CHECK (
    (drug_id IS NOT NULL AND drug_master_id IS NULL) OR
    (drug_id IS NULL     AND drug_master_id IS NOT NULL)
  );

-- ── 4. Update dispense_drug() RPC ───────────────────────────────────────────

-- Drop old 8-param version so we can replace with 9-param version
DROP FUNCTION IF EXISTS dispense_drug(uuid, uuid, uuid, uuid, uuid, int, numeric, uuid);

CREATE OR REPLACE FUNCTION dispense_drug(
  p_dispense_id      uuid,
  p_patient_id       uuid,
  p_prescription_id  uuid,
  p_drug_id          uuid,          -- NULL for drug_master batches
  p_drug_master_id   uuid,          -- NULL for tenant custom drug batches
  p_batch_id         uuid,
  p_qty              int,
  p_price_snapshot   numeric,
  p_dispensed_by     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
BEGIN
  UPDATE drug_batches
  SET qty_available = qty_available - p_qty
  WHERE id = p_batch_id
    AND qty_available >= p_qty
    AND expiry > CURRENT_DATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock or batch expired');
  END IF;

  INSERT INTO dispenses (id, tenant_id, patient_id, prescription_id, drug_id, drug_master_id,
                         drug_batch_id, qty, price_snapshot, billing_status, dispensed_by)
  VALUES (p_dispense_id, v_tenant_id, p_patient_id, p_prescription_id,
          p_drug_id, p_drug_master_id,
          p_batch_id, p_qty, p_price_snapshot, 'unbilled', p_dispensed_by);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION dispense_drug(uuid, uuid, uuid, uuid, uuid, uuid, int, numeric, uuid) TO authenticated;

-- ── 5. Seed ~200 common Indian drugs ────────────────────────────────────────

INSERT INTO drug_master (id, name, generic_name, category, form, strength, unit, is_active) VALUES

-- Analgesics / Antipyretics
(gen_random_uuid(), 'Paracetamol', 'Acetaminophen', 'Analgesic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Paracetamol', 'Acetaminophen', 'Analgesic', 'Tablet', '650mg', 'mg', true),
(gen_random_uuid(), 'Paracetamol', 'Acetaminophen', 'Analgesic', 'Syrup', '125mg/5ml', 'ml', true),
(gen_random_uuid(), 'Paracetamol + Caffeine', NULL, 'Analgesic', 'Tablet', '500mg+65mg', 'mg', true),
(gen_random_uuid(), 'Paracetamol Injection', 'Acetaminophen', 'Analgesic', 'Injection', '150mg/ml', 'ml', true),
(gen_random_uuid(), 'Ibuprofen', 'Ibuprofen', 'NSAID', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Ibuprofen', 'Ibuprofen', 'NSAID', 'Tablet', '400mg', 'mg', true),
(gen_random_uuid(), 'Ibuprofen', 'Ibuprofen', 'NSAID', 'Tablet', '600mg', 'mg', true),
(gen_random_uuid(), 'Ibuprofen', 'Ibuprofen', 'NSAID', 'Syrup', '100mg/5ml', 'ml', true),
(gen_random_uuid(), 'Diclofenac', 'Diclofenac Sodium', 'NSAID', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Diclofenac', 'Diclofenac Sodium', 'NSAID', 'Tablet', '75mg', 'mg', true),
(gen_random_uuid(), 'Diclofenac', 'Diclofenac Sodium', 'NSAID', 'Injection', '75mg/3ml', 'mg', true),
(gen_random_uuid(), 'Nimesulide', 'Nimesulide', 'NSAID', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Nimesulide + Paracetamol', NULL, 'NSAID', 'Tablet', '100mg+325mg', 'mg', true),
(gen_random_uuid(), 'Aspirin', 'Acetylsalicylic Acid', 'Analgesic', 'Tablet', '75mg', 'mg', true),
(gen_random_uuid(), 'Aspirin', 'Acetylsalicylic Acid', 'Analgesic', 'Tablet', '150mg', 'mg', true),
(gen_random_uuid(), 'Aspirin', 'Acetylsalicylic Acid', 'Analgesic', 'Tablet', '300mg', 'mg', true),
(gen_random_uuid(), 'Tramadol', 'Tramadol HCl', 'Opioid Analgesic', 'Capsule', '50mg', 'mg', true),
(gen_random_uuid(), 'Tramadol', 'Tramadol HCl', 'Opioid Analgesic', 'Injection', '50mg/ml', 'mg', true),
(gen_random_uuid(), 'Ketorolac', 'Ketorolac Tromethamine', 'NSAID', 'Injection', '30mg/ml', 'mg', true),

-- Antibiotics
(gen_random_uuid(), 'Amoxicillin', 'Amoxicillin', 'Antibiotic', 'Capsule', '250mg', 'mg', true),
(gen_random_uuid(), 'Amoxicillin', 'Amoxicillin', 'Antibiotic', 'Capsule', '500mg', 'mg', true),
(gen_random_uuid(), 'Amoxicillin', 'Amoxicillin', 'Antibiotic', 'Syrup', '125mg/5ml', 'ml', true),
(gen_random_uuid(), 'Amoxicillin + Clavulanic Acid', 'Co-Amoxiclav', 'Antibiotic', 'Tablet', '375mg', 'mg', true),
(gen_random_uuid(), 'Amoxicillin + Clavulanic Acid', 'Co-Amoxiclav', 'Antibiotic', 'Tablet', '625mg', 'mg', true),
(gen_random_uuid(), 'Azithromycin', 'Azithromycin', 'Antibiotic', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Azithromycin', 'Azithromycin', 'Antibiotic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Azithromycin', 'Azithromycin', 'Antibiotic', 'Syrup', '200mg/5ml', 'ml', true),
(gen_random_uuid(), 'Ciprofloxacin', 'Ciprofloxacin HCl', 'Antibiotic', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Ciprofloxacin', 'Ciprofloxacin HCl', 'Antibiotic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Ciprofloxacin', 'Ciprofloxacin HCl', 'Antibiotic', 'Injection', '200mg/100ml', 'mg', true),
(gen_random_uuid(), 'Metronidazole', 'Metronidazole', 'Antibiotic', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Metronidazole', 'Metronidazole', 'Antibiotic', 'Tablet', '400mg', 'mg', true),
(gen_random_uuid(), 'Metronidazole', 'Metronidazole', 'Antibiotic', 'Injection', '500mg/100ml', 'mg', true),
(gen_random_uuid(), 'Doxycycline', 'Doxycycline Hyclate', 'Antibiotic', 'Capsule', '100mg', 'mg', true),
(gen_random_uuid(), 'Cefixime', 'Cefixime', 'Antibiotic', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Cefixime', 'Cefixime', 'Antibiotic', 'Tablet', '400mg', 'mg', true),
(gen_random_uuid(), 'Cephalexin', 'Cefalexin', 'Antibiotic', 'Capsule', '250mg', 'mg', true),
(gen_random_uuid(), 'Cephalexin', 'Cefalexin', 'Antibiotic', 'Capsule', '500mg', 'mg', true),
(gen_random_uuid(), 'Clindamycin', 'Clindamycin HCl', 'Antibiotic', 'Capsule', '150mg', 'mg', true),
(gen_random_uuid(), 'Clindamycin', 'Clindamycin HCl', 'Antibiotic', 'Capsule', '300mg', 'mg', true),
(gen_random_uuid(), 'Levofloxacin', 'Levofloxacin', 'Antibiotic', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Levofloxacin', 'Levofloxacin', 'Antibiotic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Cotrimoxazole', 'Sulfamethoxazole + Trimethoprim', 'Antibiotic', 'Tablet', '480mg', 'mg', true),
(gen_random_uuid(), 'Cotrimoxazole', 'Sulfamethoxazole + Trimethoprim', 'Antibiotic', 'Tablet', '960mg', 'mg', true),
(gen_random_uuid(), 'Erythromycin', 'Erythromycin', 'Antibiotic', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Erythromycin', 'Erythromycin', 'Antibiotic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Ceftriaxone', 'Ceftriaxone Sodium', 'Antibiotic', 'Injection', '250mg', 'mg', true),
(gen_random_uuid(), 'Ceftriaxone', 'Ceftriaxone Sodium', 'Antibiotic', 'Injection', '1g', 'g', true),
(gen_random_uuid(), 'Ceftriaxone', 'Ceftriaxone Sodium', 'Antibiotic', 'Injection', '2g', 'g', true),
(gen_random_uuid(), 'Cefuroxime', 'Cefuroxime Axetil', 'Antibiotic', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Cefuroxime', 'Cefuroxime Axetil', 'Antibiotic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Meropenem', 'Meropenem', 'Antibiotic', 'Injection', '500mg', 'mg', true),
(gen_random_uuid(), 'Meropenem', 'Meropenem', 'Antibiotic', 'Injection', '1g', 'g', true),
(gen_random_uuid(), 'Piperacillin + Tazobactam', NULL, 'Antibiotic', 'Injection', '4.5g', 'g', true),
(gen_random_uuid(), 'Tinidazole', 'Tinidazole', 'Antibiotic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Vancomycin', 'Vancomycin HCl', 'Antibiotic', 'Injection', '500mg', 'mg', true),
(gen_random_uuid(), 'Amikacin', 'Amikacin Sulphate', 'Antibiotic', 'Injection', '250mg/2ml', 'mg', true),
(gen_random_uuid(), 'Amikacin', 'Amikacin Sulphate', 'Antibiotic', 'Injection', '500mg/2ml', 'mg', true),
(gen_random_uuid(), 'Gentamicin', 'Gentamicin Sulphate', 'Antibiotic', 'Injection', '80mg/2ml', 'mg', true),

-- Antacids / GI
(gen_random_uuid(), 'Omeprazole', 'Omeprazole', 'Antacid', 'Capsule', '20mg', 'mg', true),
(gen_random_uuid(), 'Omeprazole', 'Omeprazole', 'Antacid', 'Capsule', '40mg', 'mg', true),
(gen_random_uuid(), 'Pantoprazole', 'Pantoprazole Sodium', 'Antacid', 'Tablet', '40mg', 'mg', true),
(gen_random_uuid(), 'Pantoprazole', 'Pantoprazole Sodium', 'Antacid', 'Injection', '40mg', 'mg', true),
(gen_random_uuid(), 'Rabeprazole', 'Rabeprazole Sodium', 'Antacid', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Esomeprazole', 'Esomeprazole Magnesium', 'Antacid', 'Tablet', '40mg', 'mg', true),
(gen_random_uuid(), 'Ranitidine', 'Ranitidine HCl', 'Antacid', 'Tablet', '150mg', 'mg', true),
(gen_random_uuid(), 'Famotidine', 'Famotidine', 'Antacid', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Domperidone', 'Domperidone', 'Antiemetic', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Metoclopramide', 'Metoclopramide HCl', 'Antiemetic', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Metoclopramide', 'Metoclopramide HCl', 'Antiemetic', 'Injection', '10mg/2ml', 'mg', true),
(gen_random_uuid(), 'Ondansetron', 'Ondansetron HCl', 'Antiemetic', 'Tablet', '4mg', 'mg', true),
(gen_random_uuid(), 'Ondansetron', 'Ondansetron HCl', 'Antiemetic', 'Tablet', '8mg', 'mg', true),
(gen_random_uuid(), 'Ondansetron', 'Ondansetron HCl', 'Antiemetic', 'Injection', '4mg/2ml', 'mg', true),
(gen_random_uuid(), 'Lactulose', 'Lactulose', 'Laxative', 'Syrup', '10g/15ml', 'ml', true),
(gen_random_uuid(), 'Bisacodyl', 'Bisacodyl', 'Laxative', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Loperamide', 'Loperamide HCl', 'Antidiarrheal', 'Capsule', '2mg', 'mg', true),
(gen_random_uuid(), 'Dicyclomine', 'Dicyclomine HCl', 'Antispasmodic', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Sucralfate', 'Sucralfate', 'Antacid', 'Tablet', '1g', 'g', true),
(gen_random_uuid(), 'Antacid Suspension', 'Aluminium Hydroxide + Magnesium Hydroxide', 'Antacid', 'Syrup', '200mg+200mg/5ml', 'ml', true),
(gen_random_uuid(), 'Simethicone', 'Simethicone', 'Antiflatulent', 'Tablet', '40mg', 'mg', true),
(gen_random_uuid(), 'ORS Powder', 'Oral Rehydration Salts', 'Rehydration', 'Sachet', '20.5g', 'g', true),

-- Antidiabetics
(gen_random_uuid(), 'Metformin', 'Metformin HCl', 'Antidiabetic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Metformin', 'Metformin HCl', 'Antidiabetic', 'Tablet', '850mg', 'mg', true),
(gen_random_uuid(), 'Metformin', 'Metformin HCl', 'Antidiabetic', 'Tablet', '1000mg', 'mg', true),
(gen_random_uuid(), 'Glibenclamide', 'Glibenclamide', 'Antidiabetic', 'Tablet', '2.5mg', 'mg', true),
(gen_random_uuid(), 'Glibenclamide', 'Glibenclamide', 'Antidiabetic', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Glimepiride', 'Glimepiride', 'Antidiabetic', 'Tablet', '1mg', 'mg', true),
(gen_random_uuid(), 'Glimepiride', 'Glimepiride', 'Antidiabetic', 'Tablet', '2mg', 'mg', true),
(gen_random_uuid(), 'Glimepiride', 'Glimepiride', 'Antidiabetic', 'Tablet', '4mg', 'mg', true),
(gen_random_uuid(), 'Sitagliptin', 'Sitagliptin Phosphate', 'Antidiabetic', 'Tablet', '25mg', 'mg', true),
(gen_random_uuid(), 'Sitagliptin', 'Sitagliptin Phosphate', 'Antidiabetic', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Sitagliptin', 'Sitagliptin Phosphate', 'Antidiabetic', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Vildagliptin', 'Vildagliptin', 'Antidiabetic', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Dapagliflozin', 'Dapagliflozin', 'Antidiabetic', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Empagliflozin', 'Empagliflozin', 'Antidiabetic', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Insulin Regular', 'Human Insulin Regular', 'Antidiabetic', 'Injection', '100IU/ml', 'IU', true),
(gen_random_uuid(), 'Insulin NPH', 'Human Insulin Isophane', 'Antidiabetic', 'Injection', '100IU/ml', 'IU', true),
(gen_random_uuid(), 'Insulin Glargine', 'Insulin Glargine', 'Antidiabetic', 'Injection', '100IU/ml', 'IU', true),
(gen_random_uuid(), 'Insulin Aspart', 'Insulin Aspart', 'Antidiabetic', 'Injection', '100IU/ml', 'IU', true),

-- Cardiovascular
(gen_random_uuid(), 'Atenolol', 'Atenolol', 'Antihypertensive', 'Tablet', '25mg', 'mg', true),
(gen_random_uuid(), 'Atenolol', 'Atenolol', 'Antihypertensive', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Atenolol', 'Atenolol', 'Antihypertensive', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Amlodipine', 'Amlodipine Besylate', 'Antihypertensive', 'Tablet', '2.5mg', 'mg', true),
(gen_random_uuid(), 'Amlodipine', 'Amlodipine Besylate', 'Antihypertensive', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Amlodipine', 'Amlodipine Besylate', 'Antihypertensive', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Losartan', 'Losartan Potassium', 'Antihypertensive', 'Tablet', '25mg', 'mg', true),
(gen_random_uuid(), 'Losartan', 'Losartan Potassium', 'Antihypertensive', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Losartan', 'Losartan Potassium', 'Antihypertensive', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Enalapril', 'Enalapril Maleate', 'Antihypertensive', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Enalapril', 'Enalapril Maleate', 'Antihypertensive', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Ramipril', 'Ramipril', 'Antihypertensive', 'Capsule', '2.5mg', 'mg', true),
(gen_random_uuid(), 'Ramipril', 'Ramipril', 'Antihypertensive', 'Capsule', '5mg', 'mg', true),
(gen_random_uuid(), 'Ramipril', 'Ramipril', 'Antihypertensive', 'Capsule', '10mg', 'mg', true),
(gen_random_uuid(), 'Telmisartan', 'Telmisartan', 'Antihypertensive', 'Tablet', '40mg', 'mg', true),
(gen_random_uuid(), 'Telmisartan', 'Telmisartan', 'Antihypertensive', 'Tablet', '80mg', 'mg', true),
(gen_random_uuid(), 'Atorvastatin', 'Atorvastatin Calcium', 'Statin', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Atorvastatin', 'Atorvastatin Calcium', 'Statin', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Atorvastatin', 'Atorvastatin Calcium', 'Statin', 'Tablet', '40mg', 'mg', true),
(gen_random_uuid(), 'Rosuvastatin', 'Rosuvastatin Calcium', 'Statin', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Rosuvastatin', 'Rosuvastatin Calcium', 'Statin', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Clopidogrel', 'Clopidogrel Bisulphate', 'Antiplatelet', 'Tablet', '75mg', 'mg', true),
(gen_random_uuid(), 'Furosemide', 'Furosemide', 'Diuretic', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Furosemide', 'Furosemide', 'Diuretic', 'Tablet', '40mg', 'mg', true),
(gen_random_uuid(), 'Furosemide', 'Furosemide', 'Diuretic', 'Injection', '10mg/ml', 'mg', true),
(gen_random_uuid(), 'Spironolactone', 'Spironolactone', 'Diuretic', 'Tablet', '25mg', 'mg', true),
(gen_random_uuid(), 'Spironolactone', 'Spironolactone', 'Diuretic', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Digoxin', 'Digoxin', 'Cardiac Glycoside', 'Tablet', '0.25mg', 'mg', true),
(gen_random_uuid(), 'Bisoprolol', 'Bisoprolol Fumarate', 'Beta Blocker', 'Tablet', '2.5mg', 'mg', true),
(gen_random_uuid(), 'Bisoprolol', 'Bisoprolol Fumarate', 'Beta Blocker', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Bisoprolol', 'Bisoprolol Fumarate', 'Beta Blocker', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Nitroglycerin', 'Glyceryl Trinitrate', 'Antianginal', 'Tablet', '0.5mg', 'mg', true),
(gen_random_uuid(), 'Isosorbide Mononitrate', 'Isosorbide Mononitrate', 'Antianginal', 'Tablet', '30mg', 'mg', true),
(gen_random_uuid(), 'Isosorbide Mononitrate', 'Isosorbide Mononitrate', 'Antianginal', 'Tablet', '60mg', 'mg', true),
(gen_random_uuid(), 'Warfarin', 'Warfarin Sodium', 'Anticoagulant', 'Tablet', '1mg', 'mg', true),
(gen_random_uuid(), 'Warfarin', 'Warfarin Sodium', 'Anticoagulant', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Heparin', 'Heparin Sodium', 'Anticoagulant', 'Injection', '5000IU/ml', 'IU', true),

-- Respiratory
(gen_random_uuid(), 'Salbutamol', 'Salbutamol Sulphate', 'Bronchodilator', 'Tablet', '2mg', 'mg', true),
(gen_random_uuid(), 'Salbutamol', 'Salbutamol Sulphate', 'Bronchodilator', 'Tablet', '4mg', 'mg', true),
(gen_random_uuid(), 'Salbutamol', 'Salbutamol Sulphate', 'Bronchodilator', 'Inhaler', '100mcg/dose', 'mcg', true),
(gen_random_uuid(), 'Salbutamol Nebulization', 'Salbutamol Sulphate', 'Bronchodilator', 'Solution', '2.5mg/2.5ml', 'mg', true),
(gen_random_uuid(), 'Montelukast', 'Montelukast Sodium', 'Antiasthmatic', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Montelukast', 'Montelukast Sodium', 'Antiasthmatic', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Theophylline', 'Theophylline', 'Bronchodilator', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Theophylline', 'Theophylline', 'Bronchodilator', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Cetirizine', 'Cetirizine HCl', 'Antihistamine', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Cetirizine', 'Cetirizine HCl', 'Antihistamine', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Loratadine', 'Loratadine', 'Antihistamine', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Fexofenadine', 'Fexofenadine HCl', 'Antihistamine', 'Tablet', '120mg', 'mg', true),
(gen_random_uuid(), 'Fexofenadine', 'Fexofenadine HCl', 'Antihistamine', 'Tablet', '180mg', 'mg', true),
(gen_random_uuid(), 'Chlorpheniramine', 'Chlorpheniramine Maleate', 'Antihistamine', 'Tablet', '4mg', 'mg', true),
(gen_random_uuid(), 'Ambroxol', 'Ambroxol HCl', 'Expectorant', 'Tablet', '30mg', 'mg', true),
(gen_random_uuid(), 'Ambroxol', 'Ambroxol HCl', 'Expectorant', 'Syrup', '15mg/5ml', 'ml', true),
(gen_random_uuid(), 'Bromhexine', 'Bromhexine HCl', 'Expectorant', 'Tablet', '8mg', 'mg', true),
(gen_random_uuid(), 'Prednisolone', 'Prednisolone', 'Corticosteroid', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Prednisolone', 'Prednisolone', 'Corticosteroid', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Prednisolone', 'Prednisolone', 'Corticosteroid', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Prednisolone', 'Prednisolone', 'Corticosteroid', 'Injection', '25mg/ml', 'mg', true),

-- Vitamins / Supplements
(gen_random_uuid(), 'Vitamin B12', 'Cyanocobalamin', 'Vitamin', 'Injection', '500mcg/ml', 'mcg', true),
(gen_random_uuid(), 'Vitamin B12', 'Methylcobalamin', 'Vitamin', 'Tablet', '500mcg', 'mcg', true),
(gen_random_uuid(), 'Vitamin B Complex', NULL, 'Vitamin', 'Tablet', NULL, 'tablet', true),
(gen_random_uuid(), 'Vitamin C', 'Ascorbic Acid', 'Vitamin', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Vitamin D3', 'Cholecalciferol', 'Vitamin', 'Tablet', '60000IU', 'IU', true),
(gen_random_uuid(), 'Vitamin D3', 'Cholecalciferol', 'Vitamin', 'Tablet', '1000IU', 'IU', true),
(gen_random_uuid(), 'Calcium Carbonate', 'Calcium Carbonate', 'Mineral', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Calcium + Vitamin D3', NULL, 'Mineral', 'Tablet', '500mg+250IU', 'mg', true),
(gen_random_uuid(), 'Folic Acid', 'Folic Acid', 'Vitamin', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Iron Ferrous Sulphate', 'Ferrous Sulphate', 'Mineral', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Iron + Folic Acid', NULL, 'Mineral', 'Tablet', '100mg+0.5mg', 'mg', true),
(gen_random_uuid(), 'Zinc Sulphate', 'Zinc Sulphate', 'Mineral', 'Tablet', '20mg', 'mg', true),
(gen_random_uuid(), 'Multivitamin', NULL, 'Vitamin', 'Tablet', NULL, 'tablet', true),

-- Hormonal / Corticosteroids
(gen_random_uuid(), 'Levothyroxine', 'Levothyroxine Sodium', 'Thyroid', 'Tablet', '25mcg', 'mcg', true),
(gen_random_uuid(), 'Levothyroxine', 'Levothyroxine Sodium', 'Thyroid', 'Tablet', '50mcg', 'mcg', true),
(gen_random_uuid(), 'Levothyroxine', 'Levothyroxine Sodium', 'Thyroid', 'Tablet', '100mcg', 'mcg', true),
(gen_random_uuid(), 'Dexamethasone', 'Dexamethasone', 'Corticosteroid', 'Tablet', '0.5mg', 'mg', true),
(gen_random_uuid(), 'Dexamethasone', 'Dexamethasone', 'Corticosteroid', 'Injection', '4mg/ml', 'mg', true),
(gen_random_uuid(), 'Hydrocortisone', 'Hydrocortisone Sodium Succinate', 'Corticosteroid', 'Injection', '100mg', 'mg', true),
(gen_random_uuid(), 'Betamethasone', 'Betamethasone', 'Corticosteroid', 'Tablet', '0.5mg', 'mg', true),
(gen_random_uuid(), 'Methylprednisolone', 'Methylprednisolone', 'Corticosteroid', 'Injection', '40mg', 'mg', true),
(gen_random_uuid(), 'Methylprednisolone', 'Methylprednisolone', 'Corticosteroid', 'Injection', '125mg', 'mg', true),

-- Neurological / Psychiatric
(gen_random_uuid(), 'Phenytoin', 'Phenytoin Sodium', 'Anticonvulsant', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Phenytoin', 'Phenytoin Sodium', 'Anticonvulsant', 'Injection', '50mg/ml', 'mg', true),
(gen_random_uuid(), 'Carbamazepine', 'Carbamazepine', 'Anticonvulsant', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Carbamazepine', 'Carbamazepine', 'Anticonvulsant', 'Tablet', '400mg', 'mg', true),
(gen_random_uuid(), 'Sodium Valproate', 'Valproic Acid', 'Anticonvulsant', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Sodium Valproate', 'Valproic Acid', 'Anticonvulsant', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Levetiracetam', 'Levetiracetam', 'Anticonvulsant', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Levetiracetam', 'Levetiracetam', 'Anticonvulsant', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Amitriptyline', 'Amitriptyline HCl', 'Antidepressant', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Amitriptyline', 'Amitriptyline HCl', 'Antidepressant', 'Tablet', '25mg', 'mg', true),
(gen_random_uuid(), 'Sertraline', 'Sertraline HCl', 'Antidepressant', 'Tablet', '25mg', 'mg', true),
(gen_random_uuid(), 'Sertraline', 'Sertraline HCl', 'Antidepressant', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Escitalopram', 'Escitalopram Oxalate', 'Antidepressant', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Diazepam', 'Diazepam', 'Anxiolytic', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Diazepam', 'Diazepam', 'Anxiolytic', 'Injection', '5mg/ml', 'mg', true),
(gen_random_uuid(), 'Clonazepam', 'Clonazepam', 'Anticonvulsant', 'Tablet', '0.5mg', 'mg', true),
(gen_random_uuid(), 'Clonazepam', 'Clonazepam', 'Anticonvulsant', 'Tablet', '1mg', 'mg', true),
(gen_random_uuid(), 'Alprazolam', 'Alprazolam', 'Anxiolytic', 'Tablet', '0.25mg', 'mg', true),
(gen_random_uuid(), 'Zolpidem', 'Zolpidem Tartrate', 'Sedative', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Zolpidem', 'Zolpidem Tartrate', 'Sedative', 'Tablet', '10mg', 'mg', true),
(gen_random_uuid(), 'Haloperidol', 'Haloperidol', 'Antipsychotic', 'Tablet', '1.5mg', 'mg', true),
(gen_random_uuid(), 'Haloperidol', 'Haloperidol', 'Antipsychotic', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Haloperidol', 'Haloperidol', 'Antipsychotic', 'Injection', '5mg/ml', 'mg', true),

-- Antiparasitics / Antifungals
(gen_random_uuid(), 'Albendazole', 'Albendazole', 'Antiparasitic', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Albendazole', 'Albendazole', 'Antiparasitic', 'Tablet', '400mg', 'mg', true),
(gen_random_uuid(), 'Mebendazole', 'Mebendazole', 'Antiparasitic', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Ivermectin', 'Ivermectin', 'Antiparasitic', 'Tablet', '3mg', 'mg', true),
(gen_random_uuid(), 'Ivermectin', 'Ivermectin', 'Antiparasitic', 'Tablet', '6mg', 'mg', true),
(gen_random_uuid(), 'Fluconazole', 'Fluconazole', 'Antifungal', 'Capsule', '50mg', 'mg', true),
(gen_random_uuid(), 'Fluconazole', 'Fluconazole', 'Antifungal', 'Capsule', '150mg', 'mg', true),
(gen_random_uuid(), 'Fluconazole', 'Fluconazole', 'Antifungal', 'Injection', '200mg/100ml', 'mg', true),
(gen_random_uuid(), 'Clotrimazole', 'Clotrimazole', 'Antifungal', 'Cream', '1%', '%', true),
(gen_random_uuid(), 'Itraconazole', 'Itraconazole', 'Antifungal', 'Capsule', '100mg', 'mg', true),
(gen_random_uuid(), 'Chloroquine', 'Chloroquine Phosphate', 'Antimalarial', 'Tablet', '250mg', 'mg', true),
(gen_random_uuid(), 'Artemether + Lumefantrine', NULL, 'Antimalarial', 'Tablet', '80mg+480mg', 'mg', true),

-- Emergency / Critical Care
(gen_random_uuid(), 'Adrenaline (Epinephrine)', 'Epinephrine', 'Emergency', 'Injection', '1mg/ml', 'mg', true),
(gen_random_uuid(), 'Atropine', 'Atropine Sulphate', 'Emergency', 'Injection', '0.6mg/ml', 'mg', true),
(gen_random_uuid(), 'Dopamine', 'Dopamine HCl', 'Vasopressor', 'Injection', '40mg/ml', 'mg', true),
(gen_random_uuid(), 'Dobutamine', 'Dobutamine HCl', 'Vasopressor', 'Injection', '250mg/20ml', 'mg', true),
(gen_random_uuid(), 'Noradrenaline', 'Norepinephrine Bitartrate', 'Vasopressor', 'Injection', '4mg/4ml', 'mg', true),
(gen_random_uuid(), 'Morphine', 'Morphine Sulphate', 'Opioid Analgesic', 'Injection', '10mg/ml', 'mg', true),
(gen_random_uuid(), 'Midazolam', 'Midazolam HCl', 'Sedative', 'Injection', '5mg/ml', 'mg', true),
(gen_random_uuid(), 'Ketamine', 'Ketamine HCl', 'Anaesthetic', 'Injection', '500mg/10ml', 'mg', true),
(gen_random_uuid(), 'Propofol', 'Propofol', 'Anaesthetic', 'Injection', '200mg/20ml', 'mg', true),
(gen_random_uuid(), 'Sodium Bicarbonate', 'Sodium Bicarbonate', 'Emergency', 'Injection', '7.5%', '%', true),
(gen_random_uuid(), 'Calcium Gluconate', 'Calcium Gluconate', 'Emergency', 'Injection', '10%', '%', true),
(gen_random_uuid(), 'Potassium Chloride', 'Potassium Chloride', 'Electrolyte', 'Injection', '150mg/ml', 'mg', true),
(gen_random_uuid(), 'Magnesium Sulphate', 'Magnesium Sulphate', 'Anticonvulsant', 'Injection', '50%', '%', true),

-- IV Fluids
(gen_random_uuid(), 'Normal Saline 0.9%', 'Sodium Chloride', 'IV Fluid', 'Infusion', '0.9%', 'ml', true),
(gen_random_uuid(), 'Normal Saline 0.9% 500ml', 'Sodium Chloride', 'IV Fluid', 'Infusion', '500ml', 'ml', true),
(gen_random_uuid(), 'Normal Saline 0.9% 1000ml', 'Sodium Chloride', 'IV Fluid', 'Infusion', '1000ml', 'ml', true),
(gen_random_uuid(), 'Ringer''s Lactate 500ml', 'Lactated Ringer''s', 'IV Fluid', 'Infusion', '500ml', 'ml', true),
(gen_random_uuid(), 'Ringer''s Lactate 1000ml', 'Lactated Ringer''s', 'IV Fluid', 'Infusion', '1000ml', 'ml', true),
(gen_random_uuid(), 'Dextrose 5% 500ml', 'Glucose', 'IV Fluid', 'Infusion', '500ml', 'ml', true),
(gen_random_uuid(), 'Dextrose 5% 1000ml', 'Glucose', 'IV Fluid', 'Infusion', '1000ml', 'ml', true),
(gen_random_uuid(), 'Dextrose 10% 500ml', 'Glucose', 'IV Fluid', 'Infusion', '500ml', 'ml', true),
(gen_random_uuid(), 'Dextrose-NaCl (DNS) 500ml', 'Dextrose + Sodium Chloride', 'IV Fluid', 'Infusion', '500ml', 'ml', true),
(gen_random_uuid(), 'Mannitol 20%', 'Mannitol', 'Diuretic', 'Infusion', '20%', '%', true),

-- Topical / Dermatology
(gen_random_uuid(), 'Hydrocortisone Cream', 'Hydrocortisone', 'Dermatology', 'Cream', '1%', '%', true),
(gen_random_uuid(), 'Betamethasone Cream', 'Betamethasone Valerate', 'Dermatology', 'Cream', '0.1%', '%', true),
(gen_random_uuid(), 'Mupirocin Ointment', 'Mupirocin', 'Dermatology', 'Ointment', '2%', '%', true),
(gen_random_uuid(), 'Silver Sulfadiazine Cream', 'Silver Sulfadiazine', 'Dermatology', 'Cream', '1%', '%', true),
(gen_random_uuid(), 'Clotrimazole + Betamethasone Cream', NULL, 'Dermatology', 'Cream', '1%+0.05%', '%', true),
(gen_random_uuid(), 'Calamine Lotion', 'Calamine', 'Dermatology', 'Lotion', NULL, 'ml', true),
(gen_random_uuid(), 'Povidone Iodine Solution', 'Povidone Iodine', 'Antiseptic', 'Solution', '10%', '%', true),
(gen_random_uuid(), 'Povidone Iodine Ointment', 'Povidone Iodine', 'Antiseptic', 'Ointment', '5%', '%', true),

-- Eye / ENT
(gen_random_uuid(), 'Ciprofloxacin Eye Drops', 'Ciprofloxacin HCl', 'Ophthalmic', 'Eye Drops', '0.3%', '%', true),
(gen_random_uuid(), 'Tobramycin Eye Drops', 'Tobramycin', 'Ophthalmic', 'Eye Drops', '0.3%', '%', true),
(gen_random_uuid(), 'Prednisolone Eye Drops', 'Prednisolone Acetate', 'Ophthalmic', 'Eye Drops', '1%', '%', true),
(gen_random_uuid(), 'Timolol Eye Drops', 'Timolol Maleate', 'Ophthalmic', 'Eye Drops', '0.5%', '%', true),
(gen_random_uuid(), 'Artificial Tears', 'Hydroxypropyl Methylcellulose', 'Ophthalmic', 'Eye Drops', '0.3%', '%', true),
(gen_random_uuid(), 'Xylometazoline Nasal Spray', 'Xylometazoline HCl', 'Nasal Decongestant', 'Nasal Spray', '0.1%', '%', true),
(gen_random_uuid(), 'Beclomethasone Nasal Spray', 'Beclomethasone Dipropionate', 'Nasal Spray', 'Nasal Spray', '50mcg/dose', 'mcg', true),

-- Urology / Others
(gen_random_uuid(), 'Tamsulosin', 'Tamsulosin HCl', 'Alpha Blocker', 'Capsule', '0.4mg', 'mg', true),
(gen_random_uuid(), 'Finasteride', 'Finasteride', 'Antiandrogenic', 'Tablet', '5mg', 'mg', true),
(gen_random_uuid(), 'Sildenafil', 'Sildenafil Citrate', 'PDE5 Inhibitor', 'Tablet', '50mg', 'mg', true),
(gen_random_uuid(), 'Acyclovir', 'Acyclovir', 'Antiviral', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Acyclovir', 'Acyclovir', 'Antiviral', 'Tablet', '400mg', 'mg', true),
(gen_random_uuid(), 'Acyclovir Cream', 'Acyclovir', 'Antiviral', 'Cream', '5%', '%', true),
(gen_random_uuid(), 'Oseltamivir', 'Oseltamivir Phosphate', 'Antiviral', 'Capsule', '75mg', 'mg', true),
(gen_random_uuid(), 'Hydroxychloroquine', 'Hydroxychloroquine Sulphate', 'Antimalarial', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Colchicine', 'Colchicine', 'Antigout', 'Tablet', '0.5mg', 'mg', true),
(gen_random_uuid(), 'Allopurinol', 'Allopurinol', 'Antigout', 'Tablet', '100mg', 'mg', true),
(gen_random_uuid(), 'Allopurinol', 'Allopurinol', 'Antigout', 'Tablet', '300mg', 'mg', true),
(gen_random_uuid(), 'Oxytocin', 'Oxytocin', 'Uterotonic', 'Injection', '5IU/ml', 'IU', true),
(gen_random_uuid(), 'Methylergometrine', 'Methylergometrine Maleate', 'Uterotonic', 'Injection', '0.2mg/ml', 'mg', true),
(gen_random_uuid(), 'Tranexamic Acid', 'Tranexamic Acid', 'Haemostatic', 'Tablet', '500mg', 'mg', true),
(gen_random_uuid(), 'Tranexamic Acid', 'Tranexamic Acid', 'Haemostatic', 'Injection', '500mg/5ml', 'mg', true),
(gen_random_uuid(), 'Vitamin K (Phytomenadione)', 'Phytomenadione', 'Vitamin', 'Injection', '10mg/ml', 'mg', true),
(gen_random_uuid(), 'Adenosine', 'Adenosine', 'Antiarrhythmic', 'Injection', '6mg/2ml', 'mg', true),
(gen_random_uuid(), 'Amiodarone', 'Amiodarone HCl', 'Antiarrhythmic', 'Tablet', '200mg', 'mg', true),
(gen_random_uuid(), 'Amiodarone', 'Amiodarone HCl', 'Antiarrhythmic', 'Injection', '150mg/3ml', 'mg', true),
(gen_random_uuid(), 'Urokinase', 'Urokinase', 'Thrombolytic', 'Injection', '25000IU', 'IU', true),
(gen_random_uuid(), 'Ranitidine Injection', 'Ranitidine HCl', 'Antacid', 'Injection', '50mg/2ml', 'mg', true),
(gen_random_uuid(), 'Dextrose 25%', 'Glucose', 'IV Fluid', 'Injection', '25%', '%', true),
(gen_random_uuid(), 'Dextrose 50%', 'Glucose', 'IV Fluid', 'Injection', '50%', '%', true),
(gen_random_uuid(), 'Albumin 20%', 'Human Albumin', 'Plasma Expander', 'Infusion', '20%', '%', true),
(gen_random_uuid(), 'Hetastarch 6%', 'Hydroxyethyl Starch', 'Plasma Expander', 'Infusion', '6%', '%', true);
