-- What a pharmacy needs to know about a supplier ─────────────────────────────
--
-- A supplier was a name, a contact person, a phone and an email. A pharma
-- distributor's invoice carries more that the hospital needs to keep: its
-- GSTIN (input tax credit and the purchase register), its drug licence number
-- (Drugs and Cosmetics Rules: a pharmacy buys only from a licensed
-- wholesaler), and its address. KMCH's previous software held all three for
-- its 34 distributors.
--
-- All three are optional; existing suppliers are untouched.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS gstin           text,
  ADD COLUMN IF NOT EXISTS drug_licence_no text,
  ADD COLUMN IF NOT EXISTS address         text;

COMMENT ON COLUMN suppliers.gstin IS
  'Supplier GSTIN: 15 characters, 2-digit state code first (e.g. 33AAUFA6293R1ZH).';
COMMENT ON COLUMN suppliers.drug_licence_no IS
  'Wholesale drug licence number(s) as printed on the supplier''s invoice (e.g. TN/SLW/20B/00725).';
COMMENT ON COLUMN suppliers.address IS
  'Supplier address as one line: street, area, city, state, PIN.';

-- A GSTIN has a fixed shape; a typo here would follow every purchase entry.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_gstin_format;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_gstin_format
  CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z0-9]{13}$');

NOTIFY pgrst, 'reload schema';
