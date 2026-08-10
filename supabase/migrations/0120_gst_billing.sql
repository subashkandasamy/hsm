-- GST tax-invoice support.
-- India: healthcare services are GST-exempt; pharmacy/consumables are taxable
-- (pharmacy MRP is GST-inclusive). Tax is computed PER LINE and split into
-- CGST + SGST (intra-state — place of supply for healthcare is the hospital).

-- ── Hospital GST configuration (on the billing profile) ──────────────────────
ALTER TABLE tenant_profiles
  ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_state_code TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_default_gst_rate NUMERIC NOT NULL DEFAULT 12;

-- ── Per-line GST on bill items ───────────────────────────────────────────────
-- gst_rate: 0 (exempt) / 5 / 12 / 18 …
-- tax_inclusive: true when unit_price already includes GST (pharmacy MRP)
-- taxable_value: pre-tax value of the line; tax_amount: GST on the line (CGST+SGST)
ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS gst_rate NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hsn_sac TEXT,
  ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS taxable_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0;

-- ── GST split + round-off on the bill ────────────────────────────────────────
-- `tax` stays as the total GST (= cgst + sgst + igst) for backward compatibility.
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS cgst NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off NUMERIC NOT NULL DEFAULT 0;
