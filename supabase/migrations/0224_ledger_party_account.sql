-- One more kind of ledger name: the account money is owed *to*.
--
-- A Sales voucher in any double-entry system needs two sides. The credit side
-- is the income head, which `kind = 'source'` already covers. The debit side
-- is whoever owes it — in a hospital's books a single sundry-debtors ledger,
-- usually called something like "Patients" or "Sundry Debtors – OPD".
--
-- It is deliberately ONE ledger rather than one per patient. A hospital with
-- ten thousand patients would otherwise create ten thousand ledgers and make
-- its accountant's file unusable; bill-wise outstanding is carried by the bill
-- reference on the voucher instead, which is exactly what that mechanism is
-- for.
--
-- 'account' rather than widening 'source': an income head and a balance-sheet
-- account are different things, and an exporter that confused them would post
-- revenue to a debtor.

ALTER TABLE ledger_mappings DROP CONSTRAINT IF EXISTS ledger_mappings_kind_check;
ALTER TABLE ledger_mappings ADD CONSTRAINT ledger_mappings_kind_check
  CHECK (kind IN ('source', 'method', 'account'));

COMMENT ON COLUMN ledger_mappings.kind IS
  'source = an income head (bill_items.source); method = how money arrived; account = a balance-sheet ledger such as sundry debtors.';
