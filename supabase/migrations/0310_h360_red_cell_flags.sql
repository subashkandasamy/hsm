-- 0310 — The Erba H360's red-cell flags are not measurements, at every hospital.
--
-- Found at KMCH, 20 Nov 2026. Besides its numbers, the H360 sends a line such
-- as  OBX|31|IS|15150-6^Anisocytosis^LN||T  when it suspects unevenly sized
-- or small red cells. The value is only "T" (true), and the line comes only
-- when the machine suspects it, so a hospital meets the code weeks after
-- connecting the machine and finds it waiting on the Analyzers page with
-- nothing to map it to. RDW and MCV — the numbers behind both flags — are
-- already mapped and flag high or low themselves.
--
-- KMCH and the demo hospital set both aside by hand that morning. This puts
-- the same answer in the shared library (0278), so an H360 anywhere sets them
-- aside on its own: a new one from its first message, and one already
-- connected the next time it sends the flag (fillFromLibrary only fills codes
-- a person has not answered).
--
-- Only the two flags seen in a real message are added. The H360 has others
-- (macrocytes, hypochromia…), but their exact spelling is unknown until one
-- arrives, and a guessed code matches nothing.

INSERT INTO device_library_codes (id, device_library_id, analyzer_code, analyte_id, unit_ucum, factor, enabled)
SELECT gen_random_uuid(), l.id, v.code, NULL, NULL, NULL, false
  FROM device_library l
 CROSS JOIN (VALUES ('Anisocytosis'), ('Microcytes')) AS v(code)
 WHERE l.fingerprint = 'H360^Erba'
ON CONFLICT (device_library_id, analyzer_code) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM device_library_codes c
        JOIN device_library l ON l.id = c.device_library_id
       WHERE l.fingerprint = 'H360^Erba'
         AND c.analyzer_code IN ('Anisocytosis', 'Microcytes')
         AND c.enabled = false AND c.analyte_id IS NULL) <> 2 THEN
    RAISE EXCEPTION '0310: the two H360 flags are not both set aside in the library';
  END IF;
END $$;
