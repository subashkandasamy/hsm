-- Report V counted the wrong things, and the MTP draft opened at the wrong moment.
--
-- Report V (get_mtp_drug_status) — the monthly stock account Tamil Nadu requires
-- for abortion drugs: opening + purchased − used = closing. "Used" was summed
-- from pharmacy_sale_items and ipd_pharmacy_requests. Medicine actually leaves
-- the shelf by three routes, and that missed one and miscounted another:
--
--   route                    sale_items   dispenses   ipd_requests   Report V counted
--   counter sale, in cart    yes          -           -              YES — still on the shelf
--   counter sale, fulfilled  yes          yes         -              once, dated by the CART
--   prescription dispense    -            yes         -              NO
--   ward (IPD) request       -            -           yes            yes
--
-- pharmacy_sale_items rows are written when an item goes into the cart
-- (addSaleItem); stock leaves only at fulfillSale, which calls dispense_drug
-- and writes a `dispenses` row. A fulfilled sale cannot be cancelled and
-- nothing deletes a dispense, so `dispenses` is a permanent record of every
-- handover through dispense_drug. Adding it on top of sale_items would have
-- counted every counter sale twice; it replaces them instead.
--
-- Under-counted use makes the closing stock read higher than the shelf — on
-- this register, drugs that appear to have gone missing.
--
-- Usage is also now dated in IST. `timestamptz::date` uses the database's UTC
-- clock, so a drug handed over at 1 a.m. IST on the 1st fell into the previous
-- month's return. The H1 register (0168) already dates supply this way.
--
-- The MTP draft (0210) exists so the drug count and the case count agree. It
-- fired AFTER INSERT ON pharmacy_sale_items — when a tracked drug went into a
-- cart, issuing a statutory serial number for a termination nobody had yet
-- been given the drug for, and never for a prescription dispense or a ward
-- request. It now fires on the same handovers Report V counts.
--
-- No data changes: no counter sales and no MTP records exist in production, and
-- the one tracked drug (the demo hospital's) has no dispense yet.

CREATE OR REPLACE FUNCTION get_mtp_drug_status(p_month text, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  tracked_id     uuid,
  report_label   text,
  opening_qty    int,
  purchased_qty  int,
  invoice_refs   text,
  suppliers      text,
  total_qty      int,
  used_qty       int,
  closing_qty    int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_start  date := (p_month || '-01')::date;
  v_end    date := ((p_month || '-01')::date + interval '1 month')::date;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_mtp_drug_status: tenant_id could not be resolved';
  END IF;

  RETURN QUERY
  WITH tracked AS (
    SELECT t.id, t.drug_id, t.drug_master_id, t.report_label, t.opening_qty, t.opening_as_of
      FROM mtp_tracked_drugs t
     WHERE t.tenant_id = v_tenant AND t.is_active
  ),
  -- One join condition, written once: a batch belongs to a tracked drug if it
  -- carries either reference. Repeating this per CTE is how the two halves
  -- would drift apart.
  batches AS (
    SELECT tk.id AS tracked_id, b.qty_received, b.purchase_date,
           b.supplier_invoice_no, b.supplier_name, tk.opening_as_of
      FROM drug_batches b
      JOIN tracked tk
        ON (tk.drug_master_id IS NOT NULL AND b.drug_master_id = tk.drug_master_id)
        OR (tk.drug_id        IS NOT NULL AND b.drug_id        = tk.drug_id)
     WHERE b.tenant_id = v_tenant
  ),
  -- Usage is what actually left the shelf, from the two places that record a
  -- handover: every dispense_drug call writes a `dispenses` row (prescription
  -- dispenses, FULFILLED counter sales, vaccines), and a ward request is marked
  -- dispensed on `ipd_pharmacy_requests`, which writes no dispense. Counter
  -- sales are NOT read from pharmacy_sale_items: those rows are written when an
  -- item goes into the cart, so they counted drugs still on the shelf, and the
  -- same units again once fulfilled wrote their dispense.
  movements AS (
    SELECT tk.id AS tracked_id, d.qty, (d.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date AS on_date, tk.opening_as_of
      FROM dispenses d
      JOIN tracked tk
        ON (tk.drug_master_id IS NOT NULL AND d.drug_master_id = tk.drug_master_id)
        OR (tk.drug_id        IS NOT NULL AND d.drug_id        = tk.drug_id)
     WHERE d.tenant_id = v_tenant AND d.dispensed_at IS NOT NULL
    UNION ALL
    SELECT tk.id, r.quantity, (r.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date, tk.opening_as_of
      FROM ipd_pharmacy_requests r
      JOIN tracked tk
        ON (tk.drug_master_id IS NOT NULL AND r.drug_master_id = tk.drug_master_id)
        OR (tk.drug_id        IS NOT NULL AND r.drug_id        = tk.drug_id)
     WHERE r.tenant_id = v_tenant AND r.dispensed_at IS NOT NULL
  ),
  pb AS (SELECT b.tracked_id, SUM(b.qty_received)::int q FROM batches b
          WHERE b.purchase_date >= b.opening_as_of AND b.purchase_date < v_start GROUP BY 1),
  pm AS (SELECT b.tracked_id, SUM(b.qty_received)::int q,
                string_agg(DISTINCT NULLIF(b.supplier_invoice_no,''), ', ') inv,
                string_agg(DISTINCT NULLIF(b.supplier_name,''), ', ') sup
           FROM batches b
          WHERE b.purchase_date >= v_start AND b.purchase_date < v_end GROUP BY 1),
  ub AS (SELECT m.tracked_id, SUM(m.qty)::int q FROM movements m
          WHERE m.on_date >= m.opening_as_of AND m.on_date < v_start GROUP BY 1),
  um AS (SELECT m.tracked_id, SUM(m.qty)::int q FROM movements m
          WHERE m.on_date >= v_start AND m.on_date < v_end GROUP BY 1)
  SELECT
    tk.id, tk.report_label,
    (tk.opening_qty + COALESCE(pb.q,0) - COALESCE(ub.q,0))::int,
    COALESCE(pm.q,0)::int,
    COALESCE(pm.inv,'-'), COALESCE(pm.sup,'-'),
    (tk.opening_qty + COALESCE(pb.q,0) - COALESCE(ub.q,0) + COALESCE(pm.q,0))::int,
    COALESCE(um.q,0)::int,
    (tk.opening_qty + COALESCE(pb.q,0) - COALESCE(ub.q,0) + COALESCE(pm.q,0) - COALESCE(um.q,0))::int
  FROM tracked tk
  LEFT JOIN pb ON pb.tracked_id = tk.id
  LEFT JOIN pm ON pm.tracked_id = tk.id
  LEFT JOIN ub ON ub.tracked_id = tk.id
  LEFT JOIN um ON um.tracked_id = tk.id
  ORDER BY tk.report_label;
END $$;

COMMENT ON FUNCTION get_mtp_drug_status(text, uuid) IS
  'Report V for one month: opening, purchased with invoice and supplier, used, closing. Used = what was handed over (dispenses, and dispensed ward requests), dated in IST — never typed in, so it cannot be made to agree with the case count by hand.';

CREATE OR REPLACE FUNCTION mtp_draft_on_dispense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_patient uuid;
  v_tracked boolean;
  v_exists  uuid;
  v_serial  text;
  v_anc     record;
  v_pat     record;
BEGIN
  -- Only drugs this hospital has put on the monthly return. A hospital that
  -- has not set them up gets no drafts, which is correct: it also gets no
  -- Report V to disagree with.
  SELECT EXISTS (
    SELECT 1 FROM mtp_tracked_drugs t
     WHERE t.tenant_id = NEW.tenant_id AND t.is_active
       AND ((t.drug_master_id IS NOT NULL AND t.drug_master_id = NEW.drug_master_id)
         OR (t.drug_id        IS NOT NULL AND t.drug_id        = NEW.drug_id))
  ) INTO v_tracked;
  IF NOT v_tracked THEN RETURN NEW; END IF;

  -- The patient, from whichever handover fired: a dispense names them; a ward
  -- request reaches them through the admission.
  IF TG_TABLE_NAME = 'dispenses' THEN
    v_patient := (to_jsonb(NEW) ->> 'patient_id')::uuid;
  ELSE
    SELECT a.patient_id INTO v_patient
      FROM admissions a WHERE a.id = (to_jsonb(NEW) ->> 'admission_id')::uuid;
  END IF;
  IF v_patient IS NULL THEN RETURN NEW; END IF;

  -- One draft per woman per week. The combipack is dispensed as a course and
  -- a second strip days later is the same termination, not another one.
  SELECT id INTO v_exists FROM mtp_records
   WHERE tenant_id = NEW.tenant_id AND patient_id = v_patient
     AND created_at > now() - interval '7 days';
  IF v_exists IS NOT NULL THEN RETURN NEW; END IF;

  SELECT full_name, relation_type, relation_name, address, district, state, pincode, phone, dob
    INTO v_pat FROM patients WHERE id = v_patient;
  SELECT lmp, gravida, para, living, abortions INTO v_anc
    FROM anc_records WHERE patient_id = v_patient ORDER BY created_at DESC LIMIT 1;

  v_serial := get_next_mtp_no(NEW.tenant_id);

  INSERT INTO mtp_records (
    tenant_id, serial_no, patient_id, status,
    patient_name, patient_age_years, relation_type, relation_name,
    address_text, district, state, pincode, contact_no,
    lmp, gravida, para, living, abortions,
    living_male, living_female,
    method, drug_master_id, drug_id
  ) VALUES (
    NEW.tenant_id, v_serial, v_patient, 'draft',
    v_pat.full_name,
    CASE WHEN v_pat.dob IS NULL THEN NULL
         ELSE GREATEST(0, (CURRENT_DATE - v_pat.dob) / 365)::int END,
    v_pat.relation_type, v_pat.relation_name,
    v_pat.address, v_pat.district, v_pat.state, v_pat.pincode, v_pat.phone,
    v_anc.lmp, v_anc.gravida, v_anc.para, v_anc.living, v_anc.abortions,
    (SELECT count(*) FROM patient_children c
      WHERE c.patient_id = v_patient AND c.is_living AND c.sex = 'male'),
    (SELECT count(*) FROM patient_children c
      WHERE c.patient_id = v_patient AND c.is_living AND c.sex = 'female'),
    -- The only thing dispensing actually tells us.
    'medical', NEW.drug_master_id, NEW.drug_id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- This runs inside the handover now. A draft is a reminder, not the record:
  -- failing to open one must never stop a medicine being given (0168 is the
  -- same lesson, learnt on the H1 register, where a raising trigger meant an H1
  -- medicine could not be handed over at all). Report V still counts the drug.
  RAISE WARNING 'mtp_draft_on_dispense: no draft opened for % %: %', TG_TABLE_NAME, NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mtp_draft_on_dispense ON pharmacy_sale_items;

DROP TRIGGER IF EXISTS trg_mtp_draft_on_dispense ON dispenses;
CREATE TRIGGER trg_mtp_draft_on_dispense
  AFTER INSERT ON dispenses
  FOR EACH ROW EXECUTE FUNCTION mtp_draft_on_dispense();

-- A ward request is created when the drug is ordered and dispensed later, by
-- setting dispensed_at — so the handover is that update, not the insert.
DROP TRIGGER IF EXISTS trg_mtp_draft_on_ipd_dispense ON ipd_pharmacy_requests;
CREATE TRIGGER trg_mtp_draft_on_ipd_dispense
  AFTER UPDATE OF dispensed_at ON ipd_pharmacy_requests
  FOR EACH ROW
  WHEN (OLD.dispensed_at IS NULL AND NEW.dispensed_at IS NOT NULL)
  EXECUTE FUNCTION mtp_draft_on_dispense();

COMMENT ON FUNCTION mtp_draft_on_dispense() IS
  'Opens a draft MTP record when an abortion drug on the monthly return is handed over — a dispense, or a ward request being dispensed. A draft only: the pharmacy knows a drug left the shelf, not that a termination happened. Never blocks the handover.';

NOTIFY pgrst, 'reload schema';
