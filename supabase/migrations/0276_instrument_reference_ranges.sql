-- 0276 — An instrument's own normal ranges can become a hospital's.
--
-- Found at Karur, 9 Nov 2026: an Erba H360 sends a reference range and a
-- high/low flag with every value (HL7 OBX-7: WBC "3.50-9.50", HGB
-- "11.5-17.5"), and Uyirly discarded them. The hospital had set ranges for
-- only two analytes, so a WBC of 18.77 and a haemoglobin of 8.8 on the same
-- report carried no flag at all.
--
-- lib/lab/ingest.ts now saves an instrument's range as the hospital's own
-- (tenant-scoped) range — only for analytes the hospital has no range for,
-- never over one it set. resolve_reference_range already prefers a
-- hospital's range to the global default, so nothing else changes: results
-- typed by hand afterwards are flagged against the same range.
--
-- 'analyzer' marks where such a row came from, so a laboratory reviewing its
-- ranges can tell its own decisions from what the machine supplied.

ALTER TABLE lab_reference_ranges DROP CONSTRAINT IF EXISTS lab_ref_source_check;
ALTER TABLE lab_reference_ranges ADD CONSTRAINT lab_ref_source_check
  CHECK (source = ANY (ARRAY['uyirly_standard'::text, 'tenant'::text, 'analyzer'::text]));
