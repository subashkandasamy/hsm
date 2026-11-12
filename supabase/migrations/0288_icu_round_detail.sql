-- 0288 — The rest of KMCH's ICU chart boxes on the round, and tube details.
--
-- Compared box by box with KMCH's Critical Care Chart and Blood Sugar–Insulin
-- Chart, the hourly round still had nowhere to put:
--   * MAP / ICP and CVP / CPP rows — ICP (CPP is worked out: MAP − ICP)
--   * ventilator status — ET/TT cuff pressure, PIFR, I:E, suction
--   * GCS "C" (eyes closed by swelling) and "T" (ET tube / tracheostomy)
--   * positioning (time, position, sign) and the Ryles tube position check
--   * insulin route (IV / SC)
-- and the ET tube's lip level and humidifier (HME / heated) belong to the tube.
--
-- All columns on the rows the round and the lines card already write.

ALTER TABLE icu_observations
  ADD COLUMN IF NOT EXISTS icp            smallint,
  ADD COLUMN IF NOT EXISTS cuff_pressure  smallint,
  ADD COLUMN IF NOT EXISTS pifr           smallint,
  ADD COLUMN IF NOT EXISTS ie_ratio       text,
  ADD COLUMN IF NOT EXISTS suction        text,
  ADD COLUMN IF NOT EXISTS gcs_eye_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gcs_tube       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position       text,
  ADD COLUMN IF NOT EXISTS rt_checked     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insulin_route  text;

ALTER TABLE icu_observations DROP CONSTRAINT IF EXISTS icu_observations_round_detail_check;
ALTER TABLE icu_observations ADD CONSTRAINT icu_observations_round_detail_check CHECK (
  (icp IS NULL OR icp BETWEEN -10 AND 100)
  AND (cuff_pressure IS NULL OR cuff_pressure BETWEEN 0 AND 80)
  AND (pifr IS NULL OR pifr BETWEEN 0 AND 200)
  AND (ie_ratio IS NULL OR ie_ratio ~ '^[0-9](\.[0-9])?:[0-9](\.[0-9])?$')
  AND (suction IS NULL OR suction = ANY (ARRAY['none', 'scanty', 'moderate', 'copious']))
  AND (position IS NULL OR position = ANY (ARRAY['supine', 'left', 'right', 'prone', 'head_up', 'sitting']))
  AND (insulin_route IS NULL OR insulin_route = ANY (ARRAY['sc', 'iv']))
  -- A component marked C or T is not scored, so it cannot also carry a number.
  AND (NOT gcs_eye_closed OR gcs_e IS NULL)
  AND (NOT gcs_tube OR gcs_v IS NULL));

ALTER TABLE ipd_lines
  ADD COLUMN IF NOT EXISTS lip_level_cm numeric(4,1),
  ADD COLUMN IF NOT EXISTS humidifier   text;

ALTER TABLE ipd_lines DROP CONSTRAINT IF EXISTS ipd_lines_tube_detail_check;
ALTER TABLE ipd_lines ADD CONSTRAINT ipd_lines_tube_detail_check CHECK (
  (lip_level_cm IS NULL OR lip_level_cm BETWEEN 5 AND 40)
  AND (humidifier IS NULL OR humidifier = ANY (ARRAY['hme', 'heated'])));

COMMENT ON COLUMN icu_observations.gcs_tube IS 'GCS verbal not testable — ET tube / tracheostomy ("T" on KMCH''s chart). gcs_v stays empty.';
COMMENT ON COLUMN icu_observations.gcs_eye_closed IS 'GCS eyes not testable — closed by swelling ("C"). gcs_e stays empty.';
COMMENT ON COLUMN icu_observations.rt_checked IS 'Ryles tube position checked at this round (KMCH: 7 AM, 1 PM, 3 PM, 7 PM, 11 PM).';

NOTIFY pgrst, 'reload schema';
