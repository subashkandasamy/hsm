-- Short, scanner-friendly numbers for lab samples and admissions ─────────────
-- Sample labels encoded the 36-character lab order UUID. That is far too long
-- for a Code 128 barcode on a 50 mm tube label (bars become thinner than a
-- 203 dpi label printer can print) and means nothing to lab staff reading it.
-- Wristbands had no admission number at all.
--
--   lab_orders.accession_no  YYMMDD + 4-digit daily counter, e.g. 2609170012
--                            (IST day, per tenant; all digits so Code 128
--                            packs it densely)
--   admissions.ip_no         IP-2026-00012 (IST year, per tenant)
--
-- Both are assigned by BEFORE INSERT triggers so every code path that creates
-- an order or admission gets one. Existing rows are backfilled in date order.

-- ── Lab accession number ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_accession_seq (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day       DATE NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
-- No policies: only the SECURITY DEFINER trigger below touches it.
ALTER TABLE lab_accession_seq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lab_accession_seq FROM anon, authenticated;

ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS accession_no TEXT;

WITH numbered AS (
  SELECT id, tenant_id,
         (ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
         row_number() OVER (
           PARTITION BY tenant_id, (ordered_at AT TIME ZONE 'Asia/Kolkata')::date
           ORDER BY ordered_at, id
         ) AS rn
  FROM lab_orders
  WHERE accession_no IS NULL
)
UPDATE lab_orders o
SET accession_no = to_char(n.d, 'YYMMDD') || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE o.id = n.id;

INSERT INTO lab_accession_seq (tenant_id, day, last_no)
SELECT tenant_id, (ordered_at AT TIME ZONE 'Asia/Kolkata')::date, count(*)
FROM lab_orders
GROUP BY 1, 2
ON CONFLICT (tenant_id, day) DO UPDATE SET last_no = GREATEST(lab_accession_seq.last_no, EXCLUDED.last_no);

CREATE OR REPLACE FUNCTION set_lab_accession_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (COALESCE(NEW.ordered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_seq int;
BEGIN
  IF NEW.accession_no IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO lab_accession_seq (tenant_id, day, last_no) VALUES (NEW.tenant_id, v_day, 1)
  ON CONFLICT (tenant_id, day) DO UPDATE SET last_no = lab_accession_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  NEW.accession_no := to_char(v_day, 'YYMMDD') || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION set_lab_accession_no() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lab_orders_accession_no ON lab_orders;
CREATE TRIGGER trg_lab_orders_accession_no
  BEFORE INSERT ON lab_orders
  FOR EACH ROW EXECUTE FUNCTION set_lab_accession_no();

ALTER TABLE lab_orders ALTER COLUMN accession_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lab_orders_tenant_accession_no_key ON lab_orders (tenant_id, accession_no);

-- ── Admission (IP) number ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_no_seq (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);
ALTER TABLE ip_no_seq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ip_no_seq FROM anon, authenticated;

ALTER TABLE admissions ADD COLUMN IF NOT EXISTS ip_no TEXT;

WITH numbered AS (
  SELECT id, tenant_id,
         extract(year FROM (admitted_at AT TIME ZONE 'Asia/Kolkata'))::int AS y,
         row_number() OVER (
           PARTITION BY tenant_id, extract(year FROM (admitted_at AT TIME ZONE 'Asia/Kolkata'))
           ORDER BY admitted_at, id
         ) AS rn
  FROM admissions
  WHERE ip_no IS NULL
)
UPDATE admissions a
SET ip_no = 'IP-' || n.y || '-' || lpad(n.rn::text, 5, '0')
FROM numbered n
WHERE a.id = n.id;

INSERT INTO ip_no_seq (tenant_id, year, last_no)
SELECT tenant_id, extract(year FROM (admitted_at AT TIME ZONE 'Asia/Kolkata'))::int, count(*)
FROM admissions
GROUP BY 1, 2
ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = GREATEST(ip_no_seq.last_no, EXCLUDED.last_no);

CREATE OR REPLACE FUNCTION set_admission_ip_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := extract(year FROM (COALESCE(NEW.admitted_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int;
  v_seq  int;
BEGIN
  IF NEW.ip_no IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO ip_no_seq (tenant_id, year, last_no) VALUES (NEW.tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = ip_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  NEW.ip_no := 'IP-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION set_admission_ip_no() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_admissions_ip_no ON admissions;
CREATE TRIGGER trg_admissions_ip_no
  BEFORE INSERT ON admissions
  FOR EACH ROW EXECUTE FUNCTION set_admission_ip_no();

ALTER TABLE admissions ALTER COLUMN ip_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admissions_tenant_ip_no_key ON admissions (tenant_id, ip_no);

NOTIFY pgrst, 'reload schema';
