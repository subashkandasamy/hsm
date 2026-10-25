-- What this hospital calls each kind of income, and each way money arrives.
--
-- Every accounting package — Tally, Busy, Marg, Zoho — imports against ledger
-- names that already exist in the company's books, and a name that does not
-- match is a rejected voucher. There is no universal chart of accounts: one
-- hospital posts laboratory income to "Diagnostic Income" and the next to
-- "Lab Receipts", and neither is wrong.
--
-- So this is not a setting with a sensible default we could guess. It is the
-- hospital's own vocabulary, typed in once by whoever keeps the books, and
-- used by every exporter rather than by any one of them. That is why it lives
-- here and not inside a Tally-shaped module: the mapping is needed by the CSV
-- a small-town CA opens in Excel just as much as by an XML import.
--
-- `key` is deliberately loose text rather than an enum. It holds a
-- `bill_items.source` for income and a payment method for receipts, and both
-- of those grow — a new department or a new wallet should not need a
-- migration before the accountant can name it.

CREATE TABLE IF NOT EXISTS ledger_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 'source' = a kind of income (bill_items.source); 'method' = how money arrived.
  kind        text NOT NULL CHECK (kind IN ('source', 'method')),
  key         text NOT NULL,
  ledger_name text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, key)
);

CREATE INDEX IF NOT EXISTS ledger_mappings_tenant_idx ON ledger_mappings (tenant_id, kind);

ALTER TABLE ledger_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_mappings_tenant_all ON ledger_mappings;
CREATE POLICY ledger_mappings_tenant_all ON ledger_mappings FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

COMMENT ON TABLE ledger_mappings IS
  'The hospital''s own ledger name for each income head and payment method. Used by every accounting export, not by one package: a guessed ledger name is a rejected import in Tally, Busy, Marg and Zoho alike.';
