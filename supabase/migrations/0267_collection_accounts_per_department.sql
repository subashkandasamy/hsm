-- Each department's money into its own account.
--
-- A hospital may keep separate bank accounts — one for pharmacy, one for lab
-- and radiology — and wants each department's QR to pay into its own. Until
-- now there was one UPI id (tenant_profiles.upi_vpa, 0233) and every QR paid
-- into it.
--
-- The MAIN account stays exactly that profile UPI id. Anything not pointed
-- elsewhere goes there, so a hospital that sets nothing behaves as before.
--
-- 1. Extra accounts reuse insurance_bank_accounts (0076): it is already the
--    hospital's list of bank accounts (insurance settlements pick from it) and
--    is empty in every hospital today. It gains a UPI id and payee name, with
--    the same shape check as the profile UPI id.
--    Its writes become ADMIN-ONLY. A UPI id here decides where patients' money
--    goes; until now any member of staff could change it. Reading stays open
--    to the hospital's staff (the insurance desk picks a settlement account).
--
-- 2. collection_account_routes: department → account. A department without a
--    row goes to main. Deleting an account deletes its routes (back to main).
--
-- 3. payments.account_id: which account a UPI / bank payment went into. NULL
--    is main for those methods, and "no account" for cash, card, advance and
--    insurance. RESTRICT on delete: a payment's account is history, so an
--    account that has received money is deactivated, not deleted.
--
-- 4. record_bill_payment (0134) and record_encounter_payment (0266) take the
--    account. record_encounter_payment also takes an exact amount per bill, so
--    money paid into the pharmacy account lands on the pharmacy bills only —
--    oldest-first spreading would put it on the consultation. Both new
--    parameters default to NULL, so a call written for 0134/0266 still works.
--    The old signatures are dropped first: two overloads would make PostgREST's
--    named-argument call ambiguous.
--
-- Which department a bill line belongs to, and so which account it is owed to,
-- is decided in src/lib/billing/collectionAccounts.ts.

-- ── 1. Accounts ────────────────────────────────────────────────────────────
ALTER TABLE insurance_bank_accounts
  ADD COLUMN IF NOT EXISTS upi_vpa        text,
  ADD COLUMN IF NOT EXISTS upi_payee_name text;

ALTER TABLE insurance_bank_accounts DROP CONSTRAINT IF EXISTS insurance_bank_accounts_upi_vpa_shape;
ALTER TABLE insurance_bank_accounts ADD CONSTRAINT insurance_bank_accounts_upi_vpa_shape CHECK (
  upi_vpa IS NULL
  OR upi_vpa ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}@[a-zA-Z][a-zA-Z0-9.]{1,63}$'
);

COMMENT ON TABLE insurance_bank_accounts IS
  'The hospital''s bank accounts other than the main one (the main one is tenant_profiles.upi_vpa). Used for insurance settlements and, through collection_account_routes, for patient collections by department. Name is historical.';
COMMENT ON COLUMN insurance_bank_accounts.upi_vpa IS
  'UPI id patients pay into when a department is routed to this account. Never Uyirly''s.';
COMMENT ON COLUMN insurance_bank_accounts.upi_payee_name IS
  'Name the patient sees in their UPI app. Falls back to the hospital name.';

DROP POLICY IF EXISTS insurance_bank_accounts_tenant_all ON insurance_bank_accounts;

DROP POLICY IF EXISTS insurance_bank_accounts_read ON insurance_bank_accounts;
CREATE POLICY insurance_bank_accounts_read ON insurance_bank_accounts
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS insurance_bank_accounts_admin_insert ON insurance_bank_accounts;
CREATE POLICY insurance_bank_accounts_admin_insert ON insurance_bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

DROP POLICY IF EXISTS insurance_bank_accounts_admin_update ON insurance_bank_accounts;
CREATE POLICY insurance_bank_accounts_admin_update ON insurance_bank_accounts
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

DROP POLICY IF EXISTS insurance_bank_accounts_admin_delete ON insurance_bank_accounts;
CREATE POLICY insurance_bank_accounts_admin_delete ON insurance_bank_accounts
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

