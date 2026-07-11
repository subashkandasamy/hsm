-- Room type catalog (per tenant, managed from Ward Board)
-- Each type defines: name, daily rate, and whether rooms have multiple beds or are private single rooms
CREATE TABLE IF NOT EXISTS ward_room_types (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  daily_rate    NUMERIC     NOT NULL DEFAULT 0,
  is_multi_bed  BOOLEAN     NOT NULL DEFAULT false,  -- false = private single room; true = general ward with numbered beds
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ward_room_types_tenant ON ward_room_types(tenant_id);

-- These columns may be missing if the table was created by an earlier partial run of this migration
ALTER TABLE ward_room_types ADD COLUMN IF NOT EXISTS daily_rate   NUMERIC  NOT NULL DEFAULT 0;
ALTER TABLE ward_room_types ADD COLUMN IF NOT EXISTS is_multi_bed BOOLEAN  NOT NULL DEFAULT false;

ALTER TABLE ward_room_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_ward_room_types_select" ON ward_room_types;
DROP POLICY IF EXISTS "tenant_ward_room_types_insert" ON ward_room_types;
DROP POLICY IF EXISTS "tenant_ward_room_types_update" ON ward_room_types;
DROP POLICY IF EXISTS "tenant_ward_room_types_delete" ON ward_room_types;
CREATE POLICY "tenant_ward_room_types_select" ON ward_room_types FOR SELECT USING (tenant_id = current_tenant_id()::text AND auth.role() = 'authenticated');
CREATE POLICY "tenant_ward_room_types_insert" ON ward_room_types FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::text AND exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id::uuid = current_tenant_id()));
CREATE POLICY "tenant_ward_room_types_update" ON ward_room_types FOR UPDATE USING (tenant_id = current_tenant_id()::text AND exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id::uuid = current_tenant_id()));
CREATE POLICY "tenant_ward_room_types_delete" ON ward_room_types FOR DELETE USING (tenant_id = current_tenant_id()::text AND exists (select 1 from profiles where id = auth.uid() and role = 'admin' and tenant_id::uuid = current_tenant_id()));

-- Link individual rooms/wards to a room type
-- Floor and block are free-text location labels (e.g. "1st Floor", "Block A")
-- daily_rate on wards is kept as a per-room override; NULL means use the room_type rate
ALTER TABLE wards ADD COLUMN IF NOT EXISTS room_type_id UUID REFERENCES ward_room_types(id) ON DELETE SET NULL;
ALTER TABLE wards ADD COLUMN IF NOT EXISTS floor        TEXT;
ALTER TABLE wards ADD COLUMN IF NOT EXISTS block        TEXT;

CREATE INDEX IF NOT EXISTS idx_wards_room_type ON wards(room_type_id) WHERE room_type_id IS NOT NULL;
