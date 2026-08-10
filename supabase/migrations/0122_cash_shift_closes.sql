-- Cashier shift-close / cash reconciliation. Each row records one cashier
-- closing their drawer for a time window: expected cash (computed from
-- collections − cash refunds) vs counted cash, with the variance.

CREATE TABLE IF NOT EXISTS cash_shift_closes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cashier_id    uuid NOT NULL REFERENCES profiles(id),
  from_time     timestamptz NOT NULL,
  to_time       timestamptz NOT NULL,
  expected_cash numeric NOT NULL DEFAULT 0,
  counted_cash  numeric NOT NULL DEFAULT 0,
  variance      numeric NOT NULL DEFAULT 0,
  card_total    numeric NOT NULL DEFAULT 0,
  upi_total     numeric NOT NULL DEFAULT 0,
  bank_total    numeric NOT NULL DEFAULT 0,
  payment_count int NOT NULL DEFAULT 0,
  notes         text,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_shift_closes_tenant  ON cash_shift_closes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_shift_closes_cashier ON cash_shift_closes (cashier_id, to_time DESC);

ALTER TABLE cash_shift_closes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_shift_closes_tenant_all ON cash_shift_closes;
CREATE POLICY cash_shift_closes_tenant_all ON cash_shift_closes
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
