-- Vaccines in the drug master ─────────────────────────────────────────────────
-- India's programme (UIP/NIS) and the common private-market vaccines, with the
-- brands hospitals actually stock. Painful (whole-cell pertussis) and painless
-- (acellular pertussis) are named so staff can search either word.
-- Prices are left empty on purpose: the MRP comes from the batch the pharmacy buys.

INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'BCG Vaccine (infant)', 'Bacillus Calmette-Guerin (BCG) live attenuated', 'Vaccine', 'injection', '0.05ml/0.1ml ID dose', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'BCG Vaccine (infant)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'BCG Vaccine 20 dose', 'Serum Institute of India', '30022019', 5, 20, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'BCG Vaccine (infant)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'BCG Vaccine 20 dose' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'BCG Vaccine 10 dose', 'Green Signal Bio Pharma', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'BCG Vaccine (infant)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'BCG Vaccine 10 dose' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Tubervac 20 dose', 'Serum Institute of India', '30022019', 5, 20, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'BCG Vaccine (infant)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Tubervac 20 dose' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Hepatitis B Vaccine (paediatric)', 'Hepatitis B surface antigen (rDNA) 10 mcg', 'Vaccine', 'injection', '10mcg/0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Hepatitis B Vaccine (paediatric)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Engerix-B Paediatric', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (paediatric)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Engerix-B Paediatric' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Genevac-B Paediatric', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (paediatric)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Genevac-B Paediatric' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Revac-B mcf Paediatric', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (paediatric)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Revac-B mcf Paediatric' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Elovac-B Paediatric', 'Indian Immunologicals', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (paediatric)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Elovac-B Paediatric' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Shanvac-B Paediatric', 'Shantha Biotechnics', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (paediatric)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Shanvac-B Paediatric' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Hepatitis B Vaccine (adult)', 'Hepatitis B surface antigen (rDNA) 20 mcg', 'Vaccine', 'injection', '20mcg/1ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Hepatitis B Vaccine (adult)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Engerix-B Adult', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (adult)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Engerix-B Adult' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Genevac-B Adult', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (adult)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Genevac-B Adult' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Revac-B mcf Adult', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis B Vaccine (adult)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Revac-B mcf Adult' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Oral Polio Vaccine (bivalent, bOPV)', 'Poliovirus vaccine live oral types 1 and 3', 'Vaccine', 'oral drops', '20 dose vial', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Oral Polio Vaccine (bivalent, bOPV)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Bio Polio B1/3', 'Bharat Biotech', '30022019', 5, 20, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Oral Polio Vaccine (bivalent, bOPV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Bio Polio B1/3' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'PoliOral bOPV', 'Serum Institute of India', '30022019', 5, 20, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Oral Polio Vaccine (bivalent, bOPV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'PoliOral bOPV' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Inactivated Polio Vaccine (IPV / fIPV)', 'Poliovirus vaccine inactivated types 1, 2, 3', 'Vaccine', 'injection', '0.5ml (fIPV 0.1ml ID)', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Inactivated Polio Vaccine (IPV / fIPV)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Poliovac IPV', 'Bharat Biotech', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Inactivated Polio Vaccine (IPV / fIPV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Poliovac IPV' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Shanipv', 'Shantha Biotechnics', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Inactivated Polio Vaccine (IPV / fIPV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Shanipv' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Imovax Polio', 'Sanofi', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Inactivated Polio Vaccine (IPV / fIPV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Imovax Polio' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Picovax', 'Serum Institute of India', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Inactivated Polio Vaccine (IPV / fIPV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Picovax' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Pentavalent Vaccine DTwP-HepB-Hib (painful)', 'Diphtheria, tetanus, whole-cell pertussis, hepatitis B, Hib', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Pentavalent Vaccine DTwP-HepB-Hib (painful)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Pentavac SD', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pentavalent Vaccine DTwP-HepB-Hib (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Pentavac SD' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Easyfive-TT', 'Panacea Biotec', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pentavalent Vaccine DTwP-HepB-Hib (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Easyfive-TT' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Comvac-5', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pentavalent Vaccine DTwP-HepB-Hib (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Comvac-5' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Shan5', 'Shantha Biotechnics', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pentavalent Vaccine DTwP-HepB-Hib (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Shan5' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Quinvaxem', 'Janssen', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pentavalent Vaccine DTwP-HepB-Hib (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Quinvaxem' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Hexavalent Vaccine DTaP-IPV-Hib-HepB (painless)', 'Diphtheria, tetanus, acellular pertussis, IPV, Hib, hepatitis B', 'Vaccine', 'injection', '0.5ml pre-filled syringe', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Hexavalent Vaccine DTaP-IPV-Hib-HepB (painless)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Hexaxim', 'Sanofi', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hexavalent Vaccine DTaP-IPV-Hib-HepB (painless)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Hexaxim' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Infanrix Hexa', 'GlaxoSmithKline', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hexavalent Vaccine DTaP-IPV-Hib-HepB (painless)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Infanrix Hexa' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Hexavalent Vaccine DTwP-IPV-Hib-HepB (painful)', 'Diphtheria, tetanus, whole-cell pertussis, IPV, Hib, hepatitis B', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Hexavalent Vaccine DTwP-IPV-Hib-HepB (painful)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Easysix', 'Panacea Biotec', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hexavalent Vaccine DTwP-IPV-Hib-HepB (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Easysix' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Hexasiil', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hexavalent Vaccine DTwP-IPV-Hib-HepB (painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Hexasiil' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Pentavalent Vaccine DTaP-IPV-Hib (painless)', 'Diphtheria, tetanus, acellular pertussis, IPV, Hib', 'Vaccine', 'injection', '0.5ml pre-filled syringe', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Pentavalent Vaccine DTaP-IPV-Hib (painless)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Pentaxim', 'Sanofi', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pentavalent Vaccine DTaP-IPV-Hib (painless)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Pentaxim' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'DTwP Vaccine (triple, painful)', 'Diphtheria, tetanus, whole-cell pertussis', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'DTwP Vaccine (triple, painful)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Tripvac', 'Cadila / Zydus', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'DTwP Vaccine (triple, painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Tripvac' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'DTP Vaccine', 'Serum Institute of India', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'DTwP Vaccine (triple, painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'DTP Vaccine' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'DTwP Vaccine', 'Biological E', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'DTwP Vaccine (triple, painful)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'DTwP Vaccine' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'DTaP Vaccine (triple, painless)', 'Diphtheria, tetanus, acellular pertussis', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'DTaP Vaccine (triple, painless)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Tripacel', 'Sanofi', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'DTaP Vaccine (triple, painless)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Tripacel' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Infanrix', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'DTaP Vaccine (triple, painless)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Infanrix' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Tdap Vaccine (painless booster)', 'Tetanus, reduced diphtheria, acellular pertussis', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Tdap Vaccine (painless booster)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Boostrix', 'GlaxoSmithKline', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Tdap Vaccine (painless booster)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Boostrix' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Adacel', 'Sanofi', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Tdap Vaccine (painless booster)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Adacel' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Td Vaccine (tetanus + reduced diphtheria)', 'Tetanus and diphtheria toxoids (adult)', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Td Vaccine (tetanus + reduced diphtheria)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Td Vaccine', 'Biological E', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Td Vaccine (tetanus + reduced diphtheria)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Td Vaccine' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Dual Antigen Td', 'Serum Institute of India', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Td Vaccine (tetanus + reduced diphtheria)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Dual Antigen Td' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Tetanus Toxoid (TT)', 'Tetanus toxoid adsorbed', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Tetanus Toxoid (TT)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Tetanus Toxoid', 'Biological E', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Tetanus Toxoid (TT)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Tetanus Toxoid' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'TT Vaccine', 'Serum Institute of India', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Tetanus Toxoid (TT)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'TT Vaccine' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Hib Vaccine (standalone)', 'Haemophilus influenzae type b conjugate', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Hib Vaccine (standalone)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Hiberix', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hib Vaccine (standalone)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Hiberix' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Quimi-Hib', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hib Vaccine (standalone)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Quimi-Hib' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Rotavirus Vaccine (oral)', 'Rotavirus vaccine live attenuated, oral', 'Vaccine', 'oral', '0.5ml / 1.5ml / 2ml dose', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Rotavirus Vaccine (oral)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Rotavac', 'Bharat Biotech', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rotavirus Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Rotavac' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Rotavac 5D', 'Bharat Biotech', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rotavirus Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Rotavac 5D' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Rotasiil', 'Serum Institute of India', '30022019', 5, 2, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rotavirus Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Rotasiil' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Rotasiil Liquid', 'Serum Institute of India', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rotavirus Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Rotasiil Liquid' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Rotarix', 'GlaxoSmithKline', '30022019', 5, 1, 'applicator', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rotavirus Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Rotarix' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'RotaTeq', 'MSD', '30022019', 5, 1, 'tube', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rotavirus Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'RotaTeq' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Pneumococcal Conjugate Vaccine (PCV)', 'Pneumococcal polysaccharide conjugate (10/13/15-valent)', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Pneumococcal Conjugate Vaccine (PCV)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Pneumosil', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pneumococcal Conjugate Vaccine (PCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Pneumosil' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Pneumosil 5 dose', 'Serum Institute of India', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pneumococcal Conjugate Vaccine (PCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Pneumosil 5 dose' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Prevnar 13', 'Pfizer', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pneumococcal Conjugate Vaccine (PCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Prevnar 13' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Synflorix', 'GlaxoSmithKline', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pneumococcal Conjugate Vaccine (PCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Synflorix' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Pneumococcal Polysaccharide Vaccine (PPSV23)', 'Pneumococcal polysaccharide 23-valent', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Pneumococcal Polysaccharide Vaccine (PPSV23)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Pneumovax 23', 'MSD', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Pneumococcal Polysaccharide Vaccine (PPSV23)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Pneumovax 23' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Measles-Rubella Vaccine (MR)', 'Measles and rubella live attenuated', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Measles-Rubella Vaccine (MR)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'MR Vaccine 5 dose', 'Serum Institute of India', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Measles-Rubella Vaccine (MR)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'MR Vaccine 5 dose' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'MR Vaccine 10 dose', 'Serum Institute of India', '30022019', 5, 10, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Measles-Rubella Vaccine (MR)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'MR Vaccine 10 dose' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'MMR Vaccine', 'Measles, mumps and rubella live attenuated', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'MMR Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Tresivac', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'MMR Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Tresivac' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Priorix', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'MMR Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Priorix' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'M-M-R II', 'MSD', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'MMR Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'M-M-R II' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Japanese Encephalitis Vaccine', 'Japanese encephalitis vaccine (live SA 14-14-2 / inactivated)', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Japanese Encephalitis Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Jenvac', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Japanese Encephalitis Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Jenvac' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Jeev', 'Biological E', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Japanese Encephalitis Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Jeev' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'JE Live SA 14-14-2', 'Chengdu Institute (UIP supply)', '30022019', 5, 5, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Japanese Encephalitis Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'JE Live SA 14-14-2' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Vitamin A Oral Solution (1,00,000 IU/ml)', 'Retinol palmitate oral solution', 'Vaccine', 'oral solution', '100000IU/ml', 'ml', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Vitamin A Oral Solution (1,00,000 IU/ml)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Vitamin A Solution IP 100 ml', 'UIP supply', '30022019', 5, 100, 'bottle', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Vitamin A Oral Solution (1,00,000 IU/ml)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Vitamin A Solution IP 100 ml' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Typhoid Conjugate Vaccine (TCV)', 'Typhoid Vi polysaccharide tetanus toxoid conjugate', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Typhoid Conjugate Vaccine (TCV)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Typbar-TCV', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Typhoid Conjugate Vaccine (TCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Typbar-TCV' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'ZyVac-TCV', 'Zydus', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Typhoid Conjugate Vaccine (TCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'ZyVac-TCV' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Typhibev', 'Biological E', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Typhoid Conjugate Vaccine (TCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Typhibev' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'PedaTyph', 'Bio-Med', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Typhoid Conjugate Vaccine (TCV)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'PedaTyph' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Typhoid Vi Polysaccharide Vaccine', 'Typhoid Vi capsular polysaccharide', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Typhoid Vi Polysaccharide Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Typhim Vi', 'Sanofi', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Typhoid Vi Polysaccharide Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Typhim Vi' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Typbar', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Typhoid Vi Polysaccharide Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Typbar' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Hepatitis A Vaccine', 'Hepatitis A vaccine (inactivated / live attenuated)', 'Vaccine', 'injection', '0.5ml paediatric / 1ml adult', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Hepatitis A Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Havrix 720 Junior', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis A Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Havrix 720 Junior' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Avaxim 80', 'Sanofi', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis A Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Avaxim 80' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Biovac-A', 'Wockhardt', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis A Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Biovac-A' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Havisure', 'Indian Immunologicals', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis A Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Havisure' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Aimmugen', 'Kaketsuken', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Hepatitis A Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Aimmugen' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Varicella Vaccine', 'Varicella zoster live attenuated', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Varicella Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Varilrix', 'GlaxoSmithKline', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Varicella Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Varilrix' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Varivax', 'MSD', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Varicella Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Varivax' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Nexipox', 'Zydus', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Varicella Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Nexipox' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Influenza Vaccine (quadrivalent)', 'Influenza vaccine split virion quadrivalent', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Influenza Vaccine (quadrivalent)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Vaxigrip Tetra', 'Sanofi', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Influenza Vaccine (quadrivalent)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Vaxigrip Tetra' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Fluarix Tetra', 'GlaxoSmithKline', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Influenza Vaccine (quadrivalent)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Fluarix Tetra' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Influvac Tetra', 'Abbott', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Influenza Vaccine (quadrivalent)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Influvac Tetra' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Nasovac-S (nasal)', 'Serum Institute of India', '30022019', 5, 1, 'applicator', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Influenza Vaccine (quadrivalent)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Nasovac-S (nasal)' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'HPV Vaccine', 'Human papillomavirus vaccine (quadrivalent / 9-valent)', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'HPV Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Cervavac', 'Serum Institute of India', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'HPV Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Cervavac' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Gardasil 9', 'MSD', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'HPV Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Gardasil 9' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Cervarix', 'GlaxoSmithKline', '30022019', 5, 1, 'pre-filled syringe', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'HPV Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Cervarix' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Meningococcal Vaccine (ACWY)', 'Meningococcal polysaccharide conjugate A, C, W, Y', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Meningococcal Vaccine (ACWY)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Menactra', 'Sanofi', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Meningococcal Vaccine (ACWY)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Menactra' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Quadri Meningo', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Meningococcal Vaccine (ACWY)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Quadri Meningo' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Rabies Vaccine (cell culture)', 'Rabies vaccine purified chick embryo / vero cell', 'Vaccine', 'injection', '1ml / 0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Rabies Vaccine (cell culture)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Rabipur', 'Bharat Biotech', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rabies Vaccine (cell culture)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Rabipur' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Verorab', 'Sanofi', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rabies Vaccine (cell culture)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Verorab' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Vaxirab N', 'Zydus', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rabies Vaccine (cell culture)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Vaxirab N' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Thrabis', 'Cadila', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rabies Vaccine (cell culture)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Thrabis' AND drug_master_id = m.id);
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Abhayrab', 'Human Biologicals Institute', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Rabies Vaccine (cell culture)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Abhayrab' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Cholera Vaccine (oral)', 'Cholera vaccine inactivated oral', 'Vaccine', 'oral', '1.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Cholera Vaccine (oral)');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Shanchol', 'Shantha Biotechnics', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Cholera Vaccine (oral)'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Shanchol' AND drug_master_id = m.id);
INSERT INTO drug_master (name, generic_name, category, form, strength, unit, is_active, source)
SELECT 'Yellow Fever Vaccine', 'Yellow fever live attenuated 17D', 'Vaccine', 'injection', '0.5ml', 'dose', true, 'curated_vaccines'
WHERE NOT EXISTS (SELECT 1 FROM drug_master WHERE name = 'Yellow Fever Vaccine');
INSERT INTO drug_brands (drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit, is_active, source)
SELECT m.id, 'Stamaril', 'Sanofi', '30022019', 5, 1, 'vial', true, 'curated_vaccines'
FROM drug_master m WHERE m.name = 'Yellow Fever Vaccine'
  AND NOT EXISTS (SELECT 1 FROM drug_brands WHERE brand_name = 'Stamaril' AND drug_master_id = m.id);

-- Existing vaccine entries in the master get the same category, so the pharmacy
-- can filter them and the vaccine picker finds them.
UPDATE drug_master SET category = 'Vaccine'
WHERE category IS DISTINCT FROM 'Vaccine'
  AND (name ILIKE '%vaccine%' OR name ILIKE '%toxoid%' OR name ILIKE '%calmette%' OR generic_name ILIKE '%vaccine%');

NOTIFY pgrst, 'reload schema';
