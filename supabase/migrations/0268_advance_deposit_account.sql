-- IPD advance deposits into a chosen account.
--
-- 0267 let a hospital point each department at its own account, so each
-- department's QR pays into it. An IPD advance had no account at all: the
-- deposit recorded "₹10,000, UPI" and nothing about where the money went, and
-- the deposit screens showed no QR, so staff typed a UPI id by hand.
--
-- 1. "advance" becomes a routable key in collection_account_routes. No row =
--    the main account (tenant_profiles.upi_vpa), as for every department.
-- 2. admission_advances.account_id: which account a UPI / bank deposit went
--    into. NULL = main for those methods, and no particular account for cash
--    and card — the same meaning as payments.account_id (0267). RESTRICT on
--    delete: an account that has received money is deactivated, not deleted.
--
-- Moving money between the hospital's own accounts afterwards (an advance in
-- main that paid a lab bill) is left to the hospital, by the user's decision;
-- nothing here records it.

ALTER TABLE collection_account_routes DROP CONSTRAINT IF EXISTS collection_account_routes_department_check;
ALTER TABLE collection_account_routes ADD CONSTRAINT collection_account_routes_department_check CHECK (department IN (
  'consultation', 'room', 'pharmacy', 'lab', 'radiology', 'ot', 'blood', 'dental', 'vaccine', 'other', 'advance'));

COMMENT ON TABLE collection_account_routes IS
  'Which account a department''s bill lines — or, for ''advance'', IPD advance deposits — are paid into. No row = the main account (tenant_profiles.upi_vpa). The department list mirrors DEPARTMENTS in src/lib/billing/collectionAccounts.ts.';

ALTER TABLE admission_advances
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES insurance_bank_accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN admission_advances.account_id IS
  'For UPI / bank transfer: the account the deposit was paid into, NULL = main (tenant_profiles.upi_vpa). Always NULL for cash and card.';

CREATE INDEX IF NOT EXISTS idx_admission_advances_account
  ON admission_advances (account_id) WHERE account_id IS NOT NULL;

-- The deposit row is written by the application, not by a checking function,
-- and a foreign key does not go through RLS — so an account of another
-- hospital is refused here.
CREATE OR REPLACE FUNCTION admission_advances_account_same_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    IF NEW.method NOT IN ('upi', 'bank_transfer') THEN
      RAISE EXCEPTION 'Only a UPI or bank deposit goes into a particular account';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM insurance_bank_accounts a WHERE a.id = NEW.account_id AND a.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'That account does not belong to this hospital';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admission_advances_account_same_tenant() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_admission_advances_account_same_tenant ON admission_advances;
CREATE TRIGGER trg_admission_advances_account_same_tenant
  BEFORE INSERT OR UPDATE OF account_id, method ON admission_advances
  FOR EACH ROW EXECUTE FUNCTION admission_advances_account_same_tenant();

NOTIFY pgrst, 'reload schema';