REVOKE ALL ON insurance_bank_accounts FROM anon;

-- ── 2. Department → account ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_account_routes (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department  text NOT NULL CHECK (department IN (
    'consultation', 'room', 'pharmacy', 'lab', 'radiology', 'ot', 'blood', 'dental', 'vaccine', 'other')),
  account_id  uuid NOT NULL REFERENCES insurance_bank_accounts(id) ON DELETE CASCADE,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, department)
);

COMMENT ON TABLE collection_account_routes IS
  'Which account a department''s bill lines are paid into. No row = the main account (tenant_profiles.upi_vpa). The department list mirrors DEPARTMENTS in src/lib/billing/collectionAccounts.ts.';

ALTER TABLE collection_account_routes ENABLE ROW LEVEL SECURITY;

-- Read by every member of staff: whoever collects a payment needs the right QR.
DROP POLICY IF EXISTS collection_account_routes_read ON collection_account_routes;
CREATE POLICY collection_account_routes_read ON collection_account_routes
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS collection_account_routes_admin_insert ON collection_account_routes;
CREATE POLICY collection_account_routes_admin_insert ON collection_account_routes
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

DROP POLICY IF EXISTS collection_account_routes_admin_update ON collection_account_routes;
CREATE POLICY collection_account_routes_admin_update ON collection_account_routes
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

DROP POLICY IF EXISTS collection_account_routes_admin_delete ON collection_account_routes;
CREATE POLICY collection_account_routes_admin_delete ON collection_account_routes
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

REVOKE ALL ON collection_account_routes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_account_routes TO authenticated;

-- A route must point at an account of the same hospital. RLS on the accounts
-- table hides other hospitals' rows from a SELECT, but a foreign key check does
-- not go through RLS, so it is checked here.
CREATE OR REPLACE FUNCTION collection_account_routes_same_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM insurance_bank_accounts a WHERE a.id = NEW.account_id AND a.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'That account does not belong to this hospital';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION collection_account_routes_same_tenant() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_collection_account_routes_same_tenant ON collection_account_routes;
CREATE TRIGGER trg_collection_account_routes_same_tenant
  BEFORE INSERT OR UPDATE ON collection_account_routes
  FOR EACH ROW EXECUTE FUNCTION collection_account_routes_same_tenant();

-- ── 3. Which account a payment went into ───────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES insurance_bank_accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN payments.account_id IS
  'For UPI / bank transfer: the account it was paid into, NULL = main (tenant_profiles.upi_vpa). Always NULL for cash, card, advance and insurance, which go to no particular account.';

CREATE INDEX IF NOT EXISTS idx_payments_account
  ON payments (account_id) WHERE account_id IS NOT NULL;

-- ── 4a. One bill ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS record_bill_payment(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION record_bill_payment(
  p_bill_id    uuid,
  p_amount     numeric,
  p_method     text,
  p_reference  text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_bill     bills%ROWTYPE;
  v_paid     numeric;
  v_balance  numeric;
  v_new_paid numeric;
  v_status   text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a valid payment amount');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  IF v_bill.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill is cancelled');
  END IF;

  IF p_account_id IS NOT NULL THEN
    IF p_method NOT IN ('upi', 'bank_transfer') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only a UPI or bank payment goes into a particular account');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM insurance_bank_accounts WHERE id = p_account_id AND tenant_id = v_bill.tenant_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'That account was not found');
    END IF;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_paid FROM payments WHERE bill_id = p_bill_id;
  v_balance := round(v_bill.total - v_paid, 2);

  IF v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill is already fully paid');
  END IF;
  IF p_amount > v_balance + 0.001 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('Payment of ₹%s exceeds balance due of ₹%s',
        to_char(p_amount, 'FM999999999990.00'), to_char(v_balance, 'FM999999999990.00')));
  END IF;

  INSERT INTO payments (id, tenant_id, bill_id, amount, method, reference, received_by, account_id)
  VALUES (gen_random_uuid(), v_bill.tenant_id, p_bill_id, p_amount, p_method, p_reference, auth.uid(), p_account_id);

  v_new_paid := round(v_paid + p_amount, 2);
  v_status   := CASE WHEN v_new_paid >= v_bill.total THEN 'paid' ELSE 'partial' END;
  UPDATE bills SET paid = v_new_paid, status = v_status WHERE id = p_bill_id;

  RETURN jsonb_build_object('ok', true, 'paid', v_new_paid, 'status', v_status, 'balance', round(v_bill.total - v_new_paid, 2));
