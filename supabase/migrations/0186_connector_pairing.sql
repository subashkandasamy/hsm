-- Pairing, and the queues a person has to work through.
--
-- ── Why a pairing code rather than a token ─────────────────────────────────
--
-- The bearer token is 64 hex characters. Nobody types that into an installer
-- in a laboratory, and a token that has to be copied is a token that ends up
-- in WhatsApp. So the hospital gets a short code instead: it is claimed once,
-- swapped for a real token over TLS, and then destroyed. The token exists only
-- on the lab PC and as a hash here, so a database dump leaks nothing.
--
-- It expires, because an unclaimed code left lying around is a way into a
-- hospital's laboratory.

ALTER TABLE connectors ADD COLUMN IF NOT EXISTS pairing_expires_at timestamptz;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS paired_at timestamptz;

COMMENT ON COLUMN connectors.pairing_code IS
  'Short single-use code typed into the installer, swapped for a token at /api/device/pair, then cleared. Never reissued.';

-- ── The unknown-code queue ─────────────────────────────────────────────────
--
-- Every code an analyzer sends is recorded, mapped or not. The unmapped ones
-- are not errors — they are the machine telling us its vocabulary, and one
-- confirmation each turns the list into silence forever.
--
-- The value it last reported is shown alongside, because "CRP, last sent 4.2"
-- is answerable by a technician and a bare code is not.
--
-- SECURITY INVOKER (the default) so row level security still applies: a
-- hospital sees only its own analyzers.

DROP FUNCTION IF EXISTS get_unknown_analyzer_codes();
CREATE FUNCTION get_unknown_analyzer_codes()
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
   WHERE m.analyte_id IS NULL
   ORDER BY s.last_seen DESC NULLS LAST, m.analyzer_code;
$$;

COMMENT ON FUNCTION get_unknown_analyzer_codes() IS
  'Codes an analyzer has sent that we cannot yet translate, with what it last reported for each.';

-- ── The unmatched-sample queue ─────────────────────────────────────────────
--
-- Results that arrived for a barcode we do not have. Never guessed onto the
-- nearest order — a haemoglobin on the wrong chart is worse than a haemoglobin
-- nobody can find. A person attaches it, or marks it as not ours.

DROP FUNCTION IF EXISTS get_unmatched_messages();
CREATE FUNCTION get_unmatched_messages()
RETURNS TABLE (
  id             uuid,
  received_at    timestamptz,
  sample_barcode text,
  analyzer_label text,
  patient_name   text,
  result_count   int,
  status         text,
  error          text
)
LANGUAGE sql STABLE AS $$
  SELECT msg.id,
         msg.received_at,
         msg.sample_barcode,
         COALESCE(
           NULLIF(trim(COALESCE(a.manufacturer, '') || ' ' || COALESCE(a.model, '')), ''),
           a.fingerprint,
           'Unidentified analyzer'
         ),
         -- What the machine believed the patient was called. Only ever a hint
         -- for the person resolving this; it is never matched on.
         msg.parsed_json ->> 'patientName',
         COALESCE(jsonb_array_length(msg.parsed_json -> 'results'), 0),
         msg.status,
         msg.error
    FROM analyzer_messages msg
    LEFT JOIN lab_analyzers a ON a.id = msg.analyzer_id
   WHERE msg.status IN ('unmatched', 'failed')
   ORDER BY msg.received_at DESC;
$$;

COMMENT ON FUNCTION get_unmatched_messages() IS
  'Analyzer messages that could not be attached to a patient and are waiting for a person.';
