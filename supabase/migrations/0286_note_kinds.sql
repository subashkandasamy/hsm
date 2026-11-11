-- 0286 — Whose note, and which shift.
--
-- KMCH's IP file keeps doctors' notes, nurses' notes per shift (7 am, 1 pm,
-- 7 pm), and notes from the respiratory therapist, physiotherapist, dietitian
-- and wound care. Uyirly had one undifferentiated progress-note list.
--
-- One timeline still (ipd_progress_notes), now labelled, so it can be read by
-- kind: the doctor's plan without scrolling past every nursing entry.

ALTER TABLE ipd_progress_notes
  ADD COLUMN IF NOT EXISTS kind  text NOT NULL DEFAULT 'doctor',
  ADD COLUMN IF NOT EXISTS shift text;

ALTER TABLE ipd_progress_notes DROP CONSTRAINT IF EXISTS ipd_progress_notes_kind_check;
ALTER TABLE ipd_progress_notes ADD CONSTRAINT ipd_progress_notes_kind_check CHECK (
  kind = ANY (ARRAY['doctor', 'nurse', 'rt', 'physio', 'dietitian', 'wound', 'system'])
  AND (shift IS NULL OR shift = ANY (ARRAY['morning', 'evening', 'night'])));

-- Notes written before this keep 'doctor' unless a nurse wrote them; the
-- automatic "Transferred to new bed" lines are the system's.
UPDATE ipd_progress_notes n SET kind = 'nurse'
  FROM profiles p WHERE p.id = n.author_id AND p.role = 'nurse' AND n.kind = 'doctor';
UPDATE ipd_progress_notes SET kind = 'system'
  WHERE kind = 'doctor' AND note IN ('Transferred to new bed.', 'Transferred into ICU.', 'Transferred out of ICU.');

CREATE INDEX IF NOT EXISTS idx_ipd_notes_admission_kind ON ipd_progress_notes (admission_id, kind, created_at DESC);

COMMENT ON COLUMN ipd_progress_notes.kind IS 'Who the note is from: doctor, nurse, rt (respiratory therapist), physio, dietitian, wound, system.';
COMMENT ON COLUMN ipd_progress_notes.shift IS 'Nursing shift, KMCH times: morning 07–13, evening 13–19, night 19–07.';

NOTIFY pgrst, 'reload schema';
