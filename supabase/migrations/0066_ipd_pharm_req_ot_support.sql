-- Allow ipd_pharmacy_requests rows created directly from OT (no medication order).
-- Original schema required order_id NOT NULL (FK to ipd_medication_orders).
-- OT consumables are sent to the pharmacy ward without going through a medication order.

ALTER TABLE ipd_pharmacy_requests
  ALTER COLUMN order_id DROP NOT NULL;
