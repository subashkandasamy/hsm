/*
 * How SwiftEHR's lab tests and report lines map onto Uyirly.
 *
 * Tests map to KMCH's catalogue by NAME (KMCH's catalogue was built from
 * SwiftEHR's list, so a name written differently is still the same test).
 * Another hospital (the demo rehearsal) gets the row that shares that test's
 * master entry. Names are compared without spaces or punctuation, so
 * "FASTING SUGAR " and "Fasting Sugar" are the same key.
 *
 * Report lines map to Uyirly measurements (lab_analytes.code). A line with no
 * Uyirly measurement maps to one of the old-only lines added by migration
 * 0305 (granulocytes, MID cells, urine bile salt and albumin), which print
 * only on the reports that have them.
 */
export const key = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Charged through SwiftEHR's lab screen but not lab tests; never resulted there. They stay on the old bills. */
export const NOT_LAB = new Set(['ECG', 'CHESTXRAY', 'ECHOTMT', 'PULMONARYFUNCTIONTEST', 'USGABDOMEN', 'TMT'].map(key))

/** SwiftEHR test → KMCH catalogue test name. Tests whose names already match are not listed. */
export const TEST_TO_KMCH: Record<string, string> = Object.fromEntries(Object.entries({
  'COMPLETE BLOOD COUNT': 'Complete Blood Count (CBC)',
  'URINE ANALYSIS': 'Urine Routine and Microscopy',
  'LIVER FUNCTION TEST': 'Liver Function Test (LFT)',
  'CRP': 'CRP (C-Reactive Protein)',
  'SUGARSTRIP': 'Blood Glucose (Glucometer Strip)',
  'FASTING SUGAR': 'Fasting Blood Sugar (FBS)',
  'POST PRANDIAL SUGAR': 'Post Prandial Blood Sugar (PPBS)',
  'BLOOD GROUPING & RH TYPING': 'Blood Group and Rh Typing',
  'ABG WITH LACTATE': 'Arterial Blood Gas (ABG) with Lactate',
  'VBG WITH LACTATE': 'Venous Blood Gas (VBG) with Lactate',
  'THYROID FUNCTION TEST': 'Thyroid Profile (T3, T4, TSH)',
  'FREE THYROID FUNCTION TEST': 'Free Thyroid Profile (FT3, FT4, TSH)',
  'HIV1 & HIV2': 'HIV 1 and 2 Antibody',
  'HBSAG': 'HBsAg (Hepatitis B Surface Antigen)',
  'HCV': 'Anti-HCV (Hepatitis C Antibody)',
  'RFT': 'Renal Function Test (RFT)',
  'RENAL FUNCTION TEST': 'Renal Function Test (RFT)',
  'VITAMIN-D': 'Vitamin D (25-OH)',
  'VITAMIN B12': 'Vitamin B12 (Cobalamin)',
  'VITAMIN-B12': 'Vitamin B12 (Cobalamin)',
  'VDRL': 'VDRL / RPR (Syphilis Screening)',
  'Urine Culture & Sensitivity': 'Urine Culture and Sensitivity',
  'ESR': 'ESR (Erythrocyte Sedimentation Rate)',
  'TOTAL BILLIRUBIN': 'Total Bilirubin',
  'DIRECT BILLIRUBIN': 'Direct Bilirubin',
  'INDIRECT BILLIRUBIN': 'Indirect Bilirubin',
  'IRON PROFILE WITH TIBC&TRANSFERIN S': 'Iron Profile with TIBC and Transferrin Saturation',
  'WBCT': 'Whole Blood Clotting Time',
  'GROUPING': 'ABO Blood Grouping',
  'RA FACTOR': 'Rheumatoid Factor (RA Factor)',
  'PREGNANCY TEST': 'Urine Pregnancy Test (UPT)',
  'Blood Culture & Sensitivity': 'Blood Culture and Sensitivity',
  'WOUND SWAB CULTURE & SENSITIVITY': 'Wound Swab Culture and Sensitivity',
  'DENGUE IgG,IgM': 'Dengue Antibody IgG and IgM',
  'PROTHROBIN TIME ( PT )': 'Prothrombin Time (PT)',
  'INR': 'INR (International Normalised Ratio)',
  'WIDAL': 'Widal Test',
  'APTT': 'aPTT (Activated Partial Thromboplastin Time)',
  'PERIPHERAL SMEAR': 'Peripheral Blood Smear',
  'REGULAR HEALTH CHECK UP': 'Health Check-Up – Comprehensive',
  'BASIC HEALTH CHECK UP': 'Health Check-Up – Basic',
  'CHOLINESTERASE ( COE )': 'Cholinesterase',
  'RETICLOCYTE COUNT': 'Reticulocyte Count',
  'TSH': 'TSH (Thyroid Stimulating Hormone)',
  'MALARIA PARASITE (CARD TEST )': 'Malaria Parasite Antigen (Rapid Card)',
  'SPUTUM AFB': 'Sputum AFB Smear',
  'PLEURAL FLUID CULTURE': 'Pleural Fluid Culture and Sensitivity',
  'BLOOD SUGAR FASTING & PP': 'Blood Sugar – Fasting and Post Prandial',
  'SPUTUM CULTURE': 'Sputum Culture and Sensitivity',
  'SPOT URINE SODIUM': 'Urine Sodium (Spot)',
  'By Capillary Electrophoresis': 'Serum Protein Electrophoresis (Capillary)',
  'Parameters': 'Serum Protein Electrophoresis – Parameters',
  'Conc g/dl': 'Serum Protein Electrophoresis – Concentration (g/dl)',
  'COMMENTS( S P E )': 'Serum Protein Electrophoresis – Comments',
  'HAV IGM': 'HAV IgM (Hepatitis A)',
  'ANTI LEPTOSPIRA ANTIBODY IGM': 'Leptospira IgM (MAT)',
  'CPK': 'Creatine Phosphokinase (CPK)',
  'TROPONIN T ( CARD )': 'Troponin T (Rapid Card)',
  'SCRUB TYPHUS IgG,IgM': 'Scrub Typhus Antibody IgG and IgM',
  'C-PEPTIED': 'C-Peptide',
  'ANTI GAD': 'Anti-GAD Antibody (Glutamic Acid Decarboxylase)',
  'BAL SMEAR FOR AFB': 'Bronchoalveolar Lavage AFB Smear',
  'BAL KOH MOUNT FOR FUNGUS': 'Bronchoalveolar Lavage KOH Mount for Fungus',
  'BAL MODIFIED AFB STAIN FOR NOCARDIA': 'Bronchoalveolar Lavage Modified AFB Stain (Nocardia)',
  'BAL CYTOLOGY': 'Bronchoalveolar Lavage Cytology',
  'BAL TBLB': 'Transbronchial Lung Biopsy (TBLB)',
  'BAL AFB CULTUE': 'BAL AFB Culture',
  'PLEURAL FLUID AFB': 'Pleural Fluid AFB Smear',
  'ABSOLUTE EOSINOPHILS COUNT': 'Absolute Eosinophil Count (AEC)',
  'TYPHIDOT IgM': 'Typhidot IgM (S. typhi OMP antibody)',
  'URINE PCR': 'Urine Protein Creatinine Ratio',
}).map(([k, v]) => [key(k), v]))

