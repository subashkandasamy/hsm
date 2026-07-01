-- Migration 0031: Enable RLS on partition child tables & fix po_no_seq
--
-- Problem 1: po_no_seq has USING(true) — any authenticated user can read/write
-- all tenants' PO sequences directly. get_next_po_no() is SECURITY DEFINER so
-- it bypasses RLS; direct table access should be denied (same as bill_no_seq).
--
-- Problem 2: Partition child tables (appointments, visits, audit_logs, bill_items,
-- lab_order_items) have RLS completely disabled. Queries through the parent table
-- use the parent's RLS correctly, but a direct query to e.g. visits_y2026m07
-- returns all tenants' data unfiltered. Enabling RLS with no policies makes
-- direct partition access default-deny while parent-table queries are unaffected.

-- ── po_no_seq: deny direct access (get_next_po_no RPC is SECURITY DEFINER) ────
drop policy if exists "po_no_seq_all" on po_no_seq;

-- ── partition tables: enable RLS (default-deny on direct access) ───────────────
alter table if exists appointments_y2026m04     enable row level security;
alter table if exists appointments_y2026m05     enable row level security;
alter table if exists appointments_y2026m06     enable row level security;
alter table if exists appointments_y2026m07     enable row level security;
alter table if exists appointments_y2026m08     enable row level security;

alter table if exists audit_logs_y2026m04       enable row level security;
alter table if exists audit_logs_y2026m05       enable row level security;
alter table if exists audit_logs_y2026m06       enable row level security;
alter table if exists audit_logs_y2026m07       enable row level security;
alter table if exists audit_logs_y2026m08       enable row level security;

alter table if exists bill_items_y2026m04       enable row level security;
alter table if exists bill_items_y2026m05       enable row level security;
alter table if exists bill_items_y2026m06       enable row level security;
alter table if exists bill_items_y2026m07       enable row level security;
alter table if exists bill_items_y2026m08       enable row level security;

alter table if exists lab_order_items_y2026m04  enable row level security;
alter table if exists lab_order_items_y2026m05  enable row level security;
alter table if exists lab_order_items_y2026m06  enable row level security;
alter table if exists lab_order_items_y2026m07  enable row level security;
alter table if exists lab_order_items_y2026m08  enable row level security;

alter table if exists visits_y2026m04           enable row level security;
alter table if exists visits_y2026m05           enable row level security;
alter table if exists visits_y2026m06           enable row level security;
alter table if exists visits_y2026m07           enable row level security;
alter table if exists visits_y2026m08           enable row level security;
