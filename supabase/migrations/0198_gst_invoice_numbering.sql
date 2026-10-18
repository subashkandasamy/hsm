-- Every tax invoice we have ever issued is too long, and the series resets in
-- the wrong month.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- CGST Rule 46(b) requires a tax invoice to carry a consecutive serial number
-- "not exceeding sixteen characters", unique for a financial year, made only
-- of letters, digits, hyphen and slash.
--
-- We were issuing  NEWTEST-BILL-2026-00072  — twenty-three characters. The
-- prefix is built from the tenant slug and is not length-capped, so a hospital
-- with a longer name was worse: SRIRAMAKRISHNA-BILL-2026-00001 is thirty.
-- Credit notes had the same fault (NEWTEST-CN-2026-00001, twenty-one), and a
-- credit note is a Section 34 document held to the same rule.
--
-- The second fault is quieter. Both counters keyed on extract(year ...), the
-- CALENDAR year, so the series restarted on 1 January — in the middle of a
-- financial year. Inside FY 2026-27 the numbering would run up through
-- December and then begin again at 1 in January, which is not a consecutive
-- series for that financial year.
--
-- ── What this does, and does not, change ───────────────────────────────────
--
-- Nothing already issued is renumbered. An invoice that has been handed to a
-- patient and filed is not ours to rewrite, and GST does not allow it. This
-- changes the format from here on, which is a change of series — expressly
-- permitted, and ordinary when a business changes software.
--
-- The counter is NOT reset. The new series continues from the number the old
-- one reached, so no hospital gets a second "invoice number 1" in the same
-- financial year and no number is ever issued twice.
--
--   old   NEWTEST-BILL-2026-00107      23 chars, calendar year
--   new   NEWT/B2627/00108             16 chars, financial year 2026-27
--
--   bill         <PFX4>/B<FY4>/<SEQ5>
--   credit note  <PFX4>/C<FY4>/<SEQ5>
--
-- B and C keep invoices and credit notes in separate series, as they must be.

-- ── The financial year a date falls in ─────────────────────────────────────
-- India's financial year starts on 1 April. FY 2026-27 is written '2627'.

CREATE OR REPLACE FUNCTION fy_start_year(p_on date DEFAULT current_date)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN extract(month FROM p_on) >= 4
              THEN extract(year FROM p_on)::int
              ELSE extract(year FROM p_on)::int - 1 END;
$$;

CREATE OR REPLACE FUNCTION fy_token(p_on date DEFAULT current_date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lpad((fy_start_year(p_on) % 100)::text, 2, '0')
      || lpad(((fy_start_year(p_on) + 1) % 100)::text, 2, '0');
$$;

-- Four characters of the hospital's code, so support can tell at a glance
-- which hospital a number came from. It carries no legal weight — each tenant
-- is its own taxpayer and only needs the series to be unique to itself — so
-- truncating it costs nothing and is what buys us the sixteen-character fit.
CREATE OR REPLACE FUNCTION tenant_doc_prefix_short(p_tenant_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT rpad(left(tenant_doc_prefix(p_tenant_id), 4), 4, 'X');
$$;

COMMENT ON FUNCTION tenant_doc_prefix_short(uuid) IS
  'Four-character hospital tag for GST document numbers. Padded, so the number is always the same length.';

-- ── Tax invoices ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_next_bill_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy        int  := fy_start_year();
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_bill_no: tenant_id could not be resolved (no argument and no session tenant)';
  END IF;

  INSERT INTO bill_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_fy, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = bill_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;

  -- Past 99,999 invoices in one financial year the number would silently grow
  -- to seventeen characters and stop complying. Refusing is the honest
  -- failure: a hospital at that volume has to open a new series deliberately,
  -- and would rather be told than discover it in an assessment.
  IF v_seq > 99999 THEN
    RAISE EXCEPTION 'Invoice series for this financial year is full (99,999 issued). A new series must be opened.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN tenant_doc_prefix_short(v_tenant_id) || '/B' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
END;
$$;

-- ── Credit notes (Section 34, same rule) ───────────────────────────────────

CREATE OR REPLACE FUNCTION get_next_credit_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy        int  := fy_start_year();
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_credit_no: tenant_id could not be resolved';
  END IF;

  INSERT INTO credit_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_fy, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = credit_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;

  IF v_seq > 99999 THEN
    RAISE EXCEPTION 'Credit note series for this financial year is full (99,999 issued). A new series must be opened.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN tenant_doc_prefix_short(v_tenant_id) || '/C' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
END;
$$;

-- ── A number must not be issuable twice ────────────────────────────────────
--
-- There was no uniqueness on either column. Nothing has collided — checked
-- before writing this, zero duplicates in either table — but "a consecutive
-- serial number, unique for a financial year" should be enforced by the
-- database and not only by the function that happens to generate it.

CREATE UNIQUE INDEX IF NOT EXISTS bills_tenant_bill_no_key
  ON bills (tenant_id, bill_no) WHERE bill_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_tenant_credit_no_key
  ON credit_notes (tenant_id, credit_no) WHERE credit_no IS NOT NULL;
