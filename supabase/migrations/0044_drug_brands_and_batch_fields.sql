-- Migration 0044: drug_brands catalog + enhanced drug_batches (GRN fields)

-- ── 1. Enhance drug_master ───────────────────────────────────────────────────
ALTER TABLE drug_master
  ADD COLUMN IF NOT EXISTS schedule              text,
  ADD COLUMN IF NOT EXISTS atc_code             text,
  ADD COLUMN IF NOT EXISTS pharmacological_class text;

UPDATE drug_master SET schedule='OTC' WHERE name IN ('Paracetamol','Ibuprofen','Aspirin','Cetirizine','Loratadine');
UPDATE drug_master SET schedule='H'   WHERE schedule IS NULL AND category IN ('Antibiotic','Antidiabetic','Antihypertensive','Beta Blocker','Statin','Anticonvulsant','Antidepressant','Antifungal','Antiviral','Antiasthmatic','Thyroid','Antiemetic');
UPDATE drug_master SET schedule='H1'  WHERE name IN ('Ciprofloxacin','Levofloxacin','Meropenem','Piperacillin + Tazobactam','Ceftriaxone','Cefuroxime','Vancomycin','Amikacin');
UPDATE drug_master SET schedule='X'   WHERE name IN ('Morphine','Midazolam','Diazepam','Alprazolam','Clonazepam','Tramadol','Ketamine','Buprenorphine');
UPDATE drug_master SET schedule='G'   WHERE category IN ('Thyroid','Corticosteroid');
UPDATE drug_master SET schedule='OTC' WHERE schedule IS NULL;

