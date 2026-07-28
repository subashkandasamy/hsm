-- =====================================================================
-- 0093_drug_interactions.sql
-- P1.3 — a curated drug–drug interaction reference (global, like drug_master),
-- keyed by lowercase generic-name keywords matched as substrings against
-- prescribed drug names. Powers prescribing-safety warnings. Not exhaustive —
-- a clinically-significant common set; extend via later migrations.
-- =====================================================================

CREATE TABLE IF NOT EXISTS drug_interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a      TEXT NOT NULL,   -- lowercase generic keyword
  drug_b      TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('major','moderate','minor')),
  description TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_a ON drug_interactions (drug_a);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_b ON drug_interactions (drug_b);

ALTER TABLE drug_interactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "drug_interactions_read" ON drug_interactions FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO drug_interactions (drug_a, drug_b, severity, description) VALUES
('warfarin','aspirin','major','Markedly increased bleeding risk'),
('warfarin','ibuprofen','major','Increased bleeding risk (NSAID)'),
('warfarin','diclofenac','major','Increased bleeding risk (NSAID)'),
('warfarin','clopidogrel','major','Additive bleeding risk'),
('warfarin','fluconazole','major','Raises INR — bleeding risk'),
('warfarin','metronidazole','major','Raises INR — bleeding risk'),
('warfarin','ciprofloxacin','moderate','May raise INR'),
('warfarin','azithromycin','moderate','May raise INR'),
('aspirin','ibuprofen','moderate','Reduced antiplatelet effect + GI risk'),
('aspirin','clopidogrel','moderate','Additive bleeding risk'),
('enalapril','potassium','major','Risk of hyperkalaemia'),
('lisinopril','potassium','major','Risk of hyperkalaemia'),
('ramipril','potassium','major','Risk of hyperkalaemia'),
('enalapril','spironolactone','major','Risk of hyperkalaemia'),
('ramipril','spironolactone','major','Risk of hyperkalaemia'),
('enalapril','ibuprofen','moderate','Reduced effect + renal risk'),
('spironolactone','potassium','major','Risk of hyperkalaemia'),
('atorvastatin','clarithromycin','major','Increased statin levels — myopathy'),
('simvastatin','clarithromycin','major','Increased statin levels — myopathy'),
('simvastatin','erythromycin','major','Increased statin levels — myopathy'),
('simvastatin','amlodipine','moderate','Increased statin levels — limit dose'),
('digoxin','amiodarone','major','Raises digoxin — toxicity risk'),
('digoxin','clarithromycin','major','Raises digoxin — toxicity risk'),
('digoxin','furosemide','moderate','Hypokalaemia potentiates digoxin toxicity'),
('clopidogrel','omeprazole','moderate','Reduced clopidogrel activation'),
('methotrexate','ibuprofen','major','Increased methotrexate toxicity'),
('methotrexate','diclofenac','major','Increased methotrexate toxicity'),
('methotrexate','cotrimoxazole','major','Additive marrow suppression'),
('tramadol','sertraline','major','Serotonin syndrome risk'),
('tramadol','fluoxetine','major','Serotonin syndrome risk'),
('sertraline','tramadol','major','Serotonin syndrome risk'),
('theophylline','ciprofloxacin','major','Raises theophylline — toxicity'),
('metronidazole','alcohol','major','Disulfiram-like reaction'),
('allopurinol','azathioprine','major','Severe marrow suppression'),
('ibuprofen','lithium','major','Raises lithium — toxicity'),
('furosemide','gentamicin','major','Additive oto/nephrotoxicity'),
('sildenafil','nitroglycerin','major','Severe hypotension'),
('sildenafil','isosorbide','major','Severe hypotension')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
