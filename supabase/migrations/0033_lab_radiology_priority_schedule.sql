-- Add priority and scheduled_for to lab and radiology orders
-- priority: 'stat' (urgent) | 'routine' (default, collected in regular rounds)
-- scheduled_for: date the sample should be collected / scan performed

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS priority      text NOT NULL DEFAULT 'routine',
  ADD COLUMN IF NOT EXISTS scheduled_for date;

ALTER TABLE radiology_orders
  ADD COLUMN IF NOT EXISTS priority      text NOT NULL DEFAULT 'routine',
  ADD COLUMN IF NOT EXISTS scheduled_for date;
