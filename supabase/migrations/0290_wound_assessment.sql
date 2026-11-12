-- 0290 — KMCH's wound assessment box, on the notes timeline.
--
-- The ICU chart's WOUND ASSESSMENT box: site, T (tissue), I (infection /
-- inflammation), M (moisture), E (edge), condition (worsening / improved /
-- same), dressing done, time and sign. A wound note (kind 'wound', 0286)
-- keeps those fields in `data` so the day sheet can show the latest wound
-- picture; the note text carries the same words for the timeline and print.

ALTER TABLE ipd_progress_notes ADD COLUMN IF NOT EXISTS data jsonb;

ALTER TABLE ipd_progress_notes DROP CONSTRAINT IF EXISTS ipd_progress_notes_data_check;
ALTER TABLE ipd_progress_notes ADD CONSTRAINT ipd_progress_notes_data_check CHECK (
  data IS NULL OR (jsonb_typeof(data) = 'object' AND kind = 'wound'));

COMMENT ON COLUMN ipd_progress_notes.data IS 'Structured fields of a wound note (KMCH wound assessment: site, t, i, m, e, condition, dressing). Only on kind = wound.';

NOTIFY pgrst, 'reload schema';
