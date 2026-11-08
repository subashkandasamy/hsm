-- One payment across several bills.
--
-- An outpatient leaves with a consultation bill, a lab bill, a pharmacy bill —
-- and pays once. A payment row belongs to exactly one bill (payments.bill_id is
-- NOT NULL) and record_bill_payment (0134) pays one bill, so the cashier had to
-- take the money once and enter it three times. Looping that RPC from the
-- application is not a substitute: if the second call fails the first has
-- already committed, and the money is half-applied.
--
-- This takes one amount and spreads it over the chosen bills, oldest first, in
-- one transaction. It writes ONE PAYMENT ROW PER BILL, exactly as 0134 would,
-- so the cash book, the day's collections, GST and per-department revenue all
-- read it unchanged — and later, routing each department's money to its own
-- account depends on payments staying attached to their bills. The rows share
-- a payment_group_id: the record that they were one handover of money.
--
-- Same discipline as 0134: SECURITY INVOKER, so RLS confines it to the caller's
-- hospital; every bill locked FOR UPDATE, in id order, so two cashiers
-- collecting overlapping sets queue rather than deadlock; balances computed
-- from the payments table inside the lock, never from the cached bills.paid;
-- an overpayment refused. Insurance is not accepted here — a settlement has its
-- own path, which records the claim it belongs to.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_group_id uuid;

COMMENT ON COLUMN payments.payment_group_id IS
  'Shared by the rows one record_encounter_payment call wrote: one amount received, spread over several bills. NULL for an ordinary single-bill payment.';

CREATE INDEX IF NOT EXISTS idx_payments_group
  ON payments (payment_group_id) WHERE payment_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION record_encounter_payment(
  p_bill_ids  uuid[],
  p_amount    numeric,
  p_method    text,
  p_reference text DEFAULT NULL
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a valid payment amount');
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'card', 'upi', 'bank_transfer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose cash, card, UPI or bank transfer');
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(p_bill_ids) AS x WHERE x IS NOT NULL);
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose at least one bill');
  END IF;
  IF array_length(v_ids, 1) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many bills in one payment');
  END IF;

  -- Lock every bill first, in a fixed order.
  PERFORM 1 FROM bills WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  SELECT count(*), count(DISTINCT patient_id), count(*) FILTER (WHERE status = 'cancelled')
    INTO v_found, v_patients, v_cancelled
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
    INSERT INTO payments (id, tenant_id, bill_id, amount, method, reference, received_by, payment_group_id)
    VALUES (gen_random_uuid(), v_bill.tenant_id, v_bill.id, v_take, p_method, p_reference, auth.uid(), v_group);

    v_new_paid := round(v_paid + v_take, 2);
    v_status   := CASE WHEN v_new_paid >= v_bill.total THEN 'paid' ELSE 'partial' END;
    UPDATE bills SET paid = v_new_paid, status = v_status WHERE id = v_bill.id;

    v_alloc := v_alloc || jsonb_build_object(
      'bill_id', v_bill.id, 'bill_no', v_bill.bill_no, 'amount', v_take, 'status', v_status);
    v_left := round(v_left - v_take, 2);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'group_id', v_group, 'allocated', v_alloc, 'amount', round(p_amount, 2));
END;
$$;

-- Moves money, so never PUBLIC or anon (0259).
REVOKE ALL ON FUNCTION record_encounter_payment(uuid[], numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_encounter_payment(uuid[], numeric, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
