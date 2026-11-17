-- Day-to-day expenses: what the hospital paid out, with the bill or without.
--
-- Uyirly recorded only money coming in. The electricity bill, the plumber, tea
-- for the night staff and the auto fare to the blood bank were kept in a
-- notebook, so the Cash Book's expected cash never matched the drawer and the
-- owner saw income with no outgoings beside it.
--
-- Who: whoever has billing access — admin, accountant, receptionist, and any
-- role given "Billing & cash book" in Roles & access (0271) — may record and
-- see expenses. Cancelling one is admin and accountant only (billing:manage),
-- which no grant can give. An expense is never deleted: a cancelled one stays,
-- with who cancelled it and why, and drops out of every total.
--
-- The bill: a photo or PDF in the `documents` bucket under
-- tenants/<tenant>/expenses/, moved to the hospital's own computer like any
-- other upload once it keeps uploads (0275 — hence the new kind below). An
-- expense with no bill says why ("tea for staff").
CREATE TABLE IF NOT EXISTS expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_date    date NOT NULL,
  category        text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  amount          numeric(12,2) NOT NULL CHECK (amount > 0 AND amount < 10000000),
  paid_to         text CHECK (paid_to IS NULL OR length(paid_to) <= 120),
  -- How it was paid, named as payments are; 'bank_transfer' covers cheques too. Cash ones come out
  -- of the recorder's Cash Book and shift.
  method          text NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'bank_transfer')),
  reference       text CHECK (reference IS NULL OR length(reference) <= 80),
  notes           text CHECK (notes IS NULL OR length(notes) <= 500),
  bill_path       text,
  no_bill_reason  text CHECK (no_bill_reason IS NULL OR length(btrim(no_bill_reason)) BETWEEN 1 AND 200),
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  cancelled_at    timestamptz,
  cancelled_by    uuid REFERENCES profiles(id),
  cancel_reason   text,
  -- A bill, or a reason there is none — never both, never neither.
  CONSTRAINT expenses_bill_or_reason CHECK ((bill_path IS NULL) <> (no_bill_reason IS NULL)),
  CONSTRAINT expenses_cancel_complete CHECK (
    (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
    OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND length(btrim(cancel_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS expenses_tenant_date_idx ON expenses (tenant_id, expense_date DESC);
-- The Cash Book reads a cashier's money out by when it was recorded.
CREATE INDEX IF NOT EXISTS expenses_tenant_created_idx ON expenses (tenant_id, created_by, created_at);

COMMENT ON TABLE expenses IS
  'Money the hospital paid out (0308). Never deleted: cancelled rows keep who and why and leave every total.';

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Billing roles, plus a role an admin granted "Billing & cash book" (0271).
DROP POLICY IF EXISTS expenses_billing_read ON expenses;
CREATE POLICY expenses_billing_read ON expenses FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id())
         AND ((SELECT current_active_role()) IN ('admin', 'accountant', 'receptionist')
              OR (SELECT role_has_access(ARRAY['billing']))));

DROP POLICY IF EXISTS expenses_billing_insert ON expenses;
CREATE POLICY expenses_billing_insert ON expenses FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id())
              AND created_by = auth.uid()
              AND cancelled_at IS NULL
              AND ((SELECT current_active_role()) IN ('admin', 'accountant', 'receptionist')
                   OR (SELECT role_has_access(ARRAY['billing']))));

-- Only cancelling changes a row, and only admin or accountant may.
DROP POLICY IF EXISTS expenses_manage_update ON expenses;
CREATE POLICY expenses_manage_update ON expenses FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'accountant'))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'accountant'));

-- A money record: the only change ever made is cancelling it, once.
CREATE OR REPLACE FUNCTION public.expenses_only_cancel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This expense is already cancelled';
  END IF;
  IF (NEW.tenant_id, NEW.expense_date, NEW.category, NEW.amount, NEW.paid_to, NEW.method, NEW.reference,
      NEW.notes, NEW.bill_path, NEW.no_bill_reason, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.tenant_id, OLD.expense_date, OLD.category, OLD.amount, OLD.paid_to, OLD.method, OLD.reference,
      OLD.notes, OLD.bill_path, OLD.no_bill_reason, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'An expense cannot be changed, only cancelled';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS expenses_only_cancel ON expenses;
CREATE TRIGGER expenses_only_cancel BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_only_cancel();

REVOKE ALL ON expenses FROM anon;
GRANT SELECT, INSERT, UPDATE ON expenses TO authenticated;

-- Expense bills move to the hospital computer like other uploads (0275).
ALTER TABLE local_files DROP CONSTRAINT IF EXISTS local_files_kind_check;
ALTER TABLE local_files ADD CONSTRAINT local_files_kind_check
  CHECK (kind = ANY (ARRAY['patient_document', 'ipd_declaration', 'radiology_image', 'expense_bill']));
