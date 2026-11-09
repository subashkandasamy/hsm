-- 0279 — The LAURA Smart urine strip reader maps itself, at every hospital.
--
-- Read at Karur, 9 Nov 2026 (USB-serial, 115200 baud). It sends its printout
-- as plain text rather than ASTM or HL7, read by src/lib/lab/stripText.ts, so
-- the library needs a third protocol name.

ALTER TABLE device_library DROP CONSTRAINT IF EXISTS device_library_protocol_check;
ALTER TABLE device_library ADD CONSTRAINT device_library_protocol_check
  CHECK (protocol = ANY (ARRAY['astm', 'hl7', 'text']));

INSERT INTO device_library (id, fingerprint, manufacturer, model, protocol, framing, default_port, notes, verified_at)
VALUES (gen_random_uuid(), 'DekaPHAN LAURA', 'Erba Lachema', 'LAURA Smart', 'text', 'raw', NULL,
        'Urine strip reader. USB-serial (CP210x) at 115200 baud; plain-text printout in STX/ETX. The tube barcode goes in its ID field. Read at Karur, 9 Nov 2026.', now())
ON CONFLICT (fingerprint) DO NOTHING;

-- Units are blank: the reader writes them into the value ("10 Ery/µl"), which
-- is kept as text — see stripText.ts for why it is not turned into a grade.
INSERT INTO device_library_codes (id, device_library_id, analyzer_code, analyte_id, unit_ucum, factor, enabled)
SELECT gen_random_uuid(), l.id, v.code, a.id, NULL, NULL, true
  FROM (VALUES ('BLD', 'UR_BLOOD'), ('LEU', 'UR_LEU'), ('BIL', 'UR_BIL'), ('UBG', 'UR_URO'),
               ('KET', 'UR_KET'), ('GLU', 'UR_GLU'), ('PRO', 'UR_PROT'), ('pH', 'UR_PH'),
               ('NIT', 'UR_NIT'), ('SG', 'UR_SG')) AS v(code, analyte)
  JOIN device_library l ON l.fingerprint = 'DekaPHAN LAURA'
  JOIN lab_analytes a ON a.code = v.analyte
ON CONFLICT (device_library_id, analyzer_code) DO NOTHING;
