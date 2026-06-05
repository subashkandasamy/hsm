-- ============================================================
-- HMS Phase 6: Inventory / Stores + Staff / HR
-- ============================================================

-- ===== Inventory / Stores =====

CREATE TABLE IF NOT EXISTS suppliers (
  id             uuid        PRIMARY KEY,
  name           text        NOT NULL,
  contact_person text,
  phone          text,
  email          text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id            uuid    PRIMARY KEY,
  name          text    NOT NULL,
  category      text,
  unit          text,
  qty_in_stock  int     NOT NULL DEFAULT 0,
  reorder_level int     NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_items_category_idx ON inventory_items (category);
CREATE INDEX IF NOT EXISTS inventory_items_low_stock_idx ON inventory_items (qty_in_stock, reorder_level);

-- Race-safe PO number sequence
CREATE TABLE IF NOT EXISTS po_no_seq (
  year    int PRIMARY KEY,
  last_no int NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION get_next_po_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_seq  int;
BEGIN
  INSERT INTO po_no_seq (year, last_no) VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_no = po_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN 'PO-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_po_no() TO authenticated;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id          uuid        PRIMARY KEY,
  po_no       text        UNIQUE NOT NULL,
  supplier_id uuid        REFERENCES suppliers(id),
  status      text        NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','ordered','received','partially_received','cancelled')),
  total       numeric     NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now(),
  received_at timestamptz
);
CREATE INDEX IF NOT EXISTS po_status_idx    ON purchase_orders (status);
CREATE INDEX IF NOT EXISTS po_supplier_idx  ON purchase_orders (supplier_id);

CREATE TABLE IF NOT EXISTS po_items (
  id           uuid    PRIMARY KEY,
  po_id        uuid    NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id      uuid    NOT NULL REFERENCES inventory_items(id),
  qty          int     NOT NULL CHECK (qty > 0),
  unit_price   numeric NOT NULL DEFAULT 0,
  received_qty int     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS po_items_po_idx ON po_items (po_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         uuid        PRIMARY KEY,
  item_id    uuid        NOT NULL REFERENCES inventory_items(id),
  change     int         NOT NULL,
  reason     text        NOT NULL CHECK (reason IN ('purchase','issue','adjustment')),
  ref_id     uuid,
  note       text,
  created_by uuid        REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON stock_movements (item_id);
CREATE INDEX IF NOT EXISTS stock_movements_date_idx ON stock_movements (created_at);

-- ===== Staff / HR =====

CREATE TABLE IF NOT EXISTS staff_profiles (
  profile_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  designation       text,
  joining_date      date,
  address           text,
  emergency_contact text
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id         uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  date       date NOT NULL,
  status     text NOT NULL CHECK (status IN ('present','absent','leave','half_day')),
  shift      text CHECK (shift IN ('morning','evening','night')),
  check_in   time,
  check_out  time,
  UNIQUE (profile_id, date)
);
CREATE INDEX IF NOT EXISTS attendance_profile_date_idx ON staff_attendance (profile_id, date);
CREATE INDEX IF NOT EXISTS attendance_date_idx         ON staff_attendance (date);

CREATE TABLE IF NOT EXISTS duty_roster (
  id         uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  date       date NOT NULL,
  shift      text CHECK (shift IN ('morning','evening','night')),
  ward_id    uuid REFERENCES wards(id),
  UNIQUE (profile_id, date)
);
CREATE INDEX IF NOT EXISTS roster_date_idx    ON duty_roster (date);
CREATE INDEX IF NOT EXISTS roster_profile_idx ON duty_roster (profile_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_no_seq         ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster       ENABLE ROW LEVEL SECURITY;

-- Inventory: read for admin/accountant/nurse; manage for admin/accountant
CREATE POLICY "suppliers_read"  ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_write" ON suppliers FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

CREATE POLICY "inv_items_read"  ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_items_write" ON inventory_items FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

CREATE POLICY "po_no_seq_all"   ON po_no_seq         FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "po_read"  ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_write" ON purchase_orders FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

CREATE POLICY "po_items_read"  ON po_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_items_write" ON po_items FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

CREATE POLICY "stock_movements_read"  ON stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_movements_write" ON stock_movements FOR ALL    TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','accountant')));

-- Staff profiles: admin sees all; user sees own
CREATE POLICY "staff_profiles_read" ON staff_profiles FOR SELECT TO authenticated
  USING (profile_id = auth.uid()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "staff_profiles_write" ON staff_profiles FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Attendance: admin sees all + marks; user sees own
CREATE POLICY "attendance_read" ON staff_attendance FOR SELECT TO authenticated
  USING (profile_id = auth.uid()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "attendance_write" ON staff_attendance FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Roster: admin manages; user reads own
CREATE POLICY "roster_read" ON duty_roster FOR SELECT TO authenticated
  USING (profile_id = auth.uid()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "roster_write" ON duty_roster FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
