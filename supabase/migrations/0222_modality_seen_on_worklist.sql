-- A scanner should appear in Uyirly when it asks, not when it photographs.
--
-- `radiology_modalities` rows were only ever created by an arriving study, so
-- a machine could be querying its worklist correctly all morning and still be
-- invisible on the Analyzers screen. That is backwards during an installation,
-- which is the one time somebody is standing there wanting confirmation: the
-- worklist query is the earliest proof the machine can reach us at all.
--
-- A separate column rather than reusing last_study_at, because the two facts
-- are different and the difference is the useful part — "it is talking to us
-- but has never sent an image" is a diagnosis, not a gap in the data.

alter table radiology_modalities
  add column if not exists last_worklist_at timestamptz;

comment on column radiology_modalities.last_worklist_at is
  'When this machine last asked for its worklist. Set without a study ever '
  'arriving, so a scanner is visible from the moment it is wired up.';
