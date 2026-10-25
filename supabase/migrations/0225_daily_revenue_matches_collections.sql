-- One definition of "money collected", including in the view.
--
-- mv_daily_revenue_by_tenant summed every row of `payments`, method='advance'
-- among them. lib/billing/collections.ts excludes those on purpose: applying a
-- deposit already collected is not money arriving a second time. It also adds
-- the deposits themselves and subtracts refunds and credit notes, none of
-- which this view knew about.
--
-- Nothing read it, so nothing was wrong on a screen. But it sat in the
-- database looking fast and authoritative next to a dashboard computing the
-- same figure live, and the first thing to reach for it for speed would have
-- made the dashboard and the Accounts page disagree — the one failure that
-- cannot be undone by fixing it afterwards, because a hospital that has been
-- shown two answers stops believing either.
--
-- So it is reconciled rather than dropped: a daily series is exactly what a
-- trend line wants, and now it is the same series the rest of the product
-- means. If collections.ts ever changes, this has to change with it.

DROP MATERIALIZED VIEW IF EXISTS mv_daily_revenue_by_tenant;

CREATE MATERIALIZED VIEW mv_daily_revenue_by_tenant AS
SELECT tenant_id, day, (sum(amount))::numeric(14,2) AS total_amount
FROM (
  -- Real payments against bills. Not 'advance': that is a deposit being
  -- applied, and it was counted on the day it was taken.
  SELECT tenant_id,
         ((received_at AT TIME ZONE 'Asia/Kolkata'))::date AS day,
         amount
    FROM payments
   WHERE method <> 'advance'
  UNION ALL
  -- Deposits, on the day they were taken.
  SELECT tenant_id, ((received_at AT TIME ZONE 'Asia/Kolkata'))::date, amount
    FROM admission_advances
  UNION ALL
  -- Money paid back out.
  SELECT tenant_id, ((refunded_at AT TIME ZONE 'Asia/Kolkata'))::date, -amount
    FROM admission_advance_refunds
  UNION ALL
  SELECT tenant_id, ((created_at AT TIME ZONE 'Asia/Kolkata'))::date, -amount
    FROM credit_notes
) AS movements
GROUP BY tenant_id, day;

CREATE UNIQUE INDEX mv_daily_revenue_pk ON mv_daily_revenue_by_tenant (tenant_id, day);

COMMENT ON MATERIALIZED VIEW mv_daily_revenue_by_tenant IS
  'Net cash in per IST day, by the same definition as lib/billing/collections.ts: bill payments excluding advance applications, plus advance deposits, less advance refunds and credit notes. Change both together.';
