-- A regression I introduced in F-31, caught by the detector written for F-33.
--
-- F-31 added `ot_consumable -> ot_consumables` to `generateBill`'s TABLE_MAP,
-- because a consumable billed on its own was never marked billed and could be
-- billed twice. `0249` gave the table its `billing_status` column.
--
-- `cancel_bill` was not updated to match, so it reverted nine sources out of
-- ten. `npm run verify:bill-sources` says so in one line:
--
--   TABLE_MAP (generateBill, TypeScript) : 10 sources
--   cancel_bill (0243)                   :  9 sources
--   FAIL  source 'ot_consumable' is billed into 'ot_consumables'
--         but cancel_bill never reverts it
--
-- The consequence is the exact mirror of the defect F-31 fixed. Bill a surgery
-- with consumables, then cancel the bill: the surgery goes back to unbilled and
-- the consumables stay `billed` **permanently**. They vanish from the unbilled
-- list and can never be invoiced again — money the hospital has spent and
-- cannot charge for. F-31 was "billed twice"; this is "billed never".
--
-- 0 rows are affected today (no `ot_consumable` line has ever been billed), so
-- this is closed before it can happen rather than after.
--
-- The detector earning its keep on a fix rather than on the original defect is
-- now the third time in this audit: F-77 (0253 applied and did nothing), F-78
-- (0238's sweep missed half), and this. The comment inside cancel_bill already
-- said "verify:bill-sources asserts the two agree, which nothing did before" —
-- and then it caught the author of that sentence.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_bill(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
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
  -- Added here. An OT consumable is billable on its own (F-31), so it has to be
  -- revertible on its own too.
  UPDATE ot_consumables SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'ot_consumable' AND ref_id IS NOT NULL);
  UPDATE blood_issues SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'blood' AND ref_id IS NOT NULL);
  UPDATE dental_treatments SET billing_status = 'unbilled' WHERE tenant_id = v_tenant AND id IN (
    SELECT ref_id FROM bill_items WHERE bill_id = p_bill_id AND source = 'dental' AND ref_id IS NOT NULL);

  UPDATE bills SET status = 'cancelled' WHERE id = p_bill_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- CREATE OR REPLACE keeps the ACL, so 0259's posture survives. Restated anyway,
-- because F-77 was exactly this assumption going unstated.
REVOKE ALL   ON FUNCTION public.cancel_bill(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_bill(uuid) TO authenticated, service_role;

COMMIT;
