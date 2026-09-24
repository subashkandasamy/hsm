-- Two different problems were wearing the same label.
--
-- processMessage wrote status 'unmatched' for both of these:
--
--   * the barcode matches no tube we know      → we cannot find the patient
--   * the patient was found, but the machine's codes mean nothing to us yet
--
-- The screen then put both under "results could not be matched to a patient"
-- and offered "Attach to a patient" on every row. For the second kind that is
-- simply the wrong thing to do — the patient was already found — so a hospital
-- would type the barcode in again, watch nothing change, and have no idea why.
--
-- The fix that matters is telling them apart. A message whose codes are
-- unknown is waiting on the measurement queue directly above it; one whose
-- barcode is unknown is waiting on somebody with the tube in their hand.

ALTER TABLE analyzer_messages DROP CONSTRAINT IF EXISTS analyzer_messages_status_check;
ALTER TABLE analyzer_messages ADD CONSTRAINT analyzer_messages_status_check
  CHECK (status = ANY (ARRAY['received','parsed','matched','unmatched','unmapped','failed','ignored']));

COMMENT ON COLUMN analyzer_messages.status IS
  'received → stored. parsed → understood. matched → written to a patient. unmapped → patient found, but this machine''s codes are not identified yet. unmatched → no tube with that barcode; a person must resolve it. failed → could not be parsed, raw text retained. ignored → not a patient sample.';

-- Anything already sitting in the wrong bucket. The distinguishing mark is the
-- error text the ingest path wrote.
UPDATE analyzer_messages
   SET status = 'unmapped'
 WHERE status = 'unmatched'
   AND error LIKE 'None of these codes are mapped yet%';

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
   WHERE msg.status IN ('unmatched', 'unmapped', 'failed')
   ORDER BY msg.received_at DESC;
$$;

COMMENT ON FUNCTION get_unmatched_messages() IS
  'Analyzer messages waiting on a person, of both kinds: no tube with that barcode (unmatched/failed), and patient found but codes unidentified (unmapped). The caller separates them by status.';
