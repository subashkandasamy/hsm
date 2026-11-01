-- F-31 — an OT consumable cannot be marked billed, so it can be billed twice.
--
-- `generateBill` flips each billed charge's source row to 'billed' through
-- TABLE_MAP, which had 9 entries against the 10 sources `getUnbilledCharges`
-- actually emits. The one missing is `ot_consumable`, and an unmapped source
-- hit `if (!table) continue` — silently, with no error and no log.
--
-- Usually harmless, for an incidental reason rather than a designed one:
-- consumable lines are nested under an `ot_schedules` row that IS filtered on
-- `billing_status = 'unbilled'`, so flipping the parent hides the children.
--
-- The exception is reachable through ordinary UI selection: `selected_refs`
-- lets the cashier bill a consumable WITHOUT its parent OT line. Then
-- `refsBySource` holds only `ot_consumable`, nothing is flipped, the parent
-- stays unbilled — and the same consumable is offered again on the next bill.
--
-- Verified before choosing the fix:
--
--   * `ot_consumables` has NO billing_status column — 9 columns, none of them
--     a billing flag — so there was no way to mark one billed.
--   * `bill_items.ref_id` on an `ot_consumable` line is the **ot_consumables
--     row id** (`ref_id: c.id`), not the schedule id. Mapping the source to
--     `ot_schedules` would therefore have flipped nothing: the ref matches no
--     schedule row, `flipToBilled` would report "Some ot_schedules charges were
--     already billed", and the whole bill would roll back. The column is the
--     fix; re-pointing the map is not.
--
-- The alternative considered and rejected: forbid billing a consumable without
-- its parent OT line. That closes the hole with no migration, but it removes a
-- legitimate workflow — a surgery billed to an insurer while its consumables go
-- to the patient — so it trades a defect for a product restriction. Giving the
-- row the same billing flag every other billable source has is the smaller
-- change in behaviour.

BEGIN;

ALTER TABLE public.ot_consumables
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'unbilled';

-- Matching the constraint style used by the other billable tables.
ALTER TABLE public.ot_consumables
  DROP CONSTRAINT IF EXISTS ot_consumables_billing_status_check;
ALTER TABLE public.ot_consumables
  ADD CONSTRAINT ot_consumables_billing_status_check
  CHECK (billing_status IN ('unbilled', 'billed'));

-- Existing consumables that have ALREADY been billed must not be re-offered.
-- They are identifiable exactly: a non-cancelled bill carries a line whose
-- source is 'ot_consumable' and whose ref_id is the consumable's id.
UPDATE public.ot_consumables c
   SET billing_status = 'billed'
 WHERE c.billing_status = 'unbilled'
   AND EXISTS (
     SELECT 1
       FROM public.bill_items i
       JOIN public.bills b ON b.id = i.bill_id
      WHERE i.source = 'ot_consumable'
        AND i.ref_id = c.id
        AND b.status <> 'cancelled'
   );

-- The preview filters on this column per patient, alongside the parent's own
-- unbilled filter.
CREATE INDEX IF NOT EXISTS idx_ot_consumables_billing_status
  ON public.ot_consumables (tenant_id, billing_status)
  WHERE billing_status = 'unbilled';

COMMIT;
