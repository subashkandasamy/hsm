-- Migration 0110: prepare the drug catalogue for a large-scale brand import.
--
-- 1. `source` tag on drug_master / drug_brands so bulk-imported rows are
--    identifiable and a bad import can be reverted with one DELETE.
-- 2. Trigram (pg_trgm) GIN indexes so substring/ILIKE search over ~250k brand
--    rows and ~15k molecules stays fast for the server-side drug typeahead.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE drug_master ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE drug_brands ADD COLUMN IF NOT EXISTS source text;

-- On Supabase, pg_trgm is installed in the `extensions` schema, so the operator
-- class must be schema-qualified.
CREATE INDEX IF NOT EXISTS idx_drug_master_name_trgm    ON drug_master USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_master_generic_trgm ON drug_master USING gin (generic_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_brands_name_trgm    ON drug_brands USING gin (brand_name extensions.gin_trgm_ops);
