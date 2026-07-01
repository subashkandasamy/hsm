import { createServiceClient } from '@/lib/supabase/service'

// ─── Lab test seed data ────────────────────────────────────────────────────────
// All tests start is_active=false, price=1 so admins enable & price them per their setup.
// code is null to avoid the global UNIQUE constraint conflict across tenants.

type LabSeed = {
  name: string; sample_type: string
  unit: string | null; ref_low: number | null; ref_high: number | null
  reference_range: string | null
}

const LAB_TESTS: LabSeed[] = [
  // ── CBC / Haematology ──────────────────────────────────────────────────────
  { name: 'Haemoglobin',              sample_type: 'blood', unit: 'g/dL',         ref_low: 11.5,  ref_high: 17.5,   reference_range: '11.5–17.5 g/dL' },
  { name: 'WBC Count',                sample_type: 'blood', unit: '/μL',           ref_low: 4000,  ref_high: 11000,  reference_range: '4,000–11,000 /μL' },
  { name: 'RBC Count',                sample_type: 'blood', unit: 'million/μL',    ref_low: 4.0,   ref_high: 5.5,    reference_range: '4.0–5.5 million/μL' },
  { name: 'Platelet Count',           sample_type: 'blood', unit: '/μL',           ref_low: 150000,ref_high: 400000, reference_range: '1,50,000–4,00,000 /μL' },
  { name: 'PCV / Haematocrit',        sample_type: 'blood', unit: '%',             ref_low: 36,    ref_high: 50,     reference_range: '36–50%' },
  { name: 'MCV',                      sample_type: 'blood', unit: 'fL',            ref_low: 80,    ref_high: 100,    reference_range: '80–100 fL' },
  { name: 'MCH',                      sample_type: 'blood', unit: 'pg',            ref_low: 27,    ref_high: 33,     reference_range: '27–33 pg' },
  { name: 'MCHC',                     sample_type: 'blood', unit: 'g/dL',          ref_low: 31.5,  ref_high: 34.5,   reference_range: '31.5–34.5 g/dL' },
  { name: 'Differential Count',       sample_type: 'blood', unit: null,            ref_low: null,  ref_high: null,   reference_range: 'N: 40–70%, L: 20–40%, M: 2–8%, E: 1–4%' },
  { name: 'ESR',                      sample_type: 'blood', unit: 'mm/hr',         ref_low: 0,     ref_high: 20,     reference_range: 'M: 0–15  F: 0–20 mm/hr' },
  { name: 'Peripheral Blood Smear',   sample_type: 'blood', unit: null,            ref_low: null,  ref_high: null,   reference_range: 'Normocytic normochromic RBCs' },
  { name: 'Reticulocyte Count',       sample_type: 'blood', unit: '%',             ref_low: 0.5,   ref_high: 1.5,    reference_range: '0.5–1.5%' },

  // ── Blood Glucose ──────────────────────────────────────────────────────────
  { name: 'Fasting Blood Glucose',        sample_type: 'blood', unit: 'mg/dL', ref_low: 70,  ref_high: 100, reference_range: '70–100 mg/dL (Normal)' },
  { name: 'Post-Prandial Blood Glucose',  sample_type: 'blood', unit: 'mg/dL', ref_low: 70,  ref_high: 140, reference_range: '70–140 mg/dL' },
  { name: 'Random Blood Sugar',           sample_type: 'blood', unit: 'mg/dL', ref_low: 70,  ref_high: 200, reference_range: '70–200 mg/dL' },
  { name: 'HbA1c',                        sample_type: 'blood', unit: '%',     ref_low: 4.0, ref_high: 5.6, reference_range: '< 5.7% Normal  5.7–6.4% Pre-diabetic' },

  // ── Kidney Function (KFT) ──────────────────────────────────────────────────
  { name: 'Blood Urea',       sample_type: 'blood', unit: 'mg/dL',         ref_low: 15,  ref_high: 45,   reference_range: '15–45 mg/dL' },
  { name: 'Serum Creatinine', sample_type: 'blood', unit: 'mg/dL',         ref_low: 0.6, ref_high: 1.2,  reference_range: '0.6–1.2 mg/dL' },
  { name: 'Uric Acid',        sample_type: 'blood', unit: 'mg/dL',         ref_low: 3.5, ref_high: 7.2,  reference_range: '3.5–7.2 mg/dL' },
  { name: 'Blood Urea Nitrogen (BUN)', sample_type: 'blood', unit: 'mg/dL', ref_low: 7,  ref_high: 25,   reference_range: '7–25 mg/dL' },
  { name: 'eGFR',             sample_type: 'blood', unit: 'mL/min/1.73m²', ref_low: 60,  ref_high: null, reference_range: '> 60 mL/min/1.73m² (Normal)' },

  // ── Liver Function (LFT) ──────────────────────────────────────────────────
  { name: 'SGOT / AST',               sample_type: 'blood', unit: 'U/L',  ref_low: 10,  ref_high: 40,  reference_range: '10–40 U/L' },
  { name: 'SGPT / ALT',               sample_type: 'blood', unit: 'U/L',  ref_low: 7,   ref_high: 56,  reference_range: '7–56 U/L' },
  { name: 'Alkaline Phosphatase (ALP)',sample_type: 'blood', unit: 'U/L',  ref_low: 44,  ref_high: 147, reference_range: '44–147 U/L' },
  { name: 'GGT',                       sample_type: 'blood', unit: 'U/L',  ref_low: 9,   ref_high: 48,  reference_range: '9–48 U/L' },
  { name: 'Total Bilirubin',           sample_type: 'blood', unit: 'mg/dL',ref_low: 0.1, ref_high: 1.2, reference_range: '0.1–1.2 mg/dL' },
  { name: 'Direct Bilirubin',          sample_type: 'blood', unit: 'mg/dL',ref_low: 0.0, ref_high: 0.3, reference_range: '0.0–0.3 mg/dL' },
  { name: 'Indirect Bilirubin',        sample_type: 'blood', unit: 'mg/dL',ref_low: 0.1, ref_high: 1.0, reference_range: '0.1–1.0 mg/dL' },
  { name: 'Total Protein',             sample_type: 'blood', unit: 'g/dL', ref_low: 6.0, ref_high: 8.3, reference_range: '6.0–8.3 g/dL' },
  { name: 'Albumin',                   sample_type: 'blood', unit: 'g/dL', ref_low: 3.5, ref_high: 5.0, reference_range: '3.5–5.0 g/dL' },
  { name: 'Globulin',                  sample_type: 'blood', unit: 'g/dL', ref_low: 2.0, ref_high: 3.5, reference_range: '2.0–3.5 g/dL' },

  // ── Lipid Profile ──────────────────────────────────────────────────────────
  { name: 'Total Cholesterol', sample_type: 'blood', unit: 'mg/dL', ref_low: null, ref_high: 200,  reference_range: '< 200 mg/dL (Desirable)' },
  { name: 'LDL Cholesterol',   sample_type: 'blood', unit: 'mg/dL', ref_low: null, ref_high: 100,  reference_range: '< 100 mg/dL (Optimal)' },
  { name: 'HDL Cholesterol',   sample_type: 'blood', unit: 'mg/dL', ref_low: 40,   ref_high: null, reference_range: '> 40 mg/dL (Men)  > 50 mg/dL (Women)' },
  { name: 'Triglycerides',     sample_type: 'blood', unit: 'mg/dL', ref_low: null, ref_high: 150,  reference_range: '< 150 mg/dL' },
  { name: 'VLDL Cholesterol',  sample_type: 'blood', unit: 'mg/dL', ref_low: null, ref_high: 30,   reference_range: '< 30 mg/dL' },

  // ── Thyroid ────────────────────────────────────────────────────────────────
  { name: 'TSH',     sample_type: 'blood', unit: 'mIU/L', ref_low: 0.4, ref_high: 4.0, reference_range: '0.4–4.0 mIU/L' },
  { name: 'Free T3', sample_type: 'blood', unit: 'pg/mL', ref_low: 2.3, ref_high: 4.2, reference_range: '2.3–4.2 pg/mL' },
  { name: 'Free T4', sample_type: 'blood', unit: 'ng/dL', ref_low: 0.8, ref_high: 1.8, reference_range: '0.8–1.8 ng/dL' },
  { name: 'T3 (Total)', sample_type: 'blood', unit: 'ng/dL', ref_low: 80, ref_high: 200, reference_range: '80–200 ng/dL' },
  { name: 'T4 (Total)', sample_type: 'blood', unit: 'μg/dL', ref_low: 5.0, ref_high: 12.0, reference_range: '5.0–12.0 μg/dL' },

  // ── Electrolytes ───────────────────────────────────────────────────────────
  { name: 'Sodium',     sample_type: 'blood', unit: 'mEq/L', ref_low: 135, ref_high: 145,  reference_range: '135–145 mEq/L' },
  { name: 'Potassium',  sample_type: 'blood', unit: 'mEq/L', ref_low: 3.5, ref_high: 5.0,  reference_range: '3.5–5.0 mEq/L' },
  { name: 'Chloride',   sample_type: 'blood', unit: 'mEq/L', ref_low: 96,  ref_high: 106,  reference_range: '96–106 mEq/L' },
  { name: 'Calcium',    sample_type: 'blood', unit: 'mg/dL', ref_low: 8.5, ref_high: 10.5, reference_range: '8.5–10.5 mg/dL' },
  { name: 'Magnesium',  sample_type: 'blood', unit: 'mg/dL', ref_low: 1.7, ref_high: 2.2,  reference_range: '1.7–2.2 mg/dL' },
  { name: 'Phosphorus', sample_type: 'blood', unit: 'mg/dL', ref_low: 2.5, ref_high: 4.5,  reference_range: '2.5–4.5 mg/dL' },

  // ── Inflammation / Coagulation ─────────────────────────────────────────────
  { name: 'CRP (C-Reactive Protein)', sample_type: 'blood', unit: 'mg/L',    ref_low: null, ref_high: 10,   reference_range: '< 10 mg/L (Normal)' },
  { name: 'Prothrombin Time (PT)',    sample_type: 'blood', unit: 'seconds',  ref_low: 11,   ref_high: 13.5, reference_range: '11–13.5 seconds' },
  { name: 'INR',                      sample_type: 'blood', unit: 'ratio',    ref_low: 0.8,  ref_high: 1.2,  reference_range: '0.8–1.2 (Non-anticoagulated)' },
  { name: 'aPTT',                     sample_type: 'blood', unit: 'seconds',  ref_low: 25,   ref_high: 35,   reference_range: '25–35 seconds' },
  { name: 'D-Dimer',                  sample_type: 'blood', unit: 'ng/mL',    ref_low: null, ref_high: 500,  reference_range: '< 500 ng/mL' },

  // ── Vitamins & Minerals ────────────────────────────────────────────────────
  { name: 'Vitamin D (25-OH)',  sample_type: 'blood', unit: 'ng/mL', ref_low: 30,  ref_high: 100, reference_range: '30–100 ng/mL (Normal)' },
  { name: 'Vitamin B12',        sample_type: 'blood', unit: 'pg/mL', ref_low: 200, ref_high: 900, reference_range: '200–900 pg/mL' },
  { name: 'Folate (Folic Acid)',sample_type: 'blood', unit: 'ng/mL', ref_low: 3.0, ref_high: 17,  reference_range: '3.0–17 ng/mL' },
  { name: 'Serum Iron',         sample_type: 'blood', unit: 'μg/dL', ref_low: 60,  ref_high: 170, reference_range: '60–170 μg/dL' },
  { name: 'Serum Ferritin',     sample_type: 'blood', unit: 'ng/mL', ref_low: 12,  ref_high: 300, reference_range: '12–300 ng/mL' },
  { name: 'TIBC',               sample_type: 'blood', unit: 'μg/dL', ref_low: 250, ref_high: 370, reference_range: '250–370 μg/dL' },
  { name: 'Transferrin Saturation', sample_type: 'blood', unit: '%', ref_low: 20,  ref_high: 50,  reference_range: '20–50%' },

  // ── Cardiac ────────────────────────────────────────────────────────────────
  { name: 'Troponin I',     sample_type: 'blood', unit: 'ng/mL', ref_low: null, ref_high: 0.04, reference_range: '< 0.04 ng/mL' },
  { name: 'CPK-MB',         sample_type: 'blood', unit: 'U/L',   ref_low: null, ref_high: 25,   reference_range: '< 25 U/L' },
  { name: 'LDH',            sample_type: 'blood', unit: 'U/L',   ref_low: 140,  ref_high: 280,  reference_range: '140–280 U/L' },
  { name: 'BNP / NT-proBNP',sample_type: 'blood', unit: 'pg/mL', ref_low: null, ref_high: 125,  reference_range: '< 125 pg/mL' },

  // ── Infection / Serology ───────────────────────────────────────────────────
  { name: 'Widal Test',         sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'O ≤ 1:80  H ≤ 1:80 (Negative)' },
  { name: 'Dengue NS1 Antigen', sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Non-reactive' },
  { name: 'Malaria Antigen',    sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Negative' },
  { name: 'HIV 1 & 2 (ELISA)',  sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Non-reactive' },
  { name: 'HBsAg',              sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Non-reactive' },
  { name: 'Anti-HCV',           sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Non-reactive' },
  { name: 'VDRL / RPR',         sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Non-reactive' },
  { name: 'RA Factor',          sample_type: 'blood', unit: 'IU/mL', ref_low: null, ref_high: 14, reference_range: '< 14 IU/mL (Negative)' },
  { name: 'ASO Titre',          sample_type: 'blood', unit: 'IU/mL', ref_low: null, ref_high: 200,reference_range: '< 200 IU/mL' },
  { name: 'ANA (FANA)',         sample_type: 'blood', unit: null, ref_low: null, ref_high: null, reference_range: 'Negative at 1:80 dilution' },

  // ── Hormones ───────────────────────────────────────────────────────────────
  { name: 'FSH',              sample_type: 'blood', unit: 'mIU/mL', ref_low: 1.5, ref_high: 12.4, reference_range: '1.5–12.4 mIU/mL (Follicular)' },
  { name: 'LH',               sample_type: 'blood', unit: 'mIU/mL', ref_low: 1.9, ref_high: 12.5, reference_range: '1.9–12.5 mIU/mL (Follicular)' },
  { name: 'Prolactin',        sample_type: 'blood', unit: 'ng/mL',  ref_low: 2.0, ref_high: 29.0, reference_range: '2.0–29.0 ng/mL' },
  { name: 'Serum Testosterone',sample_type: 'blood', unit: 'ng/dL', ref_low: 300, ref_high: 1000, reference_range: '300–1000 ng/dL (Men)' },
  { name: 'Serum Cortisol (AM)',sample_type: 'blood', unit: 'μg/dL',ref_low: 6.2, ref_high: 19.4, reference_range: '6.2–19.4 μg/dL (8 AM)' },
  { name: 'Beta-HCG',         sample_type: 'blood', unit: 'mIU/mL', ref_low: null,ref_high: 5,    reference_range: '< 5 mIU/mL (Non-pregnant)' },
  { name: 'Insulin (Fasting)', sample_type: 'blood', unit: 'μIU/mL',ref_low: 2.6, ref_high: 24.9, reference_range: '2.6–24.9 μIU/mL' },

  // ── Urine Tests ────────────────────────────────────────────────────────────
  { name: 'Complete Urine Examination',  sample_type: 'urine', unit: null,    ref_low: null, ref_high: null, reference_range: 'Colour: Yellow  pH: 4.5–8.0  Protein: Nil  Sugar: Nil  Deposits: 0–5 cells/HPF' },
  { name: 'Urine Culture & Sensitivity', sample_type: 'urine', unit: null,    ref_low: null, ref_high: null, reference_range: 'No growth (Sterile)' },
  { name: 'Urine Albumin',               sample_type: 'urine', unit: 'mg/dL', ref_low: null, ref_high: 30,   reference_range: '< 30 mg/dL' },
  { name: 'Urine Glucose',               sample_type: 'urine', unit: null,    ref_low: null, ref_high: null, reference_range: 'Nil' },
  { name: 'Urine Creatinine',            sample_type: 'urine', unit: 'mg/dL', ref_low: 40,   ref_high: 300,  reference_range: '40–300 mg/dL' },
  { name: 'Urine Microalbumin',          sample_type: 'urine', unit: 'mg/L',  ref_low: null, ref_high: 20,   reference_range: '< 20 mg/L (Normal)' },
  { name: 'Urine Protein',               sample_type: 'urine', unit: null,    ref_low: null, ref_high: null, reference_range: 'Nil' },
  { name: '24hr Urine Protein',          sample_type: 'urine', unit: 'mg/24hr',ref_low: null,ref_high: 150,  reference_range: '< 150 mg/24hr' },
  { name: '24hr Urine Creatinine',       sample_type: 'urine', unit: 'g/24hr', ref_low: 0.6, ref_high: 2.5,  reference_range: '0.6–2.5 g/24hr' },
  { name: 'Urine Sodium',                sample_type: 'urine', unit: 'mEq/L', ref_low: 40,   ref_high: 220,  reference_range: '40–220 mEq/L' },
  { name: 'Urine Potassium',             sample_type: 'urine', unit: 'mEq/L', ref_low: 25,   ref_high: 125,  reference_range: '25–125 mEq/L' },
]

// ─── Radiology seed data ───────────────────────────────────────────────────────

type RadSeed = { name: string; modality: string }

const RADIOLOGY_PROCEDURES: RadSeed[] = [
  // ── X-Ray ─────────────────────────────────────────────────────────────────
  { name: 'Chest X-Ray PA View',              modality: 'xray' },
  { name: 'Chest X-Ray AP View',              modality: 'xray' },
  { name: 'X-Ray Skull (AP / Lateral)',       modality: 'xray' },
  { name: 'X-Ray Cervical Spine (AP / Lateral)',    modality: 'xray' },
  { name: 'X-Ray Thoracic Spine (AP / Lateral)',    modality: 'xray' },
  { name: 'X-Ray Lumbar Spine (AP / Lateral)',      modality: 'xray' },
  { name: 'X-Ray Abdomen (Erect)',            modality: 'xray' },
  { name: 'X-Ray Pelvis',                     modality: 'xray' },
  { name: 'X-Ray Right Shoulder',             modality: 'xray' },
  { name: 'X-Ray Left Shoulder',              modality: 'xray' },
  { name: 'X-Ray Right Hand',                 modality: 'xray' },
  { name: 'X-Ray Left Hand',                  modality: 'xray' },
  { name: 'X-Ray Right Knee',                 modality: 'xray' },
  { name: 'X-Ray Left Knee',                  modality: 'xray' },
  { name: 'X-Ray Right Foot',                 modality: 'xray' },
  { name: 'X-Ray Left Foot',                  modality: 'xray' },
  { name: 'X-Ray Right Hip',                  modality: 'xray' },
  { name: 'X-Ray Left Hip',                   modality: 'xray' },

  // ── Ultrasound ────────────────────────────────────────────────────────────
  { name: 'USG Abdomen (Whole)',               modality: 'usg' },
  { name: 'USG Abdomen & Pelvis',              modality: 'usg' },
  { name: 'USG Pelvis (Lower Abdomen)',        modality: 'usg' },
  { name: 'USG Obstetric (Dating Scan)',       modality: 'usg' },
  { name: 'USG Obstetric (Anomaly Scan)',      modality: 'usg' },
  { name: 'USG Neck / Thyroid',               modality: 'usg' },
  { name: 'USG KUB (Kidneys, Ureters, Bladder)', modality: 'usg' },
  { name: 'USG Scrotum',                       modality: 'usg' },
  { name: 'USG Breast (Bilateral)',            modality: 'usg' },
  { name: 'USG Guided FNAC',                  modality: 'usg' },
  { name: 'Colour Doppler Carotid',           modality: 'usg' },
  { name: 'Colour Doppler Lower Limb Venous', modality: 'usg' },
  { name: 'Colour Doppler Lower Limb Arterial',modality: 'usg' },
  { name: 'Echocardiography (2D Echo)',       modality: 'usg' },

  // ── CT Scan ───────────────────────────────────────────────────────────────
  { name: 'CT Brain (Plain)',                  modality: 'ct' },
  { name: 'CT Brain (With Contrast)',          modality: 'ct' },
  { name: 'CT Chest',                          modality: 'ct' },
  { name: 'CT Chest (With Contrast)',          modality: 'ct' },
  { name: 'CT Abdomen & Pelvis (Plain)',       modality: 'ct' },
  { name: 'CT Abdomen & Pelvis (With Contrast)',modality: 'ct' },
  { name: 'CT KUB',                            modality: 'ct' },
  { name: 'CT Paranasal Sinuses',              modality: 'ct' },
  { name: 'CT Lumbar Spine',                   modality: 'ct' },
  { name: 'CT Cervical Spine',                 modality: 'ct' },
  { name: 'CT Angiography Brain',              modality: 'ct' },
  { name: 'CT Angiography Coronary',          modality: 'ct' },

  // ── MRI ───────────────────────────────────────────────────────────────────
  { name: 'MRI Brain (Plain)',                 modality: 'mri' },
  { name: 'MRI Brain (With Contrast)',         modality: 'mri' },
  { name: 'MRI Cervical Spine',                modality: 'mri' },
  { name: 'MRI Thoracic Spine',               modality: 'mri' },
  { name: 'MRI Lumbar Spine',                  modality: 'mri' },
  { name: 'MRI Right Knee',                    modality: 'mri' },
  { name: 'MRI Left Knee',                     modality: 'mri' },
  { name: 'MRI Right Shoulder',               modality: 'mri' },
  { name: 'MRI Left Shoulder',                modality: 'mri' },
  { name: 'MRI Abdomen & Pelvis',             modality: 'mri' },
  { name: 'MRI Breast (Bilateral)',            modality: 'mri' },
  { name: 'MRI Angiography Brain',            modality: 'mri' },

  // ── Mammography ───────────────────────────────────────────────────────────
  { name: 'Mammography Bilateral',             modality: 'mammography' },
  { name: 'Mammography Unilateral',            modality: 'mammography' },
  { name: 'Mammography with USG Breast',       modality: 'mammography' },
]

// ─── Seed functions ────────────────────────────────────────────────────────────

export async function seedLabCatalog(tenantId: string): Promise<void> {
  const service = createServiceClient()
  const rows = LAB_TESTS.map((t) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    code: null,
    is_active: false,
    price: 1,
    ...t,
  }))
  // Insert in batches of 50 to stay well within Supabase request limits
  for (let i = 0; i < rows.length; i += 50) {
    await service.from('lab_tests_catalog').insert(rows.slice(i, i + 50))
  }
}

export async function seedRadiologyCatalog(tenantId: string): Promise<void> {
  const service = createServiceClient()
  const rows = RADIOLOGY_PROCEDURES.map((t) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    is_active: false,
    price: 1,
    ...t,
  }))
  await service.from('radiology_catalog').insert(rows)
}
