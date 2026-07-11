-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 0055: Radiology Master Table
-- Global platform-managed radiology procedure catalog (~390 procedures)
-- Mirrors the lab_tests_master / lab_tests_catalog pattern.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Global master table (no tenant_id — platform-managed) ─────────────────

CREATE TABLE IF NOT EXISTS radiology_master (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  modality   TEXT        NOT NULL,   -- xray | ct | mri | usg | echo | mammography |
                                     -- fluoroscopy | nuclear | pet | dexa |
                                     -- angiography | interventional | dental |
                                     -- ophthalmic | special
  body_part  TEXT        NOT NULL DEFAULT 'General',  -- sub-group for display
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE radiology_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "radiology_master_read" ON radiology_master;
CREATE POLICY "radiology_master_read" ON radiology_master
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── 2. Link tenant catalog to master (nullable — custom procedures stay NULL) ─

ALTER TABLE radiology_catalog
  ADD COLUMN IF NOT EXISTS radiology_master_id UUID
    REFERENCES radiology_master(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_radiology_catalog_master
  ON radiology_catalog(radiology_master_id)
  WHERE radiology_master_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. SEED — Comprehensive global radiology procedure master
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO radiology_master (name, modality, body_part) VALUES

-- ─────────────────────────────────────────────────────────────────────────────
-- X-RAY  (Plain Radiography)
-- ─────────────────────────────────────────────────────────────────────────────

-- Chest
('Chest X-Ray PA View',                          'xray', 'Chest'),
('Chest X-Ray AP View',                          'xray', 'Chest'),
('Chest X-Ray Lateral View',                     'xray', 'Chest'),
('Chest X-Ray Oblique View',                     'xray', 'Chest'),
('Chest X-Ray Inspiratory & Expiratory Views',   'xray', 'Chest'),
('Portable / Bedside Chest X-Ray',               'xray', 'Chest'),

-- Abdomen
('Abdomen X-Ray Erect',                          'xray', 'Abdomen'),
('Abdomen X-Ray Supine',                         'xray', 'Abdomen'),
('Abdomen X-Ray Decubitus',                      'xray', 'Abdomen'),
('KUB (Kidney Ureter Bladder)',                  'xray', 'Abdomen'),

-- Skull & Face
('Skull X-Ray AP & Lateral',                     'xray', 'Skull & Face'),
('Paranasal Sinuses (PNS) X-Ray',               'xray', 'Skull & Face'),
('Facial Bones X-Ray',                           'xray', 'Skull & Face'),
('Orbit X-Ray',                                  'xray', 'Skull & Face'),
('Mandible X-Ray',                               'xray', 'Skull & Face'),
('Mastoids X-Ray',                               'xray', 'Skull & Face'),
('Sella Turcica X-Ray',                          'xray', 'Skull & Face'),

-- Spine
('Cervical Spine X-Ray AP & Lateral',            'xray', 'Spine'),
('Cervical Spine Flexion & Extension Views',     'xray', 'Spine'),
('Thoracic Spine X-Ray',                         'xray', 'Spine'),
('Lumbar Spine X-Ray AP & Lateral',              'xray', 'Spine'),
('Lumbar Spine Flexion & Extension Views',       'xray', 'Spine'),
('Sacrum & Coccyx X-Ray',                        'xray', 'Spine'),
('Full Spine X-Ray (Scoliosis)',                 'xray', 'Spine'),

-- Upper Limb
('Shoulder X-Ray',                               'xray', 'Upper Limb'),
('Clavicle X-Ray',                               'xray', 'Upper Limb'),
('Humerus X-Ray',                                'xray', 'Upper Limb'),
('Elbow X-Ray',                                  'xray', 'Upper Limb'),
('Forearm X-Ray',                                'xray', 'Upper Limb'),
('Wrist X-Ray',                                  'xray', 'Upper Limb'),
('Hand X-Ray',                                   'xray', 'Upper Limb'),
('Fingers X-Ray',                                'xray', 'Upper Limb'),

-- Lower Limb
('Pelvis X-Ray',                                 'xray', 'Lower Limb'),
('Hip X-Ray',                                    'xray', 'Lower Limb'),
('Femur X-Ray',                                  'xray', 'Lower Limb'),
('Knee X-Ray',                                   'xray', 'Lower Limb'),
('Knee Stress Views',                            'xray', 'Lower Limb'),
('Leg X-Ray (Tibia & Fibula)',                  'xray', 'Lower Limb'),
('Ankle X-Ray',                                  'xray', 'Lower Limb'),
('Ankle Stress Views',                           'xray', 'Lower Limb'),
('Foot X-Ray',                                   'xray', 'Lower Limb'),
('Heel X-Ray (Calcaneum)',                       'xray', 'Lower Limb'),
('Toes X-Ray',                                   'xray', 'Lower Limb'),

-- Other
('Ribs X-Ray',                                   'xray', 'Other'),
('Sternum X-Ray',                                'xray', 'Other'),
('Skeletal Survey',                              'xray', 'Other'),
('Bone Age Assessment (Left Hand)',              'xray', 'Other'),

-- ─────────────────────────────────────────────────────────────────────────────
-- CT SCAN
-- ─────────────────────────────────────────────────────────────────────────────

-- Brain & Skull Base
('CT Brain Plain',                               'ct', 'Brain'),
('CT Brain Contrast',                            'ct', 'Brain'),
('CT Brain Angiography (CTA)',                   'ct', 'Brain'),
('CT Brain Perfusion',                           'ct', 'Brain'),
('CT Temporal Bones',                            'ct', 'Brain'),
('CT Internal Auditory Canal (IAC)',             'ct', 'Brain'),

-- Head & Neck
('CT Paranasal Sinuses',                         'ct', 'Head & Neck'),
('CT Orbit',                                     'ct', 'Head & Neck'),
('CT Maxillofacial / Face',                      'ct', 'Head & Neck'),
('CT Mandible',                                  'ct', 'Head & Neck'),
('CT Neck Plain',                                'ct', 'Head & Neck'),
('CT Neck Contrast',                             'ct', 'Head & Neck'),
('CT Nasopharynx & Larynx',                     'ct', 'Head & Neck'),

-- Chest
('CT Chest Plain',                               'ct', 'Chest'),
('CT Chest Contrast',                            'ct', 'Chest'),
('HRCT Chest (High Resolution)',                 'ct', 'Chest'),
('CT Pulmonary Angiography (CTPA)',              'ct', 'Chest'),
('CT Coronary Angiography (CTCA)',               'ct', 'Chest'),
('CT Cardiac Calcium Scoring',                   'ct', 'Chest'),

-- Abdomen
('CT Abdomen Plain',                             'ct', 'Abdomen'),
('CT Abdomen Contrast',                          'ct', 'Abdomen'),
('CT Abdomen & Pelvis Plain',                    'ct', 'Abdomen'),
('CT Abdomen & Pelvis Contrast',                 'ct', 'Abdomen'),
('CT Liver Triple Phase',                        'ct', 'Abdomen'),
('CT Enterography',                              'ct', 'Abdomen'),
('CT Colonography (Virtual Colonoscopy)',        'ct', 'Abdomen'),
('CT Defecography',                              'ct', 'Abdomen'),
('CT Urography (CTU)',                           'ct', 'Abdomen'),
('CT Stone Protocol (KUB)',                      'ct', 'Abdomen'),

-- Pelvis
('CT Pelvis Plain',                              'ct', 'Pelvis'),
('CT Pelvis Contrast',                           'ct', 'Pelvis'),

-- Spine
('CT Cervical Spine',                            'ct', 'Spine'),
('CT Thoracic Spine',                            'ct', 'Spine'),
('CT Lumbar Spine',                              'ct', 'Spine'),
('CT Myelogram',                                 'ct', 'Spine'),

-- Extremities
('CT Shoulder',                                  'ct', 'Extremities'),
('CT Elbow',                                     'ct', 'Extremities'),
('CT Wrist',                                     'ct', 'Extremities'),
('CT Hand',                                      'ct', 'Extremities'),
('CT Hip',                                       'ct', 'Extremities'),
('CT Knee',                                      'ct', 'Extremities'),
('CT Ankle',                                     'ct', 'Extremities'),
('CT Foot',                                      'ct', 'Extremities'),
('CT Arthrogram',                                'ct', 'Extremities'),

-- Vascular & Advanced
('CT Peripheral Angiography (CTA)',              'ct', 'Vascular & Advanced'),
('CT Aortogram',                                 'ct', 'Vascular & Advanced'),
('CT Renal Angiography',                         'ct', 'Vascular & Advanced'),
('CT Carotid Angiography',                       'ct', 'Vascular & Advanced'),
('CT Whole Body (Trauma Protocol)',              'ct', 'Vascular & Advanced'),
('CT 3D Reconstruction / Post-processing',      'ct', 'Vascular & Advanced'),
('Dual Energy CT (Spectral CT)',                 'ct', 'Vascular & Advanced'),

-- ─────────────────────────────────────────────────────────────────────────────
-- MRI
-- ─────────────────────────────────────────────────────────────────────────────

-- Brain
('MRI Brain Plain',                              'mri', 'Brain'),
('MRI Brain Contrast',                           'mri', 'Brain'),
('MRI Brain Angiography (MRA)',                  'mri', 'Brain'),
('MRI Brain Venography (MRV)',                   'mri', 'Brain'),
('MRI Brain Spectroscopy',                       'mri', 'Brain'),
('MRI Brain Perfusion',                          'mri', 'Brain'),
('MRI Brain Functional (fMRI)',                  'mri', 'Brain'),
('MRI Brain Diffusion Tensor Imaging (DTI)',     'mri', 'Brain'),

-- Spine
('MRI Cervical Spine',                           'mri', 'Spine'),
('MRI Thoracic Spine',                           'mri', 'Spine'),
('MRI Lumbar Spine',                             'mri', 'Spine'),
('MRI Whole Spine',                              'mri', 'Spine'),
('MRI Sacrum & Coccyx',                         'mri', 'Spine'),
('MRI Sacroiliac Joints',                        'mri', 'Spine'),
('MRI Brachial Plexus',                          'mri', 'Spine'),

-- Upper Limb
('MRI Shoulder',                                 'mri', 'Upper Limb'),
('MRI Elbow',                                    'mri', 'Upper Limb'),
('MRI Wrist',                                    'mri', 'Upper Limb'),
('MRI Hand & Fingers',                          'mri', 'Upper Limb'),
('MRI Temporomandibular Joint (TMJ)',            'mri', 'Upper Limb'),

-- Lower Limb
('MRI Hip',                                      'mri', 'Lower Limb'),
('MRI Knee',                                     'mri', 'Lower Limb'),
('MRI Ankle',                                    'mri', 'Lower Limb'),
('MRI Foot',                                     'mri', 'Lower Limb'),
('MRI Small Joints / Toes',                     'mri', 'Lower Limb'),

-- Abdomen
('MRI Abdomen Plain',                            'mri', 'Abdomen'),
('MRI Abdomen Contrast',                         'mri', 'Abdomen'),
('MRCP (MR Cholangiopancreatography)',           'mri', 'Abdomen'),
('MRI Liver (Hepatobiliary Protocol)',           'mri', 'Abdomen'),
('MRI Pancreas',                                 'mri', 'Abdomen'),
('MRI Enterography',                             'mri', 'Abdomen'),
('MRI Defecography',                             'mri', 'Abdomen'),

-- Pelvis
('MRI Pelvis (Male)',                            'mri', 'Pelvis'),
('MRI Pelvis (Female)',                          'mri', 'Pelvis'),
('MRI Prostate',                                 'mri', 'Pelvis'),
('MRI Uterus & Gynaecological',                 'mri', 'Pelvis'),
('MRI Rectum / Rectal Cancer Staging',          'mri', 'Pelvis'),
('MRI Perianal Fistula (Fistula-in-Ano)',       'mri', 'Pelvis'),
('MRI Perineum',                                 'mri', 'Pelvis'),
('MRI Urography',                                'mri', 'Pelvis'),

-- Chest & Breast
('MRI Chest',                                    'mri', 'Chest & Breast'),
('MRI Cardiac (CMR)',                            'mri', 'Chest & Breast'),
('MRI Breast Bilateral',                         'mri', 'Chest & Breast'),
('MRI Breast Unilateral',                        'mri', 'Chest & Breast'),

-- Head & Neck
('MRI Neck',                                     'mri', 'Head & Neck'),
('MRI Orbit',                                    'mri', 'Head & Neck'),
('MRI Face & Temporal Bones',                   'mri', 'Head & Neck'),
('MRI Nasopharynx & Larynx',                    'mri', 'Head & Neck'),

-- Fetal & Whole Body
('MRI Fetal',                                    'mri', 'Fetal & Whole Body'),
('MRI Placenta',                                 'mri', 'Fetal & Whole Body'),
('MRI Whole Body',                               'mri', 'Fetal & Whole Body'),

-- Vascular
('MRI Peripheral Angiography',                   'mri', 'Vascular'),
('MRI Aortogram',                                'mri', 'Vascular'),
('MRI Carotid Angiography',                      'mri', 'Vascular'),
('MRI Renal Angiography',                        'mri', 'Vascular'),

-- ─────────────────────────────────────────────────────────────────────────────
-- ULTRASOUND (USG)
-- ─────────────────────────────────────────────────────────────────────────────

-- Abdomen
('USG Whole Abdomen',                            'usg', 'Abdomen'),
('USG Upper Abdomen',                            'usg', 'Abdomen'),
('USG Lower Abdomen',                            'usg', 'Abdomen'),
('USG Liver',                                    'usg', 'Abdomen'),
('USG Gallbladder & Biliary System',             'usg', 'Abdomen'),
('USG Renal / KUB',                              'usg', 'Abdomen'),
('USG Spleen',                                   'usg', 'Abdomen'),
('USG Pancreas',                                 'usg', 'Abdomen'),
('USG Aorta',                                    'usg', 'Abdomen'),

-- Pelvis
('USG Pelvis (Female)',                          'usg', 'Pelvis'),
('USG Pelvis (Male)',                            'usg', 'Pelvis'),
('USG Transvaginal (TVS)',                       'usg', 'Pelvis'),
('USG Transrectal (TRUS)',                       'usg', 'Pelvis'),
('USG Follicular Study',                         'usg', 'Pelvis'),
('USG Scrotal / Testicular',                     'usg', 'Pelvis'),

-- Obstetric
('USG 1st Trimester (Dating Scan)',              'usg', 'Obstetric'),
('USG NT Scan (Nuchal Translucency)',            'usg', 'Obstetric'),
('USG Anomaly Scan (TIFFA / Level 2)',          'usg', 'Obstetric'),
('USG 2nd Trimester',                            'usg', 'Obstetric'),
('USG 3rd Trimester / Growth Scan',             'usg', 'Obstetric'),
('USG Fetal Doppler (Umbilical / MCA)',         'usg', 'Obstetric'),
('USG Biophysical Profile (BPP)',               'usg', 'Obstetric'),

-- Head & Neck
('USG Thyroid',                                  'usg', 'Head & Neck'),
('USG Parathyroid',                              'usg', 'Head & Neck'),
('USG Neck / Soft Tissue',                       'usg', 'Head & Neck'),
('USG Salivary Glands',                          'usg', 'Head & Neck'),
('USG Lymph Nodes',                              'usg', 'Head & Neck'),
('USG Neonatal Head (Cranial USG)',              'usg', 'Head & Neck'),

-- Breast
('USG Breast Bilateral',                         'usg', 'Breast'),
('USG Breast Unilateral',                        'usg', 'Breast'),
('USG Axilla',                                   'usg', 'Breast'),

-- Musculoskeletal
('USG Shoulder',                                 'usg', 'Musculoskeletal'),
('USG Knee',                                     'usg', 'Musculoskeletal'),
('USG Hip',                                      'usg', 'Musculoskeletal'),
('USG Achilles Tendon',                          'usg', 'Musculoskeletal'),
('USG Plantar Fascia',                           'usg', 'Musculoskeletal'),
('USG Elbow',                                    'usg', 'Musculoskeletal'),
('USG Wrist',                                    'usg', 'Musculoskeletal'),
('USG Soft Tissue (Any Site)',                   'usg', 'Musculoskeletal'),

-- Vascular Doppler
('Carotid Doppler',                              'usg', 'Vascular Doppler'),
('Renal Doppler',                                'usg', 'Vascular Doppler'),
('Lower Limb Arterial Doppler',                  'usg', 'Vascular Doppler'),
('Lower Limb Venous Doppler (DVT)',              'usg', 'Vascular Doppler'),
('Upper Limb Venous Doppler (DVT)',              'usg', 'Vascular Doppler'),
('Portal Vein Doppler',                          'usg', 'Vascular Doppler'),
('Hepatic Vein Doppler',                         'usg', 'Vascular Doppler'),
('Aorta Doppler',                                'usg', 'Vascular Doppler'),
('Transcranial Doppler (TCD)',                   'usg', 'Vascular Doppler'),

-- Advanced & Guided
('CEUS (Contrast Enhanced Ultrasound)',          'usg', 'Advanced'),
('Transient Elastography / FibroScan',          'usg', 'Advanced'),
('Shear Wave Elastography (SWE)',               'usg', 'Advanced'),
('USG-Guided FNAC',                              'usg', 'Advanced'),
('USG-Guided Biopsy',                            'usg', 'Advanced'),
('USG-Guided Aspiration',                        'usg', 'Advanced'),
('USG-Guided Drainage',                          'usg', 'Advanced'),
('Intraoperative Ultrasound',                    'usg', 'Advanced'),
('Point-of-Care USG (POCUS)',                    'usg', 'Advanced'),

-- ─────────────────────────────────────────────────────────────────────────────
-- ECHOCARDIOGRAPHY
-- ─────────────────────────────────────────────────────────────────────────────

('2D Echocardiography',                          'echo', 'Echocardiography'),
('Doppler Echocardiography',                     'echo', 'Echocardiography'),
('Colour Doppler Echo',                          'echo', 'Echocardiography'),
('3D Echocardiography',                          'echo', 'Echocardiography'),
('Stress Echo (Dobutamine)',                     'echo', 'Echocardiography'),
('Stress Echo (Exercise / Treadmill)',           'echo', 'Echocardiography'),
('Transesophageal Echo (TEE)',                   'echo', 'Echocardiography'),
('Contrast Echo (Bubble Echo)',                  'echo', 'Echocardiography'),
('Fetal Echocardiography',                       'echo', 'Echocardiography'),
('Neonatal Echocardiography',                    'echo', 'Echocardiography'),

-- ─────────────────────────────────────────────────────────────────────────────
-- MAMMOGRAPHY
-- ─────────────────────────────────────────────────────────────────────────────

('Mammography Bilateral',                        'mammography', 'Screening'),
('Mammography Unilateral',                       'mammography', 'Screening'),
('Digital Mammography Bilateral',                'mammography', 'Screening'),
('3D Mammography / Tomosynthesis Bilateral',    'mammography', 'Screening'),
('Contrast-Enhanced Mammography (CEM)',          'mammography', 'Screening'),
('Ductography / Galactography',                  'mammography', 'Diagnostic'),
('Scintimammography / Molecular Breast Imaging','mammography', 'Diagnostic'),
('Positron Emission Mammography (PEM)',          'mammography', 'Diagnostic'),
('Stereotactic Biopsy',                          'mammography', 'Diagnostic'),

-- ─────────────────────────────────────────────────────────────────────────────
-- FLUOROSCOPY
-- ─────────────────────────────────────────────────────────────────────────────

-- GI Contrast Studies
('Barium Swallow',                               'fluoroscopy', 'GI Contrast Studies'),
('Modified Barium Swallow (VFSS)',              'fluoroscopy', 'GI Contrast Studies'),
('Barium Meal',                                  'fluoroscopy', 'GI Contrast Studies'),
('Barium Enema',                                 'fluoroscopy', 'GI Contrast Studies'),
('Small Bowel Follow-Through (SBFT)',            'fluoroscopy', 'GI Contrast Studies'),
('CT Enteroclysis',                              'fluoroscopy', 'GI Contrast Studies'),

-- Genitourinary
('Hysterosalpingography (HSG)',                  'fluoroscopy', 'Genitourinary'),
('Micturating Cystourethrogram (MCU / VCUG)',   'fluoroscopy', 'Genitourinary'),
('Retrograde Urethrogram (RGU)',                 'fluoroscopy', 'Genitourinary'),
('Cystogram',                                    'fluoroscopy', 'Genitourinary'),
('Intravenous Pyelogram (IVP)',                  'fluoroscopy', 'Genitourinary'),
('Antegrade Pyelogram',                          'fluoroscopy', 'Genitourinary'),
('Loopogram',                                    'fluoroscopy', 'Genitourinary'),

-- Biliary & Other
('T-Tube Cholangiogram',                         'fluoroscopy', 'Biliary & Other'),
('ERCP Fluoroscopy Assistance',                  'fluoroscopy', 'Biliary & Other'),
('Fistulogram / Sinogram',                       'fluoroscopy', 'Biliary & Other'),
('Arthrogram (Fluoroscopy-guided)',              'fluoroscopy', 'Biliary & Other'),

-- ─────────────────────────────────────────────────────────────────────────────
-- NUCLEAR MEDICINE
-- ─────────────────────────────────────────────────────────────────────────────

-- Bone & MSK
('Bone Scan Whole Body',                         'nuclear', 'Bone & MSK'),
('Bone Scan with SPECT-CT',                      'nuclear', 'Bone & MSK'),

-- Thyroid & Endocrine
('Thyroid Scan (99mTc)',                         'nuclear', 'Thyroid & Endocrine'),
('Thyroid Uptake Study (I-131)',                 'nuclear', 'Thyroid & Endocrine'),
('Parathyroid Scan (Sestamibi / MIBI)',         'nuclear', 'Thyroid & Endocrine'),
('MIBG Scan (I-123 / I-131)',                   'nuclear', 'Thyroid & Endocrine'),
('I-131 Whole Body Scan (Post-Thyroidectomy)', 'nuclear', 'Thyroid & Endocrine'),
('Adrenocortical Scintigraphy (NP-59)',         'nuclear', 'Thyroid & Endocrine'),

-- Renal
('Renal Scan DTPA (GFR / Dynamic)',             'nuclear', 'Renal'),
('Renal Scan DMSA (Cortical)',                  'nuclear', 'Renal'),
('Radionuclide Cystogram',                      'nuclear', 'Renal'),

-- Cardiac
('Myocardial Perfusion Imaging (Stress MIBI)', 'nuclear', 'Cardiac'),
('Stress Thallium Scan',                        'nuclear', 'Cardiac'),
('Gated Blood Pool Scan (MUGA)',               'nuclear', 'Cardiac'),

-- Pulmonary
('Ventilation-Perfusion Scan (V/Q)',            'nuclear', 'Pulmonary'),
('Lung Perfusion Scan Only',                    'nuclear', 'Pulmonary'),

-- GI & Hepatic
('Hepatobiliary Scan (HIDA / DISIDA)',          'nuclear', 'GI & Hepatic'),
('GI Bleed Scan (Tagged Red Blood Cell)',       'nuclear', 'GI & Hepatic'),
('Meckel Diverticulum Scan',                    'nuclear', 'GI & Hepatic'),

-- Neurology
('Brain SPECT Perfusion (99mTc-HMPAO)',        'nuclear', 'Neurology'),
('DaTscan (Ioflupane I-123 — Parkinson''s)',  'nuclear', 'Neurology'),
('Cisternogram (CSF Flow Study)',               'nuclear', 'Neurology'),

-- Infection & Oncology
('White Blood Cell Scan (Labelled Leukocyte)', 'nuclear', 'Infection & Oncology'),
('Gallium-67 Scan',                             'nuclear', 'Infection & Oncology'),
('Octreotide Scan / Octreoscan',               'nuclear', 'Infection & Oncology'),
('Sentinel Lymph Node Mapping',                 'nuclear', 'Infection & Oncology'),
('Lymphoscintigraphy',                          'nuclear', 'Infection & Oncology'),

-- Special Gland Scans
('Salivary Gland Scintigraphy',                 'nuclear', 'Special'),
('Dacryoscintigraphy (Lacrimal Gland Scan)',   'nuclear', 'Special'),

-- ─────────────────────────────────────────────────────────────────────────────
-- PET SCAN
-- ─────────────────────────────────────────────────────────────────────────────

-- FDG PET-CT
('PET-CT FDG Whole Body',                       'pet', 'FDG PET-CT'),
('PET-CT FDG Head & Neck',                      'pet', 'FDG PET-CT'),
('PET-CT FDG Thorax',                           'pet', 'FDG PET-CT'),
('PET-CT FDG Abdomen & Pelvis',                 'pet', 'FDG PET-CT'),
('PET-CT FDG Brain',                            'pet', 'FDG PET-CT'),
('PET-CT FDG Cardiac (Viability / Sarcoid)',   'pet', 'FDG PET-CT'),
('PET-CT FDG for Infection / FUO',             'pet', 'FDG PET-CT'),

-- Hybrid
('PET-MRI FDG Whole Body',                      'pet', 'Hybrid PET'),

-- Specialised Tracers
('Ga-68 DOTATATE PET-CT (Neuroendocrine)',     'pet', 'Specialised Tracers'),
('PSMA PET-CT (Ga-68 / F-18 — Prostate)',     'pet', 'Specialised Tracers'),
('Cu-PSMA PET-CT (Prostate)',                   'pet', 'Specialised Tracers'),
('Amyloid PET (Florbetapir / Florbetaben)',    'pet', 'Specialised Tracers'),
('Tau PET (Dementia / Alzheimer''s Staging)', 'pet', 'Specialised Tracers'),
('FES PET-CT (Estrogen Receptor — Breast)',   'pet', 'Specialised Tracers'),
('NaF-18 PET (Sodium Fluoride — Bone)',       'pet', 'Specialised Tracers'),
('RubiDium-82 PET (Cardiac Perfusion)',        'pet', 'Specialised Tracers'),

-- ─────────────────────────────────────────────────────────────────────────────
-- DEXA SCAN
-- ─────────────────────────────────────────────────────────────────────────────

('BMD Lumbar Spine',                            'dexa', 'Bone Density'),
('BMD Hip Bilateral',                           'dexa', 'Bone Density'),
('BMD Hip Unilateral',                          'dexa', 'Bone Density'),
('BMD Forearm / Wrist',                         'dexa', 'Bone Density'),
('BMD Whole Body',                              'dexa', 'Bone Density'),
('Body Composition Analysis (DEXA)',            'dexa', 'Bone Density'),
('Paediatric BMD',                              'dexa', 'Bone Density'),

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC ANGIOGRAPHY  (DSA — imaging only, not therapeutic)
-- ─────────────────────────────────────────────────────────────────────────────

('Cerebral Angiography (DSA)',                  'angiography', 'Cerebrovascular'),
('Spinal Angiography',                          'angiography', 'Cerebrovascular'),
('Carotid Angiography (DSA)',                   'angiography', 'Peripheral Vascular'),
('Peripheral Angiography (Lower Limb)',         'angiography', 'Peripheral Vascular'),
('Aortic Angiography (DSA)',                    'angiography', 'Peripheral Vascular'),
('Renal Angiography',                           'angiography', 'Peripheral Vascular'),
('Mesenteric Angiography',                      'angiography', 'Peripheral Vascular'),
('Hepatic Angiography',                         'angiography', 'Peripheral Vascular'),
('Pulmonary Angiography',                       'angiography', 'Peripheral Vascular'),
('Venogram (Lower Limb)',                       'angiography', 'Venous'),
('Venogram (Upper Limb)',                       'angiography', 'Venous'),
('Coronary Angiography',                        'angiography', 'Cardiac'),

-- ─────────────────────────────────────────────────────────────────────────────
-- INTERVENTIONAL RADIOLOGY  (IR — therapeutic & guided procedures)
-- ─────────────────────────────────────────────────────────────────────────────

-- Vascular
('Angioplasty & Stenting (Peripheral)',         'interventional', 'Vascular'),
('Angioplasty & Stenting (Renal)',              'interventional', 'Vascular'),
('Angioplasty & Stenting (Carotid)',            'interventional', 'Vascular'),
('IVC Filter Placement',                        'interventional', 'Vascular'),
('Catheter-Directed Thrombolysis',              'interventional', 'Vascular'),
('Mechanical Thrombectomy (Stroke)',            'interventional', 'Vascular'),
('TIPS (Transjugular Intrahepatic Portosystemic Shunt)', 'interventional', 'Vascular'),
('Varicocele Embolization',                     'interventional', 'Vascular'),
('Splenic Embolization',                        'interventional', 'Vascular'),
('GI Bleed Embolization',                       'interventional', 'Vascular'),

-- Embolization & Ablation
('TACE (Transarterial Chemoembolization)',      'interventional', 'Embolization & Ablation'),
('TARE / Y-90 Radioembolization (SIRT)',       'interventional', 'Embolization & Ablation'),
('Uterine Artery Embolization (UAE / UFE)',    'interventional', 'Embolization & Ablation'),
('AVM Embolization',                            'interventional', 'Embolization & Ablation'),
('Aneurysm Coiling (Cerebral)',                 'interventional', 'Embolization & Ablation'),
('Tumor Ablation — Radiofrequency (RFA)',       'interventional', 'Embolization & Ablation'),
('Tumor Ablation — Microwave (MWA)',            'interventional', 'Embolization & Ablation'),
('Tumor Ablation — Cryoablation',              'interventional', 'Embolization & Ablation'),

-- Biliary & Drainage
('PTBD (Percutaneous Transhepatic Biliary Drainage)', 'interventional', 'Biliary & Drainage'),
('Biliary Stenting (Percutaneous)',             'interventional', 'Biliary & Drainage'),
('CT-Guided Abscess Drainage',                  'interventional', 'Biliary & Drainage'),
('CT-Guided Fluid Aspiration',                  'interventional', 'Biliary & Drainage'),

-- Renal
('PCN (Percutaneous Nephrostomy)',              'interventional', 'Renal'),
('Nephrostomy Tube Exchange',                   'interventional', 'Renal'),

-- Biopsy
('CT-Guided Biopsy',                            'interventional', 'Biopsy'),
('USG-Guided Biopsy (IR)',                      'interventional', 'Biopsy'),
('Bone Marrow Biopsy (Image-guided)',           'interventional', 'Biopsy'),

-- Pain Management
('Vertebroplasty',                              'interventional', 'Pain Management'),
('Kyphoplasty',                                 'interventional', 'Pain Management'),
('Epidural Steroid Injection',                  'interventional', 'Pain Management'),
('Facet Joint Injection / Medial Branch Block','interventional', 'Pain Management'),
('Selective Nerve Root Block (SNRB)',           'interventional', 'Pain Management'),
('Trigger Point Injection (Image-guided)',      'interventional', 'Pain Management'),

-- Vascular Access
('Port-a-Cath Insertion',                       'interventional', 'Vascular Access'),
('PICC Line Insertion',                         'interventional', 'Vascular Access'),
('Tunnelled Central Line Insertion',            'interventional', 'Vascular Access'),

-- Other IR
('Percutaneous Gastrostomy (RIG / PIG)',        'interventional', 'Other'),
('Fallopian Tube Recanalisation',               'interventional', 'Other'),
('Endovascular Aortic Repair (EVAR) Guidance', 'interventional', 'Other'),

-- ─────────────────────────────────────────────────────────────────────────────
-- DENTAL IMAGING
-- ─────────────────────────────────────────────────────────────────────────────

('OPG (Orthopantomogram)',                      'dental', 'Dental'),
('Lateral Cephalogram',                         'dental', 'Dental'),
('CBCT (Cone Beam CT)',                         'dental', 'Dental'),
('Periapical X-Ray',                            'dental', 'Dental'),
('Bitewing X-Ray',                              'dental', 'Dental'),
('TMJ X-Ray',                                   'dental', 'Dental'),
('Dental Full Mouth X-Ray (FMX)',              'dental', 'Dental'),

-- ─────────────────────────────────────────────────────────────────────────────
-- OPHTHALMIC IMAGING
-- ─────────────────────────────────────────────────────────────────────────────

('Fundus Photography',                          'ophthalmic', 'Retinal Imaging'),
('Optical Coherence Tomography (OCT)',          'ophthalmic', 'Retinal Imaging'),
('OCT Angiography (OCTA)',                      'ophthalmic', 'Retinal Imaging'),
('Fluorescein Angiography (FFA)',               'ophthalmic', 'Retinal Imaging'),
('Indocyanine Green Angiography (ICG)',         'ophthalmic', 'Retinal Imaging'),
('Wide-Field Fundus Photography',               'ophthalmic', 'Retinal Imaging'),
('Visual Field Testing (Perimetry)',            'ophthalmic', 'Anterior Segment'),
('Corneal Topography',                          'ophthalmic', 'Anterior Segment'),
('Corneal Pachymetry',                          'ophthalmic', 'Anterior Segment'),
('Optical Biometry (IOL Master)',               'ophthalmic', 'Anterior Segment'),

-- ─────────────────────────────────────────────────────────────────────────────
-- SPECIAL / MISCELLANEOUS
-- ─────────────────────────────────────────────────────────────────────────────

('Sialogram',                                   'special', 'Special'),
('Dacryocystogram (DCG)',                       'special', 'Special'),
('Lymphangiogram',                              'special', 'Special'),
('Arthrogram (MRI-guided)',                     'special', 'Special'),
('Myelogram',                                   'special', 'Special'),
('Radiation Therapy Planning CT (Simulation CT)', 'special', 'Special'),
('Hysteroscopy Imaging',                        'special', 'Special');
