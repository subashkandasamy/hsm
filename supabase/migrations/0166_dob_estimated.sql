-- An age is not a birthday ────────────────────────────────────────────────────
--
-- Registration now insists on an age, because gender and age decide which
-- clinical form opens, how a dose is checked and how a growth chart is read. But
-- most walk-ins give an age, not a date: "thirty-two". A date worked back from
-- an age is right to within a year, and anything reading it to the day — an
-- infant's WHO z-score, a birthday greeting — needs to know that.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob_estimated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN patients.dob_estimated IS
  'True when the date of birth was worked back from an age given at registration, so it is accurate to the year, not the day.';

NOTIFY pgrst, 'reload schema';