END;
$$;

REVOKE ALL ON FUNCTION record_bill_payment(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_bill_payment(uuid, numeric, text, text, uuid) TO authenticated, service_role;

-- ── 4b. Several bills ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS record_encounter_payment(uuid[], numeric, text, text);

CREATE OR REPLACE FUNCTION record_encounter_payment(
  p_bill_ids   uuid[],
  p_amount     numeric,
  p_method     text,
  p_reference  text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  -- Optional: exactly how much goes on each bill, in the order of p_bill_ids.
  -- NULL = spread oldest bill first (0266).
  p_amounts    numeric[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids       uuid[];
  v_found     int;
  v_patients  int;
  v_cancelled int;
  v_tenants   int;
  v_tenant    uuid;
  v_bill      record;
  v_paid      numeric;
  v_balance   numeric;
  v_total_due numeric := 0;
  v_left      numeric;
  v_take      numeric;
  v_new_paid  numeric;
  v_status    text;
  v_group     uuid := gen_random_uuid();
  v_alloc     jsonb := '[]'::jsonb;
  v_sum       numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a valid payment amount');
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'card', 'upi', 'bank_transfer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose cash, card, UPI or bank transfer');
  END IF;
  IF p_account_id IS NOT NULL AND p_method NOT IN ('upi', 'bank_transfer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only a UPI or bank payment goes into a particular account');
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(p_bill_ids) AS x WHERE x IS NOT NULL);
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose at least one bill');
  END IF;
  IF array_length(v_ids, 1) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many bills in one payment');
  END IF;

  IF p_amounts IS NOT NULL THEN
    -- An exact split must name each bill once, with one amount each.
    IF array_length(p_amounts, 1) IS DISTINCT FROM array_length(p_bill_ids, 1)
       OR array_length(v_ids, 1) <> array_length(p_bill_ids, 1) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Each bill needs exactly one amount');
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_amounts) a WHERE a IS NULL OR a <= 0) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Each bill''s amount must be more than zero');
    END IF;
    SELECT round(sum(a), 2) INTO v_sum FROM unnest(p_amounts) a;
    IF abs(v_sum - round(p_amount, 2)) > 0.001 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'The amounts per bill do not add up to the payment');
    END IF;
  END IF;

  -- Lock every bill first, in a fixed order.
  PERFORM 1 FROM bills WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  SELECT count(*), count(DISTINCT patient_id), count(*) FILTER (WHERE status = 'cancelled'),
         count(DISTINCT tenant_id), min(tenant_id::text)::uuid
    INTO v_found, v_patients, v_cancelled, v_tenants, v_tenant
    FROM bills WHERE id = ANY (v_ids);

  -- RLS hides another hospital's bills, so they simply are not found.
  IF v_found <> array_length(v_ids, 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'One of those bills was not found');
  END IF;
  IF v_patients > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Those bills belong to different patients');
  END IF;
  IF v_cancelled > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'One of those bills is cancelled');
  END IF;
  IF p_account_id IS NOT NULL
     AND (v_tenants <> 1 OR NOT EXISTS (SELECT 1 FROM insurance_bank_accounts WHERE id = p_account_id AND tenant_id = v_tenant)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That account was not found');
  END IF;

  -- What is still owed, from the payments themselves.
  FOR v_bill IN SELECT id, total FROM bills WHERE id = ANY (v_ids) LOOP
    SELECT coalesce(sum(amount), 0) INTO v_paid FROM payments WHERE bill_id = v_bill.id;
    v_balance := round(v_bill.total - v_paid, 2);
    IF v_balance > 0 THEN v_total_due := v_total_due + v_balance; END IF;
  END LOOP;

  IF v_total_due <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'These bills are already fully paid');
  END IF;
  IF p_amount > v_total_due + 0.001 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('Payment of ₹%s exceeds the balance due of ₹%s',
        to_char(p_amount, 'FM999999999990.00'), to_char(v_total_due, 'FM999999999990.00')));
  END IF;

  IF p_amounts IS NOT NULL THEN
    -- Exactly as asked, each bill no more than its own balance.
    FOR v_bill IN
      SELECT b.id, b.tenant_id, b.total, b.bill_no, round(x.amt, 2) AS amt
        FROM unnest(p_bill_ids, p_amounts) AS x(bill_id, amt)
        JOIN bills b ON b.id = x.bill_id
       ORDER BY b.created_at, b.bill_no
    LOOP
      SELECT coalesce(sum(amount), 0) INTO v_paid FROM payments WHERE bill_id = v_bill.id;
      v_balance := round(v_bill.total - v_paid, 2);
      IF v_bill.amt > v_balance + 0.001 THEN
        RAISE EXCEPTION 'Bill % has only ₹% left to pay', v_bill.bill_no, to_char(v_balance, 'FM999999999990.00');
      END IF;

      INSERT INTO payments (id, tenant_id, bill_id, amount, method, reference, received_by, payment_group_id, account_id)
      VALUES (gen_random_uuid(), v_bill.tenant_id, v_bill.id, v_bill.amt, p_method, p_reference, auth.uid(), v_group, p_account_id);

      v_new_paid := round(v_paid + v_bill.amt, 2);
      v_status   := CASE WHEN v_new_paid >= v_bill.total THEN 'paid' ELSE 'partial' END;
      UPDATE bills SET paid = v_new_paid, status = v_status WHERE id = v_bill.id;

      v_alloc := v_alloc || jsonb_build_object(
        'bill_id', v_bill.id, 'bill_no', v_bill.bill_no, 'amount', v_bill.amt, 'status', v_status);
    END LOOP;
  ELSE
    -- Spread it, oldest bill first.
    v_left := round(p_amount, 2);
    FOR v_bill IN
      SELECT id, tenant_id, total, bill_no FROM bills
       WHERE id = ANY (v_ids)
       ORDER BY created_at, bill_no
    LOOP
      EXIT WHEN v_left <= 0;
      SELECT coalesce(sum(amount), 0) INTO v_paid FROM payments WHERE bill_id = v_bill.id;
      v_balance := round(v_bill.total - v_paid, 2);
      CONTINUE WHEN v_balance <= 0;

      v_take := least(v_balance, v_left);
      INSERT INTO payments (id, tenant_id, bill_id, amount, method, reference, received_by, payment_group_id, account_id)
      VALUES (gen_random_uuid(), v_bill.tenant_id, v_bill.id, v_take, p_method, p_reference, auth.uid(), v_group, p_account_id);

      v_new_paid := round(v_paid + v_take, 2);
      v_status   := CASE WHEN v_new_paid >= v_bill.total THEN 'paid' ELSE 'partial' END;
      UPDATE bills SET paid = v_new_paid, status = v_status WHERE id = v_bill.id;

      v_alloc := v_alloc || jsonb_build_object(
        'bill_id', v_bill.id, 'bill_no', v_bill.bill_no, 'amount', v_take, 'status', v_status);
      v_left := round(v_left - v_take, 2);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'group_id', v_group, 'allocated', v_alloc, 'amount', round(p_amount, 2));
END;
$$;

-- Moves money, so never PUBLIC or anon (0259).
REVOKE ALL ON FUNCTION record_encounter_payment(uuid[], numeric, text, text, uuid, numeric[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_encounter_payment(uuid[], numeric, text, text, uuid, numeric[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
