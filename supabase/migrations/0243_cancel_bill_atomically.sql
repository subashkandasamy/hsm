-- F-33. cancelBill carried a comment describing a bug it was written to fix:
--
--   "Cancelling twice is not a no-op… The second pass reverts the same charges
--    to 'unbilled' again — but by then a replacement bill may legitimately own
--    them, and it has just had them pulled out from under it."
--
-- The guard added for it was in the wrong order:
--
--   read status                            <- guard read here
--   DELETE advance payments                <- destructive
--   revert charges to 'unbilled'           <- destructive
--   UPDATE bills … .neq('status','cancelled')  <- conditional, atomic, LAST
--
-- Two concurrent cancels both passed the status read, both ran the destructive
-- steps, and only then did one lose the conditional update — which returns
-- SUCCESS, because a zero-row update sets no error. The charges had already
-- been pulled back a second time. The conditional update protected the status
-- column and not the reversion that preceded it.
--
-- Reordering alone cannot fix it. Claim-then-revert simply moves the failure:
-- if the revert then fails, the bill is cancelled while its charges stay
-- 'billed' against a bill that no longer exists, never appearing on the
-- unbilled list again — which is the exact outcome the comment at the
-- bill_items read calls out as the thing to avoid. Only one transaction gets
-- both, so this is an RPC.
--
-- SECURITY INVOKER, like record_bill_payment: RLS decides which rows the caller
-- can touch, and the same policies that allow the current TypeScript updates
-- allow these.

CREATE OR REPLACE FUNCTION public.cancel_bill(p_bill_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_bill   bills%ROWTYPE;
  v_cash   numeric;
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  -- The lock plus the status test inside it is the whole fix: the second of two
  -- concurrent cancels waits here, then sees 'cancelled' and returns having
  -- changed nothing.
  SELECT * INTO v_bill FROM bills
   WHERE id = p_bill_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  IF v_bill.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This bill is already cancelled');
  END IF;

  -- Real money in means this is a credit-note job, not a cancellation.
  SELECT coalesce(sum(amount), 0) INTO v_cash
    FROM payments WHERE bill_id = p_bill_id AND method <> 'advance';
  IF v_cash > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot cancel a bill that has payments');
  END IF;

  -- Advance auto-payments are deleted, not reversed. Keeping them as a
  -- reversing entry would be the better accounting form, but it cannot be done
  -- here alone: accounts.ts:148 and lib/billing/collections.ts:46 sum payments
  -- by tenant with no bill-status filter, so retained rows would overstate the
  -- day's collections. See the audit note on F-33 — that is a reporting change
  -- to decide, not a side effect to introduce here.
  DELETE FROM payments WHERE bill_id = p_bill_id AND method = 'advance';

  -- Revert each charge to unbilled. One statement per source, mirroring
  -- generateBill's TABLE_MAP; verify:bill-sources asserts the two agree, which
  -- nothing did before. 'manual', 'nursing', 'icu' and daily 'bed' auto-bill
  -- lines carry no source row to revert (icu and nursing have no
  -- billing_status column at all, and every icu line has a null ref_id).
  UPDATE visits SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'consultation' AND ref_id IS NOT NULL);
  UPDATE admissions SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'bed' AND ref_id IS NOT NULL);
  UPDATE lab_orders SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'lab' AND ref_id IS NOT NULL);
  UPDATE radiology_orders SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'radiology' AND ref_id IS NOT NULL);
  UPDATE dispenses SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'pharmacy' AND ref_id IS NOT NULL);
  UPDATE ipd_pharmacy_requests SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'ipd_pharmacy' AND ref_id IS NOT NULL);
  UPDATE ot_schedules SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'ot' AND ref_id IS NOT NULL);
  UPDATE blood_issues SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'blood' AND ref_id IS NOT NULL);
  UPDATE dental_treatments SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'dental' AND ref_id IS NOT NULL);

  UPDATE bills SET status = 'cancelled' WHERE id = p_bill_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_bill(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_bill(uuid) TO authenticated, service_role;