/** Tests KMCH's catalogue does not have: added switched off, from these master codes. */
export const MISSING_AT_KMCH: Record<string, string> = { 'HAV IgM (Hepatitis A)': 'HAVIGM', 'Leptospira IgM (MAT)': 'LEPIGM' }

/** Report line → Uyirly measurement code. */
export const LINE_TO_ANALYTE: Record<string, string> = Object.fromEntries(Object.entries({
  // Blood count (SwiftEHR's analyser is 3-part: granulocytes / lymphocytes / MID)
  'HAEMOGLOBIN': 'HGB', 'R.B.CS COUNT': 'RBC', 'PACKED CELL VOLUME': 'HCT', 'MCV': 'MCV', 'MCH': 'MCH', 'MCHC': 'MCHC',
  'TOTAL WBC COUNT': 'WBC', 'GRANULOCYTE': 'GRAN_PCT', 'LYMPHOCYTE': 'LYMPH_PCT', 'EOSINOPHILS': 'EOS_PCT',
  'GRA': 'GRAN_ABS', 'LYM': 'LYMPH_ABS', 'MID': 'MID_ABS', 'Platelets Counts': 'PLT', 'MPV': 'MPV', 'PDWc': 'PDW_CV', 'PCT': 'PCT',
  // SwiftEHR's two RDW labels are swapped against their values: "RDWc" ~45 is RDW-SD (fL), "RDWs" ~14 is RDW-CV (%).
  'RDWc': 'RDW_SD', 'RDWs': 'RDW_CV',
  // Urine
  'COLOUR': 'UR_COLOUR', 'PH': 'UR_PH', 'SG': 'UR_SG', 'PROTEIN': 'UR_PROT', 'SUGAR': 'UR_GLU', 'KETONE': 'UR_KET',
  'BILE PIGMENT': 'UR_BIL', 'BILE SALT': 'UR_BILESALT', 'NITRITE': 'UR_NIT', 'PUS CELLS': 'UR_PUS', 'R.B.CS': 'UR_RBC',
  'EPITHELIAL CELLS': 'UR_EPI', 'CAST': 'UR_CAST', 'BACTERIA': 'UR_BACT',
  // Liver
  'TOTAL BILLIRUBIN': 'TBIL', 'TOTAL BILIRUBIN': 'TBIL', 'DIRECT BILIRUBIN': 'DBIL', 'DIRECT BILLIRUBIN': 'DBIL',
  'INDIRECT BILLIRUBIN': 'IBIL', 'INDIRECT BILIRUBIN': 'IBIL', 'SGOT-AST': 'SGOT', 'SGPT-ALT': 'SGPT',
  'ALKALINE PHOSPHATE -ALP': 'ALP', 'TOTAL PROTEIN': 'TP', 'ALBUMIN': 'ALB', 'GLOBULIN': 'GLOB', 'A/G RATIO': 'AG_RATIO',
  // Electrolytes, kidney
  'SODIUM': 'NA', 'POTASSIUM': 'K', 'CHOLRIDE': 'CL', 'CHLORIDE': 'CL', 'BIOCARBANATE': 'HCO3', 'BICARBONATE': 'HCO3',
  'IONIZED CALCIUM ( iCA )': 'ICA', 'UREA': 'UREA', 'CREATININE': 'CREAT', 'URIC ACID': 'UA',
  // Lipids
  'TOTAL CHOLESTEROL': 'TC', 'TRIGLYCERIDES': 'TRIG', 'HDL': 'HDL', 'LDL': 'LDL', 'VLDL': 'VLDL', 'CHO/HDL': 'TC_HDL', 'LDL/HDL': 'LDL_HDL',
  // Blood gas
  'PO2': 'PO2', 'PCO2': 'PCO2', 'tHB ( est ),r': 'BG_THB', 'HCO3-act,r': 'HCO3', 'Hct': 'BG_HCT', 'LACTATE': 'LACT',
  'BE ( ecf ),r': 'BE_ECF', 'PH ABG': 'BG_PH', 'Na': 'NA', 'K': 'K', 'GLUCOSE': 'BG_GLU', 'Ca': 'ICA', 'Cl -': 'CL',
  // Sugar, thyroid
  'HBA1C': 'HBA1C', 'MBG': 'EAG', 'FASTING SUGAR': 'FBG', 'POST PRANDIAL SUGAR': 'PPBG', 'RANDOM SUGAR': 'RBSG',
  'T3': 'T3', 'T4': 'T4', 'TSH': 'TSH', 'FT3': 'FT3', 'FT4': 'FT4',
  // Others
  'GROUPING': 'BG_ABO', 'RH TYPING': 'BG_RH', 'PROTHROBIN TIME ( PT )': 'PT_SEC', 'INR': 'INR', 'APTT': 'APTT_SEC',
  'IRON': 'IRON', 'TIBC': 'TIBC', 'UIBC': 'UIBC', 'TRANSFERRIN SATURATION': 'TSAT',
  'APOLIPOPROTEIN-A1': 'APOA1', 'APOLIPOPROTEIN -B': 'APOB', 'APO B / APO A1 RATIO': 'APOB_A1', 'hs C-REACTIVE PROTEIN': 'HSCRP',
  "PLASMODIUM FALCIPARUM ''PF''": 'MAL_PF', "PLASMODIUM VIVAX ''PV''": 'MAL_PV',
  'SCRUB TYPHUS ANTIBODY-IgM': 'SCRUB_IGM', 'SCRUB TYPHUS ( TSUTSUGAMUSHI ) ANTIBODY IgG': 'SCRUB_IGG',
  'VITAMIN-D': 'VITD',
}).map(([k, v]) => [key(k), v]))

