-- OT surgeries auto-billed onto an IPD bill were never marked billed ────────────
-- scheduleSurgery added the surgery to the admission's OT bill but left
-- ot_schedules.billing_status = 'unbilled'. The Bill Builder lists completed,
-- unbilled surgeries, and its double-bill guard checks that same flag, so the
-- surgery could be billed a second time. The app now bills surgeries at
-- completion and sets the flag; this corrects existing rows.

UPDATE ot_schedules s
SET billing_status = 'billed'
WHERE s.billing_status = 'unbilled'
  AND EXISTS (
    SELECT 1
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE bi.source = 'ot'
      AND bi.ref_id = s.id
      AND b.status <> 'cancelled'
  );
