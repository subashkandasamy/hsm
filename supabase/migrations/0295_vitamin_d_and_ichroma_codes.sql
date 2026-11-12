-- 0295 — The iChroma II's "TnI Plus" and "Vitamin D Neo" map to measurements.
--
-- Found on the demo hospital's Analyzers page, 12 Nov 2026 (the KMCH machine,
-- still paired to demo): two codes stayed "not recognised".
--   - TnI Plus: the iChroma's newer troponin cartridge. Troponin I existed;
--     neither the library (0278 knew only "Tn-I") nor the suggestion words
--     knew this name.
--   - Vitamin D Neo: could not be mapped at all — the test "Vitamin D (25-OH)"
--     existed, but no Vitamin D measurement did.
--
-- Adds the measurement, its standard range, its link to the test, and both
-- codes to the shared machine library. Hospitals' own code mappings are not
-- written here: a code still untouched picks up its meaning from the library
-- the next time the machine sends a result (ingest fillFromLibrary).
--
-- Linking the test is safe: checked before applying, the only catalogue that
-- carries Vitamin D (25-OH) has never ordered it, so no past result changes
-- shape.

-- ── 1. The measurement ─────────────────────────────────────────────────────
INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type)
VALUES (gen_random_uuid(), 'VITD', 'Vitamin D (25-OH)', 'Vitamin D (25-OH)', 'ng/mL', 1, 'numeric')
ON CONFLICT (code) DO NOTHING;

-- ── 2. Its standard range — the one the test already carried ──────────────
-- Endocrine Society (2011): < 20 ng/mL deficient, 20–29 insufficient,
-- 30–100 sufficient. A hospital's own range still takes precedence.
INSERT INTO lab_reference_ranges (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, 'any', 0, 54750, 30, 100, 'uyirly_standard',
       'Endocrine Society 2011: < 20 deficient, 20–29 insufficient, 30–100 sufficient — set your own in lab settings'
  FROM lab_analytes a
 WHERE a.code = 'VITD'
   AND NOT EXISTS (SELECT 1 FROM lab_reference_ranges r WHERE r.analyte_id = a.id AND r.tenant_id IS NULL);

-- ── 3. The test reports it ────────────────────────────────────────────────
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.id, a.id, 1
  FROM lab_tests_master m
  JOIN lab_analytes a ON a.code = 'VITD'
 WHERE m.code = 'VITD'
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

-- ── 4. The machine library: both iChroma codes ─────────────────────────────
INSERT INTO device_library_codes (id, device_library_id, analyzer_code, analyte_id, unit_ucum, factor, enabled)
SELECT gen_random_uuid(), l.id, v.code, a.id, v.unit, NULL, true
  FROM (VALUES ('TnI Plus', 'TROP_I', 'ng/mL'), ('Vitamin D Neo', 'VITD', 'ng/mL')) AS v(code, analyte, unit)
  JOIN device_library l ON l.fingerprint = '1^ichroma2'
  JOIN lab_analytes a ON a.code = v.analyte
 WHERE NOT EXISTS (SELECT 1 FROM device_library_codes c WHERE c.device_library_id = l.id AND c.analyzer_code = v.code);