/** The same line name meaning something else inside one test. */
export const LINE_OVERRIDES: Record<string, Record<string, string>> = {
  // Urine "ALBUMIN" (NIL / TRACE, heat test) is a second protein test beside the dipstick PROTEIN line.
  [key('Urine Routine and Microscopy')]: { [key('ALBUMIN')]: 'UR_ALB' },
}

/**
 * SwiftEHR put the two RDW values in each other's row but kept each row's own
 * label and range (RDWc "%" 11–16 holding ~45; RDWs "FL" 35–56 holding ~14).
 * The value moves to its true line (above); its range comes from the row the
 * value belongs to, and the flag is worked out again against that range,
 * since SwiftEHR's mark was made against the wrong one.
 */
export const RANGE_FROM: Record<string, string> = { RDW_SD: key('RDWs'), RDW_CV: key('RDWc') }

/** Same quantity, Uyirly's unit: value and printed range multiplied. */
export const CONVERT: Record<string, number> = {
  PLT: 100, // lakhs/µL → 10⁹/L
  T3: 100,  // ng/mL → ng/dL
}

/** Health check-up lines go to the test they belong to (by measurement), so each lands on its own panel. */
export const SPLIT_BY_ANALYTE: Record<string, string> = {
  ...Object.fromEntries(['HGB', 'RBC', 'HCT', 'MCV', 'MCH', 'MCHC', 'WBC', 'GRAN_PCT', 'LYMPH_PCT', 'EOS_PCT', 'GRAN_ABS', 'LYMPH_ABS', 'MID_ABS',
    'PLT', 'MPV', 'PDW_CV', 'PCT', 'RDW_SD', 'RDW_CV'].map((c) => [c, 'Complete Blood Count (CBC)'])),
  ...Object.fromEntries(['UR_COLOUR', 'UR_PH', 'UR_SG', 'UR_PROT', 'UR_GLU', 'UR_KET', 'UR_BIL', 'UR_BILESALT', 'UR_NIT', 'UR_PUS', 'UR_RBC',
    'UR_EPI', 'UR_CAST', 'UR_BACT', 'UR_ALB'].map((c) => [c, 'Urine Routine and Microscopy'])),
  ...Object.fromEntries(['TBIL', 'DBIL', 'IBIL', 'SGOT', 'SGPT', 'ALP', 'TP', 'ALB', 'GLOB', 'AG_RATIO'].map((c) => [c, 'Liver Function Test (LFT)'])),
  ...Object.fromEntries(['NA', 'K', 'CL', 'HCO3', 'ICA'].map((c) => [c, 'Electrolytes'])),
  ...Object.fromEntries(['TC', 'TRIG', 'HDL', 'LDL', 'VLDL', 'TC_HDL', 'LDL_HDL'].map((c) => [c, 'Lipid Profile'])),
  ...Object.fromEntries(['T3', 'T4', 'TSH'].map((c) => [c, 'Thyroid Profile (T3, T4, TSH)'])),
  ...Object.fromEntries(['IRON', 'TIBC', 'UIBC', 'TSAT'].map((c) => [c, 'Iron Profile with TIBC and Transferrin Saturation'])),
  HBA1C: 'HbA1c', EAG: 'HbA1c', FBG: 'Fasting Blood Sugar (FBS)', PPBG: 'Post Prandial Blood Sugar (PPBS)',
  UREA: 'Urea', CREAT: 'Creatinine', UA: 'Uric Acid', VITD: 'Vitamin D (25-OH)',
}
/** Health check-up lines that are whole tests of their own (no measurement line in Uyirly). */
export const SPLIT_BY_LINE: Record<string, string> = Object.fromEntries(Object.entries({
  'RA FACTOR': 'Rheumatoid Factor (RA Factor)', 'VITAMIN-B12': 'Vitamin B12 (Cobalamin)',
  'PROSTATE SPECIFIC ANTIGEN-PSA': 'Prostate Specific Antigen (PSA)', 'CA-125': 'CA-125',
}).map(([k, v]) => [key(k), v]))
export const HEALTH_CHECKS = new Set(['Health Check-Up – Comprehensive', 'Health Check-Up – Basic'])

/** Units SwiftEHR printed that are not units. */
export const JUNK_UNIT = /^(nil|negative|\.|-+|)$/i
