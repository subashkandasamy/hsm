-- =====================================================================
-- 0092_icd10_master.sql
-- P1.2 — ICD-10 code master (global reference data, like drug_master) + a
-- curated seed of common diagnoses. Powers a coded-diagnosis picker in the OPD
-- consultation and the problem list. Tenants can't write; extend the seed via
-- later migrations as needed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS icd_codes (
  code     TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  category TEXT
);
CREATE INDEX IF NOT EXISTS idx_icd_title ON icd_codes USING gin (to_tsvector('simple', title));

ALTER TABLE icd_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "icd_codes_read" ON icd_codes FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO icd_codes (code, title, category) VALUES
-- Infectious
('A09','Infectious gastroenteritis / diarrhoea','Infectious'),
('A90','Dengue fever','Infectious'),
('B54','Malaria, unspecified','Infectious'),
('A01.0','Typhoid fever','Infectious'),
('B34.9','Viral infection, unspecified','Infectious'),
('J06.9','Acute upper respiratory infection','Respiratory'),
('U07.1','COVID-19','Infectious'),
('A15.9','Pulmonary tuberculosis','Infectious'),
('B19.9','Viral hepatitis, unspecified','Infectious'),
-- Endocrine / metabolic
('E11.9','Type 2 diabetes mellitus','Endocrine'),
('E10.9','Type 1 diabetes mellitus','Endocrine'),
('E11.65','Type 2 diabetes with hyperglycaemia','Endocrine'),
('E03.9','Hypothyroidism, unspecified','Endocrine'),
('E05.9','Hyperthyroidism, unspecified','Endocrine'),
('E78.5','Hyperlipidaemia, unspecified','Endocrine'),
('E66.9','Obesity, unspecified','Endocrine'),
('E86.0','Dehydration','Metabolic'),
('D50.9','Iron deficiency anaemia','Blood'),
('D64.9','Anaemia, unspecified','Blood'),
-- Circulatory
('I10','Essential (primary) hypertension','Circulatory'),
('I20.9','Angina pectoris','Circulatory'),
('I21.9','Acute myocardial infarction','Circulatory'),
('I25.10','Coronary artery disease','Circulatory'),
('I48.91','Atrial fibrillation','Circulatory'),
('I50.9','Heart failure, unspecified','Circulatory'),
('I63.9','Cerebral infarction / stroke','Circulatory'),
('I84.9','Haemorrhoids','Circulatory'),
-- Respiratory
('J45.909','Asthma, unspecified','Respiratory'),
('J44.9','COPD, unspecified','Respiratory'),
('J18.9','Pneumonia, unspecified','Respiratory'),
('J20.9','Acute bronchitis','Respiratory'),
('J02.9','Acute pharyngitis','Respiratory'),
('J01.90','Acute sinusitis','Respiratory'),
('J30.9','Allergic rhinitis','Respiratory'),
-- Digestive
('K21.9','GERD / acid reflux','Digestive'),
('K29.70','Gastritis, unspecified','Digestive'),
('K30','Functional dyspepsia','Digestive'),
('K59.00','Constipation','Digestive'),
('K52.9','Non-infective gastroenteritis / colitis','Digestive'),
('K80.20','Cholelithiasis (gallstones)','Digestive'),
('K35.80','Acute appendicitis','Digestive'),
('K02.9','Dental caries','Digestive'),
-- Genitourinary
('N39.0','Urinary tract infection','Genitourinary'),
('N20.0','Renal calculus (kidney stone)','Genitourinary'),
('N18.9','Chronic kidney disease','Genitourinary'),
('N30.90','Cystitis','Genitourinary'),
('N91.2','Amenorrhoea','Genitourinary'),
('N95.1','Menopausal symptoms','Genitourinary'),
-- Musculoskeletal / skin
('M54.5','Low back pain','Musculoskeletal'),
('M54.2','Cervicalgia (neck pain)','Musculoskeletal'),
('M25.50','Joint pain (arthralgia)','Musculoskeletal'),
('M17.9','Osteoarthritis of knee','Musculoskeletal'),
('M79.7','Fibromyalgia / myalgia','Musculoskeletal'),
('M06.9','Rheumatoid arthritis','Musculoskeletal'),
('L30.9','Dermatitis / eczema','Skin'),
('L50.9','Urticaria (hives)','Skin'),
('L03.90','Cellulitis','Skin'),
('B35.9','Dermatophytosis (fungal skin)','Skin'),
-- Neuro / mental
('G43.909','Migraine','Nervous'),
('R51','Headache','Symptoms'),
('G40.909','Epilepsy / seizure','Nervous'),
('F41.9','Anxiety disorder','Mental'),
('F32.9','Depressive episode','Mental'),
('F51.0','Insomnia','Mental'),
('F10.20','Alcohol dependence','Mental'),
-- Eye / ENT
('H10.9','Conjunctivitis','Eye'),
('H66.90','Otitis media','ENT'),
('H61.20','Impacted cerumen (ear wax)','ENT'),
-- Symptoms / signs
('R50.9','Fever, unspecified','Symptoms'),
('R05','Cough','Symptoms'),
('R07.9','Chest pain','Symptoms'),
('R10.9','Abdominal pain','Symptoms'),
('R11.2','Nausea with vomiting','Symptoms'),
('R42','Dizziness / giddiness','Symptoms'),
('R53.83','Fatigue / weakness','Symptoms'),
('R60.9','Oedema','Symptoms'),
('R63.0','Anorexia / loss of appetite','Symptoms'),
-- Pregnancy / newborn
('Z34.90','Supervision of normal pregnancy','Pregnancy'),
('O21.9','Vomiting of pregnancy','Pregnancy'),
('Z39.2','Routine postpartum follow-up','Pregnancy'),
-- Injury
('S09.90','Head injury, unspecified','Injury'),
('T14.90','Injury, unspecified','Injury'),
('S93.40','Ankle sprain','Injury'),
('T78.40','Allergy, unspecified','Injury'),
-- General / encounters
('Z00.00','General medical examination','Factors'),
('Z23','Immunisation encounter','Factors'),
('Z71.3','Dietary counselling','Factors')
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
