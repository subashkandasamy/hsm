-- =====================================================================
-- 0090_icu_bed_type_and_stays.sql
-- IPD P0.2.1 hardening — make critical care bed-driven and transient:
--  * ward_room_types.is_icu designates ICU beds/wards
--  * icu_stays records each ICU episode (entry/exit) within an admission
--  * 'icu' becomes its own bill_source / bill_items.source so ICU + ventilator
--    charges bill independently (fixes the same-day 'bed' suppression edge)
-- =====================================================================

ALTER TABLE ward_room_types ADD COLUMN IF NOT EXISTS is_icu BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS icu_stays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  bed_id       UUID,
  ward_id      UUID,
  entered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at    TIMESTAMPTZ,
  entered_by   UUID REFERENCES profiles(id),
  exited_by    UUID REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_icu_stays_open ON icu_stays (admission_id) WHERE exited_at IS NULL;

ALTER TABLE icu_stays ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY icu_stays_tenant_all ON icu_stays
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow 'icu' as a bill source (independent daily bill for ICU + ventilator)
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated', 'advance_refund', 'appointment_refund',
    'ot', 'blood', 'consultation', 'icu'
  ));

ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_source_check;
ALTER TABLE bill_items ADD CONSTRAINT bill_items_source_check
  CHECK (source IN (
    'consultation', 'bed', 'lab', 'radiology', 'pharmacy', 'ipd_pharmacy',
    'ot', 'ot_consumable', 'blood', 'manual', 'dental', 'pharmacy_sale_item',
    'nursing', 'nursing_morning', 'nursing_night', 'icu'
  ));

NOTIFY pgrst, 'reload schema';
