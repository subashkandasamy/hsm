-- ============================================================
-- HMS Phase 5: Billing & Insurance
-- ============================================================

-- ---- Gap-fill: charge columns on existing tables ----

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS consultation_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status   text    NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled','billed','waived'));

ALTER TABLE wards
  ADD COLUMN IF NOT EXISTS daily_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled','billed'));

-- ---- Tariffs / config ----

CREATE TABLE IF NOT EXISTS tariffs (
  id     uuid    PRIMARY KEY,
  key    text    UNIQUE NOT NULL,
  label  text,
  amount numeric NOT NULL DEFAULT 0
);

-- Seed default consultation fee tariff
INSERT INTO tariffs (id, key, label, amount)
VALUES (gen_random_uuid(), 'default_consultation_fee', 'Default Consultation Fee', 300)
ON CONFLICT (key) DO NOTHING;

-- ---- Bills ----

CREATE TABLE IF NOT EXISTS bills (
  id           uuid        PRIMARY KEY,
  patient_id   uuid        NOT NULL REFERENCES patients(id),
  visit_id     uuid        REFERENCES visits(id),
  admission_id uuid        REFERENCES admissions(id),
  bill_no      text        UNIQUE NOT NULL,
  subtotal     numeric     NOT NULL DEFAULT 0,
  discount     numeric     NOT NULL DEFAULT 0,
  tax          numeric     NOT NULL DEFAULT 0,
  total        numeric     NOT NULL DEFAULT 0,
  paid         numeric     NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','unpaid','partial','paid','cancelled')),
  created_by   uuid        REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bills_patient_idx ON bills (patient_id);
CREATE INDEX IF NOT EXISTS bills_visit_idx   ON bills (visit_id);
CREATE INDEX IF NOT EXISTS bills_status_idx  ON bills (status);

-- ---- Bill items ----

CREATE TABLE IF NOT EXISTS bill_items (
  id          uuid    PRIMARY KEY,
  bill_id     uuid    NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  source      text    NOT NULL
              CHECK (source IN ('consultation','bed','lab','radiology','pharmacy','ot','ot_consumable','blood','manual')),
  ref_id      uuid,
  description text    NOT NULL,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  amount      numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bill_items_bill_idx   ON bill_items (bill_id);
CREATE INDEX IF NOT EXISTS bill_items_ref_id_idx ON bill_items (ref_id);

-- ---- Payments ----

CREATE TABLE IF NOT EXISTS payments (
  id          uuid        PRIMARY KEY,
  bill_id     uuid        NOT NULL REFERENCES bills(id),
  amount      numeric     NOT NULL CHECK (amount > 0),
  method      text        NOT NULL CHECK (method IN ('cash','card','upi','bank_transfer','insurance')),
  reference   text,
  received_by uuid        REFERENCES profiles(id),
  received_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_bill_idx ON payments (bill_id);

-- ---- Insurance policies ----

CREATE TABLE IF NOT EXISTS insurance_policies (
  id               uuid        PRIMARY KEY,
  patient_id       uuid        NOT NULL REFERENCES patients(id),
  provider         text        NOT NULL,
  policy_no        text        NOT NULL,
  valid_till       date,
  coverage_amount  numeric,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insurance_policies_patient_idx ON insurance_policies (patient_id);

-- ---- Insurance claims ----

CREATE TABLE IF NOT EXISTS insurance_claims (
  id               uuid        PRIMARY KEY,
  bill_id          uuid        NOT NULL REFERENCES bills(id),
  policy_id        uuid        NOT NULL REFERENCES insurance_policies(id),
  claim_amount     numeric     NOT NULL,
  approved_amount  numeric,
  status           text        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','preauth','submitted','approved','rejected','settled')),
  remarks          text,
  submitted_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insurance_claims_bill_idx    ON insurance_claims (bill_id);
CREATE INDEX IF NOT EXISTS insurance_claims_policy_idx  ON insurance_claims (policy_id);
CREATE INDEX IF NOT EXISTS insurance_claims_status_idx  ON insurance_claims (status);

-- ---- Race-safe bill number sequence ----
-- Generates BILL-YYYY-NNNNN atomically using a per-year sequence row

CREATE TABLE IF NOT EXISTS bill_no_seq (
  year    int  PRIMARY KEY,
  last_no int  NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION get_next_bill_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   int  := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_seq    int;
BEGIN
  INSERT INTO bill_no_seq (year, last_no) VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_no = bill_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN 'BILL-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_bill_no() TO authenticated;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE tariffs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_no_seq        ENABLE ROW LEVEL SECURITY;

-- Tariffs: anyone authenticated can read; admin/accountant can mutate
CREATE POLICY "tariffs_read"   ON tariffs FOR SELECT TO authenticated USING (true);
CREATE POLICY "tariffs_write"  ON tariffs FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

-- Bills: authenticated users can read; billing roles can mutate
CREATE POLICY "bills_read"  ON bills FOR SELECT TO authenticated USING (true);
CREATE POLICY "bills_write" ON bills FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant','receptionist')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant','receptionist')));

-- Bill items: follow bills
CREATE POLICY "bill_items_read"  ON bill_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "bill_items_write" ON bill_items FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant','receptionist')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant','receptionist')));

-- Payments
CREATE POLICY "payments_read"  ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_write" ON payments FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant','receptionist')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant','receptionist')));

-- Insurance policies
CREATE POLICY "ins_policies_read"  ON insurance_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins_policies_write" ON insurance_policies FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

-- Insurance claims
CREATE POLICY "ins_claims_read"  ON insurance_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "ins_claims_write" ON insurance_claims FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

-- bill_no_seq: only service-role (used by function) — or authenticated for RPC
CREATE POLICY "bill_no_seq_all" ON bill_no_seq FOR ALL TO authenticated USING (true) WITH CHECK (true);
