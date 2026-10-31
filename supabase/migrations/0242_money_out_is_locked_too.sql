-- F-32. Money IN was serialised and money OUT was not.
--
-- record_bill_payment takes `SELECT … FOR UPDATE` on the bill, computes the
-- balance inside the lock, and refuses an overpayment. Every outbound path
-- instead read a balance in TypeScript and then wrote — and the Supabase JS
-- client cannot take a row lock, so those paths were not careless, they were
-- unable to be safe in that shape. Two concurrent refunds both read
-- "refundable = ₹5,000" and both inserted ₹5,000: ₹10,000 leaves the hospital
-- against a ₹5,000 entitlement, with no constraint to catch it. A double-click
-- on a slow connection is enough.
--
-- This gives the two genuine balance-check-then-write paths the same shape as
-- record_bill_payment: SECURITY INVOKER, so RLS still decides which rows the
-- caller can see and auth.uid() records who moved the money.
--
-- Verified before writing: 1 credit note and 0 advance refunds exist in the
-- whole database, so these paths are barely exercised and the regression risk
-- is small. Suspicion checked and withdrawn along the way: refunds.ts calls
-- get_next_credit_no() with no arguments while the function signature takes
-- p_tenant_id — that is safe, the argument is `DEFAULT NULL` and the body
-- coalesces to current_tenant_id().

-- ── 1. Credit-note refund ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_credit_note(
  p_bill_id uuid, p_amount numeric, p_method text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_bill       bills%ROWTYPE;
  v_paid       numeric;
  v_credited   numeric;
  v_refundable numeric;
  v_credit_no  text;
  v_id         uuid := gen_random_uuid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a valid refund amount');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  IF v_bill.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill is cancelled');
  END IF;

  -- What the patient actually paid, from `payments` rather than bills.paid.
  -- bills.paid is a cache and the codebase already knows it drifts — see the
  -- "bills.paid can drift" comment in recordSettlement. Inside this lock the
  -- source of truth is cheap to read, so there is no reason to trust the cache.
  SELECT coalesce(sum(amount), 0) INTO v_paid     FROM payments     WHERE bill_id = p_bill_id;
  SELECT coalesce(sum(amount), 0) INTO v_credited FROM credit_notes WHERE bill_id = p_bill_id;

  v_refundable := round(greatest(0, v_paid - v_credited), 2);
  IF p_amount > v_refundable + 0.001 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('Refund exceeds refundable amount (₹%s)', to_char(v_refundable, 'FM999999999990.00')));
  END IF;

  v_credit_no := get_next_credit_no(v_bill.tenant_id);

  INSERT INTO credit_notes (id, tenant_id, bill_id, credit_no, amount, method, reason, refunded_by)
  VALUES (v_id, v_bill.tenant_id, p_bill_id, v_credit_no, round(p_amount, 2),
          p_method, p_reason, auth.uid());

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'credit_no', v_credit_no,
                            'refundable_left', round(v_refundable - p_amount, 2));
END;
$function$;

-- ── 2. Advance refund ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_admission_advance(
  p_admission_id uuid, p_amount numeric, p_method text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_adm_id   uuid;
  v_tenant   uuid;
  v_advance  numeric;
  v_refunded numeric;
  v_applied  numeric;
  v_unused   numeric;
  v_id       uuid := gen_random_uuid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Amount must be greater than zero');
  END IF;

  SELECT id, tenant_id INTO v_adm_id, v_tenant
    FROM admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admission not found');
  END IF;

  -- Same three terms as apply_advance_to_bill (0241), computed inside the lock.
  SELECT coalesce(sum(amount), 0) INTO v_advance
    FROM admission_advances WHERE admission_id = p_admission_id;
  SELECT coalesce(sum(amount), 0) INTO v_refunded
    FROM admission_advance_refunds WHERE admission_id = p_admission_id;
  SELECT coalesce(sum(p.amount), 0) INTO v_applied
    FROM payments p JOIN bills b ON b.id = p.bill_id
   WHERE b.admission_id = p_admission_id AND b.status <> 'cancelled' AND p.method = 'advance';

  v_unused := round(v_advance - v_refunded - v_applied, 2);
  IF p_amount > v_unused + 0.001 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('Cannot refund ₹%s — only ₹%s unused advance available',
             to_char(p_amount, 'FM999999999990.00'), to_char(v_unused, 'FM999999999990.00')));
  END IF;

  INSERT INTO admission_advance_refunds (id, tenant_id, admission_id, amount, method, refunded_by)
  VALUES (v_id, v_tenant, p_admission_id, round(p_amount, 2), p_method, auth.uid());

  RETURN jsonb_build_object('ok', true, 'id', v_id,
                            'unused_left', round(v_unused - p_amount, 2));
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_credit_note(uuid, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_admission_advance(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_credit_note(uuid, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_admission_advance(uuid, numeric, text) TO authenticated, service_role;

-- ── 3. One advance-refund bill per admission, enforced ──────────────────────
-- issueAdvanceRefundBill guards with "no existing refund bill for this
-- admission", which is itself an unlocked read-then-write. It was partly
-- covered by accident: idx_bills_ipd_daily_dedup is unique on
-- (tenant_id, admission_id, billing_date, bill_source), so a same-day duplicate
-- was already refused — but one issued the next day was not. This closes it
-- regardless of date. Cancelled bills are excluded so a failed attempt can be
-- retried, which is what the rollback in that function already intends.
-- Verified: 0 duplicate groups exist, so the index builds.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_one_advance_refund_per_admission
  ON public.bills (tenant_id, admission_id)
  WHERE bill_source = 'advance_refund'
    AND admission_id IS NOT NULL
    AND status <> 'cancelled';
