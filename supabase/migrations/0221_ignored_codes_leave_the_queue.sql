-- "Not ours" did something, and looked like it did nothing.
--
-- Marking a code as not a measurement sets enabled = false, and the ingest
-- path honours that — results under an ignored code are not recorded. But the
-- queue a technician works through filtered on `analyte_id IS NULL` alone, so
-- the row stayed on the screen afterwards.
--
-- From the laboratory's side that is an unresponsive button: press it, nothing
-- moves, press it again. On a haematology analyzer there are eight or ten of
-- these — take mode, test mode, the instrument's own interpretive flags — and
-- every one of them appears to refuse to go away.
--
-- Reported from the first hospital to use the screen. One clause.

CREATE OR REPLACE FUNCTION get_unknown_analyzer_codes()
RETURNS TABLE (
  mapping_id     uuid,
  analyzer_id    uuid,
  analyzer_label text,
  analyzer_code  text,
  unit_ucum      text,
  times_seen     int,
  last_value     text,
  last_seen      timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT m.id,
         m.analyzer_id,
         COALESCE(
           NULLIF(trim(COALESCE(a.manufacturer, '') || ' ' || COALESCE(a.model, '')), ''),
           a.fingerprint,
           'Unidentified analyzer'
         ),
         m.analyzer_code,
         m.unit_ucum,
         COALESCE(s.times_seen, 0),
         s.last_value,
         s.last_seen
    FROM analyzer_mappings m
    JOIN lab_analyzers a ON a.id = m.analyzer_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS times_seen,
             (array_agg(r->>'value' ORDER BY msg.received_at DESC))[1] AS last_value,
             max(msg.received_at) AS last_seen
        FROM analyzer_messages msg
        CROSS JOIN LATERAL jsonb_array_elements(
               COALESCE(msg.parsed_json -> 'results', '[]'::jsonb)) AS r
       WHERE msg.analyzer_id = m.analyzer_id
         AND r->>'code' = m.analyzer_code
    ) s ON true
   -- A code somebody has already said is not a measurement is answered, and
   -- an answered question does not belong in a queue of unanswered ones.
   WHERE m.analyte_id IS NULL AND m.enabled
   ORDER BY s.last_seen DESC NULLS LAST, m.analyzer_code;
$$;
