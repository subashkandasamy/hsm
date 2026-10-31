-- F-28. Applying an advance to a bill was the one money path that computed the
-- result by hand instead of going through a locking RPC:
--
--   const newPaid = bill.paid + applyAmount        // bill.paid read 23 lines earlier
--   await supabase.from('bills').update({ paid: newPaid, ... })
--
-- A cashier recording cash through record_bill_payment — which IS row-locked —
-- between that read and that write had their payment silently overwritten: the
-- money stayed in `payments` but `bills.paid` no longer reflected it. The
-- codebase already knew this was happening; recordSettlement carries the
-- comment "bills.paid can drift" and works around it by recomputing from
-- `payments`. One part of the code was compensating for a defect another part
-- was creating.
--
-- There were three further problems, two of which the review had not found:
--
--  * `unusedAdvance` is DERIVED from rows, so locking the bill is not enough.
--    Two applies to two DIFFERENT bills of the same admission could each read
--    the same unused balance and both draw it. The contended resource is the
--    admission, so that is what this locks.
--
--  * The bill was never checked to belong to the admission. Both ids arrive
--    from the browser (BillingClient.tsx:297 → a server action, i.e. an HTTP
--    endpoint), so one admission's advance could be applied to another
--    admission's bill, or to an OPD bill with no admission at all. RLS still
--    confined it to one hospital, so this was intra-tenant accounting
--    corruption rather than a leak — but it was reachable by anyone who could
--    open the billing page.
--
--  * generateBill (billing.ts:540) carried a SECOND, independent copy of the
--    same advance arithmetic, which wrote `paid: applyAmount` by assignment
--    rather than addition. Correct only because a freshly created bill has
--    paid = 0. Both call sites now share this function, so the arithmetic
--    cannot drift between them.
--
-- SECURITY INVOKER, like record_bill_payment: it runs as the caller, so RLS
-- supplies tenant confinement and auth.uid() identifies who applied the money.

CREATE OR REPLACE FUNCTION public.apply_advance_to_bill(
  p_bill_id uuid, p_admission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_bill     bills%ROWTYPE;
  v_adm_id   uuid;
  v_advance  numeric;
  v_refunded numeric;
  v_applied  numeric;
  v_unused   numeric;
  v_paid     numeric;
  v_balance  numeric;
  v_apply    numeric;
  v_new_paid numeric;
  v_status   text;
BEGIN
  -- Admission first, then bill, always in that order, so two concurrent
  -- callers cannot deadlock against each other.
  SELECT id INTO v_adm_id FROM admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admission not found');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;

  IF v_bill.admission_id IS DISTINCT FROM p_admission_id THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'That bill does not belong to this admission');
  END IF;

  IF v_bill.status IN ('paid', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill is already paid or cancelled');
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_advance
    FROM admission_advances WHERE admission_id = p_admission_id;
  SELECT coalesce(sum(amount), 0) INTO v_refunded
    FROM admission_advance_refunds WHERE admission_id = p_admission_id;

  -- Advance already drawn against this admission. Cancelled bills are excluded,
  -- which matches getAdmissionFinancials: cancelling a bill releases the
  -- advance it had consumed.
  SELECT coalesce(sum(p.amount), 0) INTO v_applied
    FROM payments p
    JOIN bills b ON b.id = p.bill_id
   WHERE b.admission_id = p_admission_id
     AND b.status <> 'cancelled'
     AND p.method = 'advance';

  v_unused := round(v_advance - v_refunded - v_applied, 2);
  IF v_unused <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'No unused advance balance available for this admission');
  END IF;

  -- Balance from `payments`, never from bills.paid, which is the column that
  -- drifts.
  SELECT coalesce(sum(amount), 0) INTO v_paid FROM payments WHERE bill_id = p_bill_id;
  v_balance := round(v_bill.total - v_paid, 2);
  IF v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill is already fully paid');
  END IF;

  v_apply := round(least(v_unused, v_balance), 2);

  INSERT INTO payments (id, tenant_id, bill_id, amount, method, received_by)
  VALUES (gen_random_uuid(), v_bill.tenant_id, p_bill_id, v_apply, 'advance', auth.uid());

  v_new_paid := round(v_paid + v_apply, 2);
  v_status   := CASE WHEN v_new_paid >= v_bill.total THEN 'paid' ELSE 'partial' END;
  UPDATE bills SET paid = v_new_paid, status = v_status WHERE id = p_bill_id;

  RETURN jsonb_build_object('ok', true, 'applied', v_apply,
                            'paid', v_new_paid, 'status', v_status,
                            'unused', round(v_unused - v_apply, 2));
END;
$function$;

-- Same grants as record_bill_payment: authenticated only, never anon.
REVOKE ALL ON FUNCTION public.apply_advance_to_bill(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_advance_to_bill(uuid, uuid) TO authenticated, service_role;
