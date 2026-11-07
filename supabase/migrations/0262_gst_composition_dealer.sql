-- A hospital registered under the GST composition scheme.
--
-- 0120 modelled two states: GST invoicing on, or no GST at all. There is a
-- third, and KMCH is in it — their own pharmacy bills print "GST Composition
-- Dealer". A composition taxpayer holds a GSTIN but may NOT collect tax from
-- the customer: they pay a flat percentage of turnover themselves and take no
-- input credit. Section 10, CGST Act.
--
-- Two consequences the software has to honour:
--   * No tax line may ever appear on their bill. Charging GST a composition
--     dealer is not entitled to collect is the violation, not the compliance.
--   * The document is a BILL OF SUPPLY, never a TAX INVOICE, and must carry the
--     declaration that the supplier cannot collect tax (CGST Rules).
--
-- Kept as its own flag rather than a third value of gst_enabled, so an existing
-- tenant's behaviour is untouched until someone sets it. Default false: no
-- tenant becomes a composition dealer by upgrade.
ALTER TABLE tenant_profiles
  ADD COLUMN IF NOT EXISTS gst_composition BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenant_profiles.gst_composition IS
  'GST composition scheme (s.10 CGST Act): registered, but may not collect tax. '
  'Forces every bill line to 0% and the document to a Bill of Supply.';
