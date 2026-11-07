-- A test that is only ever part of a panel.
--
-- A hospital's opening lab catalogue held 246 tests, and 93 of them had no
-- price. They are not unpriced by oversight: they are the lines INSIDE a
-- report. A Liver Function Test costs ₹800 and prints Total Protein, Albumin,
-- Globulin and A/G Ratio. Nobody buys "A/G Ratio". It has no price because it
-- is not for sale.
--
-- Without a way to say so, all 93 appear on the ordering screen, and anything
-- ordered by mistake bills ₹0 — the hospital does the work and charges
-- nothing. `is_active` is the wrong tool: it means retired, and switching off
-- Albumin to tidy the order screen would puzzle whoever next asks why.
--
-- SwiftEHR, which this hospital is migrating from, has exactly this flag and
-- calls it "Package Only". Their own data shows why it matters and also why a
-- flag alone is not enough: of their 91 unpriced tests only 34 carry it, and
-- 52 of the other 57 sit inside a package regardless. The mechanism was right;
-- it was half-maintained. Defaulting to false keeps that from happening here —
-- a test is orderable unless somebody says otherwise.
--
-- Price stays NOT NULL DEFAULT 0. A component priced 0 is correct, and the
-- application-level rule (price > 0) now applies only to orderable tests.

ALTER TABLE lab_tests_catalog
  ADD COLUMN IF NOT EXISTS package_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lab_tests_catalog.package_only IS
  'True when this is a measurement inside a panel, never ordered or billed on its own. Hidden from ordering; still shown wherever results are entered.';

-- The ordering screens filter on it every time they load.
CREATE INDEX IF NOT EXISTS lab_tests_catalog_orderable
  ON lab_tests_catalog (tenant_id)
  WHERE is_active AND NOT package_only;

-- And on the shared master, so the fact travels.
--
-- "A/G Ratio is a line inside a panel" is not one hospital's opinion — it is
-- true of the test itself. Holding it only on the tenant copy would mean every
-- hospital that activates A/G Ratio rediscovers the problem and tidies its own
-- order screen by hand. Activation copies the flag down, exactly as it already
-- copies sample type, tube type and reference ranges.
ALTER TABLE lab_tests_master
  ADD COLUMN IF NOT EXISTS package_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lab_tests_master.package_only IS
  'True when this test is a measurement inside a panel rather than something ordered on its own. Copied onto a tenant''s catalogue row when the test is activated.';
