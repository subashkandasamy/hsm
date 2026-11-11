-- 0284 — The nurse's round for every patient, the sugar chart, and the patient strip.
--
-- Write once, show everywhere: one round is one icu_observations row, and the
-- vitals chart, the early-warning score, the sugar–insulin chart and the ICU
-- flow sheet all read it. The table keeps its name although ward patients now
-- use it too — renaming touches live code for no clinical gain.
--
-- KMCH charts consciousness as AVPU on the ward (GCS stays for ICU), oxygen in
-- litres by device, and blood sugar (GRBS) with the insulin given against it on
-- a sliding scale the doctor writes per patient.

ALTER TABLE icu_observations
  ADD COLUMN IF NOT EXISTS avpu           text,
  ADD COLUMN IF NOT EXISTS o2_device      text,
  ADD COLUMN IF NOT EXISTS o2_lpm         numeric(4,1),
  ADD COLUMN IF NOT EXISTS glucose_mg_dl  integer,
  ADD COLUMN IF NOT EXISTS glucose_source text,
  ADD COLUMN IF NOT EXISTS insulin_units  numeric(5,1),
  ADD COLUMN IF NOT EXISTS insulin_type   text;

ALTER TABLE icu_observations DROP CONSTRAINT IF EXISTS icu_observations_round_check;
ALTER TABLE icu_observations ADD CONSTRAINT icu_observations_round_check CHECK (
  (avpu IS NULL OR avpu = ANY (ARRAY['A', 'C', 'V', 'P', 'U']))
  AND (o2_device IS NULL OR o2_device = ANY (ARRAY['air', 'nasal_prongs', 'face_mask', 'nrbm', 'hfnc', 'niv', 'ventilator']))
  AND (o2_lpm IS NULL OR o2_lpm BETWEEN 0 AND 60)
  AND (glucose_mg_dl IS NULL OR glucose_mg_dl BETWEEN 10 AND 2000)
  AND (glucose_source IS NULL OR glucose_source = ANY (ARRAY['capillary', 'venous', 'lab']))
  AND (insulin_units IS NULL OR insulin_units BETWEEN 0 AND 200));

-- The patient strip and the doctor's insulin sliding scale
ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS weight_kg          numeric(5,1),
  ADD COLUMN IF NOT EXISTS height_cm          numeric(5,1),
  ADD COLUMN IF NOT EXISTS diet               text,
  ADD COLUMN IF NOT EXISTS diet_kcal          integer,
  ADD COLUMN IF NOT EXISTS diet_protein_g     integer,
  ADD COLUMN IF NOT EXISTS dvt_prophylaxis    text,
  ADD COLUMN IF NOT EXISTS insulin_scale      jsonb,
  ADD COLUMN IF NOT EXISTS insulin_scale_type text;

ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_strip_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_strip_check CHECK (
  (weight_kg IS NULL OR weight_kg BETWEEN 0.3 AND 400)
  AND (height_cm IS NULL OR height_cm BETWEEN 20 AND 250)
  AND (diet IS NULL OR diet = ANY (ARRAY['npo', 'oral', 'soft', 'liquid', 'diabetic', 'renal', 'rt_feed', 'peg_feed', 'tpn']))
  AND (diet_kcal IS NULL OR diet_kcal BETWEEN 0 AND 6000)
  AND (diet_protein_g IS NULL OR diet_protein_g BETWEEN 0 AND 400)
  AND (dvt_prophylaxis IS NULL OR dvt_prophylaxis = ANY (ARRAY['none', 'pharmacological', 'mechanical', 'both', 'contraindicated'])));

COMMENT ON COLUMN icu_observations.avpu IS 'Consciousness on the ACVPU scale (C = new confusion). Ward rounds use this; ICU also records GCS.';
COMMENT ON COLUMN icu_observations.glucose_mg_dl IS 'Blood sugar at this round (GRBS when capillary) — the sugar–insulin chart reads it.';
COMMENT ON COLUMN icu_observations.insulin_units IS 'Insulin given against this reading, usually from admissions.insulin_scale.';
COMMENT ON COLUMN admissions.insulin_scale IS 'The doctor''s sliding scale: [{"from": 151, "to": 200, "units": 2}, …] in mg/dl; insulin_scale_type names the insulin.';

NOTIFY pgrst, 'reload schema';
