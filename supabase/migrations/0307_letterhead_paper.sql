-- Printing on the hospital's own letterhead paper.
--
-- Every A4 document Uyirly prints (prescription, lab and radiology reports,
-- discharge summary, bills, receipts, consent, emergency and operation records,
-- referral letter, medico-legal sheets, IPD admission record) draws the
-- hospital's name, address and logo at the top. A hospital like KMCH loads
-- paper that already has all of that printed on it, so Uyirly's header lands on
-- top of theirs.
--
-- With letterhead_paper on, those documents leave the top (and, for paper with
-- a printed footer, the bottom) of every page blank and start below it. Off by
-- default: no hospital's printouts change until it is switched on.
--
-- letterhead_plain_docs lists the documents still printed on plain paper (for
-- example bills, at a counter loaded with plain sheets). Empty means all of
-- them use the letterhead, so a document type added later follows the switch.
-- The keys are the ones in src/lib/pdf/letterhead.ts.
ALTER TABLE tenant_profiles
  ADD COLUMN IF NOT EXISTS letterhead_paper      BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS letterhead_top_mm     SMALLINT NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS letterhead_bottom_mm  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS letterhead_plain_docs TEXT[]   NOT NULL DEFAULT '{}';

-- An A4 sheet is 297 mm tall: past these the page has no room left to print on.
ALTER TABLE tenant_profiles DROP CONSTRAINT IF EXISTS tenant_profiles_letterhead_space;
ALTER TABLE tenant_profiles ADD CONSTRAINT tenant_profiles_letterhead_space CHECK (
  letterhead_top_mm BETWEEN 0 AND 120 AND letterhead_bottom_mm BETWEEN 0 AND 80
);

COMMENT ON COLUMN tenant_profiles.letterhead_paper IS
  'Printed on the hospital''s own letterhead paper: A4 documents leave the top and bottom blank and print no hospital header.';
COMMENT ON COLUMN tenant_profiles.letterhead_top_mm IS
  'Blank space at the top of every page, in mm, for the printed letterhead.';
COMMENT ON COLUMN tenant_profiles.letterhead_bottom_mm IS
  'Blank space at the bottom of every page, in mm, for a printed footer.';
COMMENT ON COLUMN tenant_profiles.letterhead_plain_docs IS
  'Document keys (src/lib/pdf/letterhead.ts) still printed on plain paper with the Uyirly header.';
