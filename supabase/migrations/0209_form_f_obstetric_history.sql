-- Report II asks for G, P, L, A. Form F only records L.
--
-- Field 4 of Form F asks for the living children and nothing else, so that is
-- all the record held. But the Tamil Nadu summary sheet quotes a full
-- obstetric history for every scan — "Gravida, Para, Living Children, Abortion
-- (G, P, L, A)" — and the register had three of the four missing. The column
-- printed as "-, -, -, -", which on a statutory return is a blank column.
--
-- Taken from the ANC record at the moment the Form F is opened, and frozen
-- there like everything else on it. Reading it live at print time would mean a
-- form reprinted next year quoted next year's history, which is exactly what
-- the snapshotting everywhere else in this table exists to prevent.

ALTER TABLE form_f_records
  ADD COLUMN IF NOT EXISTS gravida   int,
  ADD COLUMN IF NOT EXISTS para      int,
  ADD COLUMN IF NOT EXISTS abortions int;

COMMENT ON COLUMN form_f_records.gravida IS
  'Snapshot of the ANC record when this Form F was opened. Report II quotes G, P, L, A per scan; the living count is living_children_total.';
