-- Atomic bill payment ──────────────────────────────────────────────────────────
-- recordPayment did read-bill → check balance → insert payment → write
-- paid = old paid + amount in separate round-trips. Two cashiers paying the same
-- bill at once both passed the balance check (overpaying it) and the second paid
-- update overwrote the first.
--
-- This does it in one transaction with the bill row locked (FOR UPDATE), so a
-- concurrent payment waits and then sees the first one. The balance is computed
-- from the payments table, not the cached bills.paid. SECURITY INVOKER: runs with
-- the caller's rights, so RLS still confines it to the caller's hospital.

CREATE OR REPLACE FUNCTION record_bill_payment(
  p_bill_id   uuid,
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

  INSERT INTO payments (id, tenant_id, bill_id, amount, method, reference, received_by)
  VALUES (gen_random_uuid(), v_bill.tenant_id, p_bill_id, p_amount, p_method, p_reference, auth.uid());

  v_new_paid := round(v_paid + p_amount, 2);
  v_status   := CASE WHEN v_new_paid >= v_bill.total THEN 'paid' ELSE 'partial' END;
  UPDATE bills SET paid = v_new_paid, status = v_status WHERE id = p_bill_id;

  RETURN jsonb_build_object('ok', true, 'paid', v_new_paid, 'status', v_status, 'balance', round(v_bill.total - v_new_paid, 2));
END;
$$;

REVOKE ALL ON FUNCTION record_bill_payment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_bill_payment(uuid, numeric, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