-- ── 2. Create drug_brands table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drug_brands (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_master_id uuid    REFERENCES drug_master(id),
  brand_name     text    NOT NULL,
  manufacturer   text    NOT NULL,
  hsn_code       text    NOT NULL DEFAULT '30049099',
  gst_rate       numeric(5,2) NOT NULL DEFAULT 12.00,
  pack_size      int     NOT NULL DEFAULT 1,
  pack_unit      text    NOT NULL DEFAULT 'strip',
  mrp_per_pack   numeric,
  is_active      boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_drug_brands_master ON drug_brands (drug_master_id);
CREATE INDEX IF NOT EXISTS idx_drug_brands_name   ON drug_brands (brand_name text_pattern_ops);
ALTER TABLE drug_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drug_brands_read" ON drug_brands FOR SELECT USING (auth.role() = 'authenticated');

-- ── 3. Enhance drug_batches ──────────────────────────────────────────────────
ALTER TABLE drug_batches
  ADD COLUMN IF NOT EXISTS drug_brand_id       uuid REFERENCES drug_brands(id),
  ADD COLUMN IF NOT EXISTS brand_name          text,
  ADD COLUMN IF NOT EXISTS manufacturer        text,
  ADD COLUMN IF NOT EXISTS pack_size           int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pack_unit           text DEFAULT 'strip',
  ADD COLUMN IF NOT EXISTS mfg_date            date,
  ADD COLUMN IF NOT EXISTS hsn_code            text DEFAULT '30049099',
  ADD COLUMN IF NOT EXISTS gst_rate            numeric(5,2) DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS supplier_name       text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_no text,
  ADD COLUMN IF NOT EXISTS purchase_date       date;

-- ── 4. Seed drug_brands (individual INSERT...SELECT — no UNION ALL) ──────────

-- Paracetamol 500mg Tablet
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dolo 500','Micro Labs Ltd','30049099',12,10,'strip',27 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Crocin 500','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,10,'strip',28 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Calpol 500','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,10,'strip',29 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'P-500','Cipla Ltd','30049099',12,10,'strip',26 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pacimol 500','IPCA Laboratories Ltd','30049099',12,10,'strip',26 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Metacin 500','Macleods Pharmaceuticals Ltd','30049099',12,10,'strip',25 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pyrigesic 500','East India Pharmaceutical Works Ltd','30049099',12,10,'strip',24 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dolopar 500','Wockhardt Ltd','30049099',12,10,'strip',25 FROM drug_master WHERE name='Paracetamol' AND strength='500mg' AND form='Tablet' LIMIT 1;

-- Paracetamol 650mg Tablet
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dolo 650','Micro Labs Ltd','30049099',12,15,'strip',31 FROM drug_master WHERE name='Paracetamol' AND strength='650mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Crocin 650','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,15,'strip',34 FROM drug_master WHERE name='Paracetamol' AND strength='650mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Calpol 650','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,15,'strip',35 FROM drug_master WHERE name='Paracetamol' AND strength='650mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pacimol 650','IPCA Laboratories Ltd','30049099',12,10,'strip',28 FROM drug_master WHERE name='Paracetamol' AND strength='650mg' AND form='Tablet' LIMIT 1;

-- Paracetamol Syrup 125mg/5ml
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Crocin Syrup','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,60,'bottle',45 FROM drug_master WHERE name='Paracetamol' AND strength='125mg/5ml' AND form='Syrup' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Calpol Syrup','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,60,'bottle',48 FROM drug_master WHERE name='Paracetamol' AND strength='125mg/5ml' AND form='Syrup' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pyrigesic Syrup','East India Pharmaceutical Works Ltd','30049099',12,60,'bottle',38 FROM drug_master WHERE name='Paracetamol' AND strength='125mg/5ml' AND form='Syrup' LIMIT 1;

-- Ibuprofen 400mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Brufen 400','Abbott India Ltd','30049099',12,10,'strip',31 FROM drug_master WHERE name='Ibuprofen' AND strength='400mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ibugesic 400','Cipla Ltd','30049099',12,10,'strip',29 FROM drug_master WHERE name='Ibuprofen' AND strength='400mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Advil 400','Pfizer Ltd','30049099',12,10,'strip',35 FROM drug_master WHERE name='Ibuprofen' AND strength='400mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Emflam 400','Elder Pharmaceuticals Ltd','30049099',12,10,'strip',28 FROM drug_master WHERE name='Ibuprofen' AND strength='400mg' AND form='Tablet' LIMIT 1;

-- Diclofenac 50mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Voveran 50','Novartis India Ltd','30049099',12,10,'strip',32 FROM drug_master WHERE name='Diclofenac' AND strength='50mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dynapar 50','Troikaa Pharmaceuticals Ltd','30049099',12,10,'strip',28 FROM drug_master WHERE name='Diclofenac' AND strength='50mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Voltaren 50','Novartis India Ltd','30049099',12,10,'strip',33 FROM drug_master WHERE name='Diclofenac' AND strength='50mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dicloran 50','Torrent Pharmaceuticals Ltd','30049099',12,10,'strip',26 FROM drug_master WHERE name='Diclofenac' AND strength='50mg' AND form='Tablet' LIMIT 1;

-- Nimesulide 100mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Nicip 100','Cipla Ltd','30049099',12,10,'strip',22 FROM drug_master WHERE name='Nimesulide' AND strength='100mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Nimulid 100','Panacea Biotec Ltd','30049099',12,10,'strip',23 FROM drug_master WHERE name='Nimesulide' AND strength='100mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Nims 100','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',21 FROM drug_master WHERE name='Nimesulide' AND strength='100mg' AND form='Tablet' LIMIT 1;

-- Aspirin 75mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ecosprin 75','USV Ltd','30049099',12,14,'strip',18 FROM drug_master WHERE name='Aspirin' AND strength='75mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Disprin 75','Reckitt Benckiser Healthcare Ltd','30049099',12,10,'strip',22 FROM drug_master WHERE name='Aspirin' AND strength='75mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Aspenter 75','Micro Labs Ltd','30049099',12,14,'strip',17 FROM drug_master WHERE name='Aspirin' AND strength='75mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Loprin 75','Sun Pharmaceutical Industries Ltd','30049099',12,14,'strip',18 FROM drug_master WHERE name='Aspirin' AND strength='75mg' AND form='Tablet' LIMIT 1;

-- Amoxicillin 500mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Mox 500','Sun Pharmaceutical Industries Ltd','30041011',12,10,'strip',55 FROM drug_master WHERE name='Amoxicillin' AND strength='500mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Novamox 500','Cipla Ltd','30041011',12,10,'strip',52 FROM drug_master WHERE name='Amoxicillin' AND strength='500mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Amoxil 500','GlaxoSmithKline Pharmaceuticals Ltd','30041011',12,10,'strip',60 FROM drug_master WHERE name='Amoxicillin' AND strength='500mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Wymox 500','Pfizer Ltd','30041011',12,10,'strip',58 FROM drug_master WHERE name='Amoxicillin' AND strength='500mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Amolin 500','Alkem Laboratories Ltd','30041011',12,10,'strip',50 FROM drug_master WHERE name='Amoxicillin' AND strength='500mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Largopen 500','Lupin Ltd','30041011',12,10,'strip',48 FROM drug_master WHERE name='Amoxicillin' AND strength='500mg' AND form='Capsule' LIMIT 1;

-- Amoxicillin + Clavulanic Acid 625mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Augmentin 625','GlaxoSmithKline Pharmaceuticals Ltd','30041011',12,6,'strip',210 FROM drug_master WHERE name='Amoxicillin + Clavulanic Acid' AND strength='625mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Clavam 625','Alkem Laboratories Ltd','30041011',12,6,'strip',190 FROM drug_master WHERE name='Amoxicillin + Clavulanic Acid' AND strength='625mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Mox CV 625','Sun Pharmaceutical Industries Ltd','30041011',12,6,'strip',185 FROM drug_master WHERE name='Amoxicillin + Clavulanic Acid' AND strength='625mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Novamox CV 625','Cipla Ltd','30041011',12,6,'strip',188 FROM drug_master WHERE name='Amoxicillin + Clavulanic Acid' AND strength='625mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Amoxyclav 625','Ranbaxy Laboratories Ltd','30041011',12,6,'strip',182 FROM drug_master WHERE name='Amoxicillin + Clavulanic Acid' AND strength='625mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Clavamet 625','FDC Ltd','30041011',12,6,'strip',175 FROM drug_master WHERE name='Amoxicillin + Clavulanic Acid' AND strength='625mg' AND form='Tablet' LIMIT 1;

-- Azithromycin 500mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Azee 500','Cipla Ltd','30049099',12,3,'strip',108 FROM drug_master WHERE name='Azithromycin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Azithral 500','Alembic Pharmaceuticals Ltd','30049099',12,3,'strip',112 FROM drug_master WHERE name='Azithromycin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zithromax 500','Pfizer Ltd','30049099',12,3,'strip',135 FROM drug_master WHERE name='Azithromycin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Aziwin 500','Intas Pharmaceuticals Ltd','30049099',12,3,'strip',103 FROM drug_master WHERE name='Azithromycin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Atm 500','Alkem Laboratories Ltd','30049099',12,3,'strip',100 FROM drug_master WHERE name='Azithromycin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zady 500','Lupin Ltd','30049099',12,3,'strip',102 FROM drug_master WHERE name='Azithromycin' AND strength='500mg' AND form='Tablet' LIMIT 1;

-- Ciprofloxacin 500mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cifran 500','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',85 FROM drug_master WHERE name='Ciprofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ciplox 500','Cipla Ltd','30049099',12,10,'strip',88 FROM drug_master WHERE name='Ciprofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zoxan 500','Dr. Reddy''s Laboratories Ltd','30049099',12,10,'strip',82 FROM drug_master WHERE name='Ciprofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ciprobid 500','Cadila Healthcare Ltd (Zydus)','30049099',12,10,'strip',80 FROM drug_master WHERE name='Ciprofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;

-- Metronidazole 400mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Flagyl 400','Abbott India Ltd','30049099',12,15,'strip',38 FROM drug_master WHERE name='Metronidazole' AND strength='400mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Metrogyl 400','J.B. Chemicals & Pharma Ltd','30049099',12,15,'strip',35 FROM drug_master WHERE name='Metronidazole' AND strength='400mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Metron 400','Cipla Ltd','30049099',12,15,'strip',34 FROM drug_master WHERE name='Metronidazole' AND strength='400mg' AND form='Tablet' LIMIT 1;

-- Doxycycline 100mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Doxt 100','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',65 FROM drug_master WHERE name='Doxycycline' AND strength='100mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Doxy 1','Cipla Ltd','30049099',12,10,'strip',68 FROM drug_master WHERE name='Doxycycline' AND strength='100mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Microdox 100','Micro Labs Ltd','30049099',12,10,'strip',60 FROM drug_master WHERE name='Doxycycline' AND strength='100mg' AND form='Capsule' LIMIT 1;

-- Cefixime 200mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Taxim-O 200','Alkem Laboratories Ltd','30049099',12,10,'strip',145 FROM drug_master WHERE name='Cefixime' AND strength='200mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cefspan 200','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',140 FROM drug_master WHERE name='Cefixime' AND strength='200mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zifi 200','FDC Ltd','30049099',12,10,'strip',138 FROM drug_master WHERE name='Cefixime' AND strength='200mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Topcef 200','Torrent Pharmaceuticals Ltd','30049099',12,10,'strip',130 FROM drug_master WHERE name='Cefixime' AND strength='200mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Xim 200','Cipla Ltd','30049099',12,10,'strip',132 FROM drug_master WHERE name='Cefixime' AND strength='200mg' AND form='Tablet' LIMIT 1;

-- Ceftriaxone 1g Injection
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Monocef 1g','Aristo Pharmaceuticals Pvt Ltd','30049099',12,1,'vial',110 FROM drug_master WHERE name='Ceftriaxone' AND strength='1g' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Oframax 1g','Torrent Pharmaceuticals Ltd','30049099',12,1,'vial',105 FROM drug_master WHERE name='Ceftriaxone' AND strength='1g' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Rocephin 1g','Roche Products (India) Pvt Ltd','30049099',12,1,'vial',185 FROM drug_master WHERE name='Ceftriaxone' AND strength='1g' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cefozone 1g','Sun Pharmaceutical Industries Ltd','30049099',12,1,'vial',102 FROM drug_master WHERE name='Ceftriaxone' AND strength='1g' AND form='Injection' LIMIT 1;

-- Levofloxacin 500mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Levoflox 500','Cipla Ltd','30049099',12,5,'strip',88 FROM drug_master WHERE name='Levofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Loxof 500','Sun Pharmaceutical Industries Ltd','30049099',12,5,'strip',82 FROM drug_master WHERE name='Levofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Glevo 500','Glenmark Pharmaceuticals Ltd','30049099',12,5,'strip',80 FROM drug_master WHERE name='Levofloxacin' AND strength='500mg' AND form='Tablet' LIMIT 1;

-- Meropenem 500mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Meronem 500','AstraZeneca India Pvt Ltd','30049099',12,1,'vial',520 FROM drug_master WHERE name='Meropenem' AND strength='500mg' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Merotrol 500','Cipla Ltd','30049099',12,1,'vial',485 FROM drug_master WHERE name='Meropenem' AND strength='500mg' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Meromer 500','Lupin Ltd','30049099',12,1,'vial',490 FROM drug_master WHERE name='Meropenem' AND strength='500mg' AND form='Injection' LIMIT 1;

-- Omeprazole 20mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Omez 20','Dr. Reddy''s Laboratories Ltd','30049099',12,10,'strip',48 FROM drug_master WHERE name='Omeprazole' AND strength='20mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ocid 20','Cipla Ltd','30049099',12,10,'strip',46 FROM drug_master WHERE name='Omeprazole' AND strength='20mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Lomac 20','Lupin Ltd','30049099',12,10,'strip',44 FROM drug_master WHERE name='Omeprazole' AND strength='20mg' AND form='Capsule' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Omepure 20','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',40 FROM drug_master WHERE name='Omeprazole' AND strength='20mg' AND form='Capsule' LIMIT 1;

-- Pantoprazole 40mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pan 40','Alkem Laboratories Ltd','30049099',12,10,'strip',55 FROM drug_master WHERE name='Pantoprazole' AND strength='40mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pantocid 40','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',58 FROM drug_master WHERE name='Pantoprazole' AND strength='40mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Nexpro 40','Torrent Pharmaceuticals Ltd','30049099',12,10,'strip',56 FROM drug_master WHERE name='Pantoprazole' AND strength='40mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pantodac 40','Cadila Healthcare Ltd (Zydus)','30049099',12,10,'strip',52 FROM drug_master WHERE name='Pantoprazole' AND strength='40mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pansa 40','Intas Pharmaceuticals Ltd','30049099',12,10,'strip',50 FROM drug_master WHERE name='Pantoprazole' AND strength='40mg' AND form='Tablet' LIMIT 1;

-- Domperidone 10mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Domstal 10','Torrent Pharmaceuticals Ltd','30049099',12,15,'strip',42 FROM drug_master WHERE name='Domperidone' AND strength='10mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Vomistop 10','Cipla Ltd','30049099',12,15,'strip',40 FROM drug_master WHERE name='Domperidone' AND strength='10mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Motilium 10','Janssen Pharmaceuticals','30049099',12,15,'strip',48 FROM drug_master WHERE name='Domperidone' AND strength='10mg' AND form='Tablet' LIMIT 1;

-- Ondansetron 4mg Tablet
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Emeset 4','Cipla Ltd','30049099',12,10,'strip',62 FROM drug_master WHERE name='Ondansetron' AND strength='4mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ondem 4','Alkem Laboratories Ltd','30049099',12,10,'strip',60 FROM drug_master WHERE name='Ondansetron' AND strength='4mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zofran 4','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,10,'strip',72 FROM drug_master WHERE name='Ondansetron' AND strength='4mg' AND form='Tablet' LIMIT 1;

-- Ondansetron Injection
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Emeset Injection','Cipla Ltd','30049099',12,1,'ampoule',38 FROM drug_master WHERE name='Ondansetron' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ondem Injection','Alkem Laboratories Ltd','30049099',12,1,'ampoule',36 FROM drug_master WHERE name='Ondansetron' AND form='Injection' LIMIT 1;

-- Ranitidine 150mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Rantac 150','J.B. Chemicals & Pharma Ltd','30049099',12,30,'strip',45 FROM drug_master WHERE name='Ranitidine' AND strength='150mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zinetac 150','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,30,'strip',48 FROM drug_master WHERE name='Ranitidine' AND strength='150mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Aciloc 150','Cadila Healthcare Ltd (Zydus)','30049099',12,30,'strip',42 FROM drug_master WHERE name='Ranitidine' AND strength='150mg' LIMIT 1;

-- Amlodipine 5mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Stamlo 5','Dr. Reddy''s Laboratories Ltd','30049099',12,10,'strip',42 FROM drug_master WHERE name='Amlodipine' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Amlovas 5','Micro Labs Ltd','30049099',12,10,'strip',38 FROM drug_master WHERE name='Amlodipine' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Norvasc 5','Pfizer Ltd','30049099',12,10,'strip',65 FROM drug_master WHERE name='Amlodipine' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Amlokind 5','Mankind Pharma Ltd','30049099',12,10,'strip',35 FROM drug_master WHERE name='Amlodipine' AND strength='5mg' LIMIT 1;

-- Atenolol 50mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Tenormin 50','AstraZeneca India Pvt Ltd','30049099',12,14,'strip',52 FROM drug_master WHERE name='Atenolol' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Aten 50','Cadila Healthcare Ltd (Zydus)','30049099',12,14,'strip',45 FROM drug_master WHERE name='Atenolol' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Betacard 50','Torrent Pharmaceuticals Ltd','30049099',12,14,'strip',42 FROM drug_master WHERE name='Atenolol' AND strength='50mg' LIMIT 1;

-- Losartan 50mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Losar 50','Cipla Ltd','30049099',12,10,'strip',58 FROM drug_master WHERE name='Losartan' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Repace 50','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',55 FROM drug_master WHERE name='Losartan' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cozaar 50','Merck Sharp & Dohme India','30049099',12,10,'strip',88 FROM drug_master WHERE name='Losartan' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Covance 50','Glenmark Pharmaceuticals Ltd','30049099',12,10,'strip',52 FROM drug_master WHERE name='Losartan' AND strength='50mg' LIMIT 1;

-- Ramipril 5mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cardace 5','Sanofi India Ltd','30049099',12,10,'strip',65 FROM drug_master WHERE name='Ramipril' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ramistar 5','Lupin Ltd','30049099',12,10,'strip',60 FROM drug_master WHERE name='Ramipril' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Hopace 5','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',55 FROM drug_master WHERE name='Ramipril' AND strength='5mg' LIMIT 1;

-- Atorvastatin 20mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Atorva 20','Cadila Healthcare Ltd (Zydus)','30049099',12,10,'strip',72 FROM drug_master WHERE name='Atorvastatin' AND strength='20mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Tonact 20','Lupin Ltd','30049099',12,10,'strip',68 FROM drug_master WHERE name='Atorvastatin' AND strength='20mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Storvas 20','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',65 FROM drug_master WHERE name='Atorvastatin' AND strength='20mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Lipicure 20','IPCA Laboratories Ltd','30049099',12,10,'strip',62 FROM drug_master WHERE name='Atorvastatin' AND strength='20mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Lipitor 20','Pfizer Ltd','30049099',12,10,'strip',125 FROM drug_master WHERE name='Atorvastatin' AND strength='20mg' LIMIT 1;

-- Rosuvastatin 10mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Crestor 10','AstraZeneca India Pvt Ltd','30049099',12,10,'strip',128 FROM drug_master WHERE name='Rosuvastatin' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Rosuvas 10','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',95 FROM drug_master WHERE name='Rosuvastatin' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Rozat 10','Torrent Pharmaceuticals Ltd','30049099',12,10,'strip',88 FROM drug_master WHERE name='Rosuvastatin' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Roseday 10','Dr. Reddy''s Laboratories Ltd','30049099',12,10,'strip',92 FROM drug_master WHERE name='Rosuvastatin' AND strength='10mg' LIMIT 1;

-- Clopidogrel 75mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Plavix 75','Sanofi India Ltd','30049099',12,10,'strip',145 FROM drug_master WHERE name='Clopidogrel' AND strength='75mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Deplatt 75','Torrent Pharmaceuticals Ltd','30049099',12,10,'strip',125 FROM drug_master WHERE name='Clopidogrel' AND strength='75mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Clopitab 75','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',118 FROM drug_master WHERE name='Clopidogrel' AND strength='75mg' LIMIT 1;

-- Furosemide 40mg tablet
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Lasix 40','Sanofi India Ltd','30049099',12,15,'strip',22 FROM drug_master WHERE name='Furosemide' AND strength='40mg' AND form='Tablet' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Frusenex 40','Merck Ltd (India)','30049099',12,15,'strip',20 FROM drug_master WHERE name='Furosemide' AND strength='40mg' AND form='Tablet' LIMIT 1;

-- Bisoprolol 5mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Concor 5','Merck Ltd (India)','30049099',12,10,'strip',88 FROM drug_master WHERE name='Bisoprolol' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Corbis 5','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',72 FROM drug_master WHERE name='Bisoprolol' AND strength='5mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Bisocard 5','Lupin Ltd','30049099',12,10,'strip',68 FROM drug_master WHERE name='Bisoprolol' AND strength='5mg' LIMIT 1;

-- Metformin 500mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Glyciphage 500','Franco-Indian Pharmaceuticals Ltd','30043011',12,20,'strip',32 FROM drug_master WHERE name='Metformin' AND strength='500mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Glucophage 500','Merck Ltd (India)','30043011',12,20,'strip',38 FROM drug_master WHERE name='Metformin' AND strength='500mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Obimet 500','Alkem Laboratories Ltd','30043011',12,20,'strip',30 FROM drug_master WHERE name='Metformin' AND strength='500mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Gluformin 500','Sun Pharmaceutical Industries Ltd','30043011',12,20,'strip',28 FROM drug_master WHERE name='Metformin' AND strength='500mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Walaphage 500','Wockhardt Ltd','30043011',12,20,'strip',26 FROM drug_master WHERE name='Metformin' AND strength='500mg' LIMIT 1;

-- Glimepiride 2mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Amaryl 2','Sanofi India Ltd','30049099',12,30,'strip',95 FROM drug_master WHERE name='Glimepiride' AND strength='2mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Glimy 2','Mankind Pharma Ltd','30049099',12,30,'strip',75 FROM drug_master WHERE name='Glimepiride' AND strength='2mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Glimisave 2','Micro Labs Ltd','30049099',12,30,'strip',72 FROM drug_master WHERE name='Glimepiride' AND strength='2mg' LIMIT 1;

-- Sitagliptin 50mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Januvia 50','Merck Sharp & Dohme India','30049099',12,14,'strip',285 FROM drug_master WHERE name='Sitagliptin' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Sitanorm 50','Sun Pharmaceutical Industries Ltd','30049099',12,14,'strip',245 FROM drug_master WHERE name='Sitagliptin' AND strength='50mg' LIMIT 1;

-- Insulin Regular
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Actrapid','Novo Nordisk India Pvt Ltd','30043011',5,1,'vial',285 FROM drug_master WHERE name='Insulin Regular' AND strength='100IU/ml' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Huminsulin R','Eli Lilly and Company India Pvt Ltd','30043011',5,1,'vial',278 FROM drug_master WHERE name='Insulin Regular' AND strength='100IU/ml' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Wosulin R','Wockhardt Ltd','30043011',5,1,'vial',265 FROM drug_master WHERE name='Insulin Regular' AND strength='100IU/ml' LIMIT 1;

-- Insulin Glargine
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Lantus','Sanofi India Ltd','30043011',5,1,'vial',1250 FROM drug_master WHERE name='Insulin Glargine' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Glaritus','Wockhardt Ltd','30043011',5,1,'vial',1100 FROM drug_master WHERE name='Insulin Glargine' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Basalog','Biocon Ltd','30043011',5,1,'vial',980 FROM drug_master WHERE name='Insulin Glargine' LIMIT 1;

-- Salbutamol Inhaler
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Asthalin Inhaler','Cipla Ltd','30049099',12,200,'inhaler',125 FROM drug_master WHERE name='Salbutamol' AND form='Inhaler' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ventolin Inhaler','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,200,'inhaler',148 FROM drug_master WHERE name='Salbutamol' AND form='Inhaler' LIMIT 1;

-- Montelukast 10mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Singulair 10','Merck Sharp & Dohme India','30049099',12,14,'strip',185 FROM drug_master WHERE name='Montelukast' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Montair 10','Cipla Ltd','30049099',12,14,'strip',152 FROM drug_master WHERE name='Montelukast' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Telekast 10','Sun Pharmaceutical Industries Ltd','30049099',12,14,'strip',148 FROM drug_master WHERE name='Montelukast' AND strength='10mg' LIMIT 1;

-- Cetirizine 10mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zyrtec 10','UCB India Pvt Ltd','30049099',12,10,'strip',38 FROM drug_master WHERE name='Cetirizine' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Alerid 10','Cipla Ltd','30049099',12,10,'strip',32 FROM drug_master WHERE name='Cetirizine' AND strength='10mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cetzine 10','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',30 FROM drug_master WHERE name='Cetirizine' AND strength='10mg' LIMIT 1;

-- Levothyroxine 50mcg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Eltroxin 50','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,30,'strip',42 FROM drug_master WHERE name='Levothyroxine' AND strength='50mcg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Thyronorm 50','Abbott India Ltd','30049099',12,30,'strip',48 FROM drug_master WHERE name='Levothyroxine' AND strength='50mcg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Thyrox 50','Macleods Pharmaceuticals Ltd','30049099',12,30,'strip',38 FROM drug_master WHERE name='Levothyroxine' AND strength='50mcg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Euthrox 50','Merck Ltd (India)','30049099',12,30,'strip',45 FROM drug_master WHERE name='Levothyroxine' AND strength='50mcg' LIMIT 1;

-- Vitamin D3
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'D-Rise 60K','USV Ltd','30049099',5,4,'sachet',88 FROM drug_master WHERE name='Vitamin D3' AND strength='60000IU' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Calcirol 60K','Cadila Healthcare Ltd (Zydus)','30049099',5,4,'sachet',82 FROM drug_master WHERE name='Vitamin D3' AND strength='60000IU' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Uprise D3 60K','Sun Pharmaceutical Industries Ltd','30049099',5,4,'sachet',78 FROM drug_master WHERE name='Vitamin D3' AND strength='60000IU' LIMIT 1;

-- Calcium + Vitamin D3
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Shelcal 500','Elder Pharmaceuticals Ltd','30049099',5,15,'strip',115 FROM drug_master WHERE name='Calcium + Vitamin D3' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Calcimax 500','Franco-Indian Pharmaceuticals Ltd','30049099',5,15,'strip',105 FROM drug_master WHERE name='Calcium + Vitamin D3' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Gemcal','Sun Pharmaceutical Industries Ltd','30049099',5,15,'strip',98 FROM drug_master WHERE name='Calcium + Vitamin D3' LIMIT 1;

-- Vitamin B12
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Mecobal 500','Macleods Pharmaceuticals Ltd','30049099',5,10,'strip',88 FROM drug_master WHERE name='Vitamin B12' AND strength='500mcg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Methycobal 500','Sun Pharmaceutical Industries Ltd','30049099',5,10,'strip',92 FROM drug_master WHERE name='Vitamin B12' AND strength='500mcg' LIMIT 1;

-- Sertraline 50mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zoloft 50','Pfizer Ltd','30049099',12,10,'strip',145 FROM drug_master WHERE name='Sertraline' AND strength='50mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Serta 50','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',115 FROM drug_master WHERE name='Sertraline' AND strength='50mg' LIMIT 1;

-- Sodium Valproate
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Valprol CR 500','Intas Pharmaceuticals Ltd','30049099',12,10,'strip',85 FROM drug_master WHERE name='Sodium Valproate' AND strength='500mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Encorate 500','Sun Pharmaceutical Industries Ltd','30049099',12,10,'strip',82 FROM drug_master WHERE name='Sodium Valproate' AND strength='500mg' LIMIT 1;

-- Fluconazole 150mg
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Forcan 150','Cipla Ltd','30049099',12,1,'strip',38 FROM drug_master WHERE name='Fluconazole' AND strength='150mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Zocon 150','FDC Ltd','30049099',12,1,'strip',42 FROM drug_master WHERE name='Fluconazole' AND strength='150mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Diflucan 150','Pfizer Ltd','30049099',12,1,'strip',68 FROM drug_master WHERE name='Fluconazole' AND strength='150mg' LIMIT 1;

-- Emergency / Surgical / Anaesthesia
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Adrine','Troikaa Pharmaceuticals Ltd','30049099',12,1,'ampoule',18 FROM drug_master WHERE name='Adrenaline (Epinephrine)' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Fulsed','Neon Laboratories Ltd','30049099',12,1,'ampoule',48 FROM drug_master WHERE name='Midazolam' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dormicum','Roche Products (India) Pvt Ltd','30049099',12,1,'ampoule',65 FROM drug_master WHERE name='Midazolam' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ketalar 500','Pfizer Ltd','30049099',12,1,'vial',248 FROM drug_master WHERE name='Ketamine' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ketmin 500','Neon Laboratories Ltd','30049099',12,1,'vial',225 FROM drug_master WHERE name='Ketamine' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Diprivan','AstraZeneca India Pvt Ltd','30049099',12,1,'vial',285 FROM drug_master WHERE name='Propofol' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Fresofol','Fresenius Kabi India Pvt Ltd','30049099',12,1,'vial',255 FROM drug_master WHERE name='Propofol' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Norad','Troikaa Pharmaceuticals Ltd','30049099',12,1,'ampoule',68 FROM drug_master WHERE name='Noradrenaline' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dopmin','Sun Pharmaceutical Industries Ltd','30049099',12,1,'ampoule',48 FROM drug_master WHERE name='Dopamine' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Lasix Injection','Sanofi India Ltd','30049099',12,1,'ampoule',14 FROM drug_master WHERE name='Furosemide' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Tranexa Injection','Troikaa Pharmaceuticals Ltd','30049099',12,1,'ampoule',32 FROM drug_master WHERE name='Tranexamic Acid' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Pause Injection','Sun Pharmaceutical Industries Ltd','30049099',12,1,'ampoule',28 FROM drug_master WHERE name='Tranexamic Acid' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Syntocinon','Novartis India Ltd','30049099',12,1,'ampoule',12 FROM drug_master WHERE name='Oxytocin' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Cordarone 200','Sanofi India Ltd','30049099',12,10,'strip',185 FROM drug_master WHERE name='Amiodarone' AND strength='200mg' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dexona','Samarth Life Sciences Pvt Ltd','30049099',12,1,'vial',18 FROM drug_master WHERE name='Dexamethasone' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Efcorlin 100mg','Pfizer Ltd','30049099',12,1,'vial',85 FROM drug_master WHERE name='Hydrocortisone' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Heparin Sodium','Neon Laboratories Ltd','30049099',12,1,'vial',85 FROM drug_master WHERE name='Heparin' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Atropine Sulphate','Neon Laboratories Ltd','30049099',12,1,'ampoule',12 FROM drug_master WHERE name='Atropine' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Morphine Sulphate','Neon Laboratories Ltd','30049099',12,1,'ampoule',22 FROM drug_master WHERE name='Morphine' AND form='Injection' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Magsulf 50%','Samarth Life Sciences Pvt Ltd','30049099',12,1,'ampoule',8 FROM drug_master WHERE name='Magnesium Sulphate' AND form='Injection' LIMIT 1;

-- IV Fluids
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Normal Saline (Baxter)','Baxter India Pvt Ltd','30049099',12,1,'bag',52 FROM drug_master WHERE name='Normal Saline 0.9% 500ml' AND form='Infusion' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Normal Saline (Fresenius)','Fresenius Kabi India Pvt Ltd','30049099',12,1,'bag',50 FROM drug_master WHERE name='Normal Saline 0.9% 500ml' AND form='Infusion' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Normasol 500','Claris Lifesciences Ltd','30049099',12,1,'bag',48 FROM drug_master WHERE name='Normal Saline 0.9% 500ml' AND form='Infusion' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'RL (Baxter)','Baxter India Pvt Ltd','30049099',12,1,'bag',52 FROM drug_master WHERE name LIKE 'Ringer%Lactate%500ml' AND form='Infusion' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'RL (Fresenius)','Fresenius Kabi India Pvt Ltd','30049099',12,1,'bag',50 FROM drug_master WHERE name LIKE 'Ringer%Lactate%500ml' AND form='Infusion' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'DNS 500 (Baxter)','Baxter India Pvt Ltd','30049099',12,1,'bag',55 FROM drug_master WHERE name='Dextrose 5% 500ml' AND form='Infusion' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'DNS 500 (Fresenius)','Fresenius Kabi India Pvt Ltd','30049099',12,1,'bag',52 FROM drug_master WHERE name='Dextrose 5% 500ml' AND form='Infusion' LIMIT 1;

-- Antiseptics / Wound care
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Betadine 10%','Win-Medicare Pvt Ltd','30049099',12,100,'bottle',95 FROM drug_master WHERE name='Povidone Iodine Solution' AND form='Solution' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Wokadine 10%','Wockhardt Ltd','30049099',12,100,'bottle',88 FROM drug_master WHERE name='Povidone Iodine Solution' AND form='Solution' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Silverex','Win-Medicare Pvt Ltd','30049099',12,1,'tube',82 FROM drug_master WHERE name='Silver Sulfadiazine Cream' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Dermazin','Roche Products (India) Pvt Ltd','30049099',12,1,'tube',95 FROM drug_master WHERE name='Silver Sulfadiazine Cream' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Bactroban 2%','GlaxoSmithKline Pharmaceuticals Ltd','30049099',12,1,'tube',98 FROM drug_master WHERE name='Mupirocin Ointment' LIMIT 1;

-- Ophthalmic
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Ciplox Eye Drops','Cipla Ltd','30049099',12,1,'bottle',32 FROM drug_master WHERE name='Ciprofloxacin Eye Drops' LIMIT 1;
INSERT INTO drug_brands (drug_master_id,brand_name,manufacturer,hsn_code,gst_rate,pack_size,pack_unit,mrp_per_pack) SELECT id,'Refresh Tears','Allergan India Pvt Ltd','30049099',12,1,'bottle',85 FROM drug_master WHERE name='Artificial Tears' LIMIT 1;

COMMENT ON TABLE drug_brands IS 'Global brand catalog. Seed covers ~300 Indian brands for 80 key drugs. For full CDSCO dataset import from cdsco.gov.in.';
