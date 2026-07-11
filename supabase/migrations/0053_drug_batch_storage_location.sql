-- Storage location per drug batch (rack / shelf / bin as free text)
-- e.g. "Rack A / Shelf 2 / Bin 3" or "A-2-3"
ALTER TABLE drug_batches ADD COLUMN IF NOT EXISTS storage_location TEXT;
