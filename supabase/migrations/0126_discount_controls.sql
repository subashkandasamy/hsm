-- Discount controls: %/₹ discounts with a reason, per-role caps, and an
-- approval workflow when a discount exceeds the requester's cap.

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS discount_pct    NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason TEXT;

-- Per-role maximum discount %. No row = default (admin unlimited, others 0).
CREATE TABLE IF NOT EXISTS discount_limits (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  max_percent NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, role)
);

-- Approval queue for discounts that exceed the requester's cap.
CREATE TABLE IF NOT EXISTS discount_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id          UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  requested_by     UUID REFERENCES profiles(id),
  requested_pct    NUMERIC NOT NULL DEFAULT 0,
  requested_amount NUMERIC NOT NULL DEFAULT 0,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by       UUID REFERENCES profiles(id),
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discount_requests_bill   ON discount_requests (bill_id);
CREATE INDEX IF NOT EXISTS idx_discount_requests_status ON discount_requests (tenant_id, status);

ALTER TABLE discount_limits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_limits_tenant_all ON discount_limits;
CREATE POLICY discount_limits_tenant_all ON discount_limits
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS discount_requests_tenant_all ON discount_requests;
CREATE POLICY discount_requests_tenant_all ON discount_requests
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
