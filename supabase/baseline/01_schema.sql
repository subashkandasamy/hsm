--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: alert_missing_next_partition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alert_missing_next_partition() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  next_suffix text := to_char(date_trunc('month', now() + interval '1 month'), '"y"YYYY"m"MM');
  tables text[] := ARRAY[
    'audit_logs', 'visits', 'appointments', 'bill_items', 'lab_order_items'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT partition_exists(t || '_partitioned_' || next_suffix)
       AND NOT partition_exists(t || '_' || next_suffix)
    THEN
      RAISE WARNING 'Missing next-month partition: %_%', t, next_suffix;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: claim_bed_and_admit(uuid, uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_bed_and_admit(p_admission_id uuid, p_patient_id uuid, p_doctor_id uuid, p_bed_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ward_id   uuid;
  v_tenant_id uuid := current_tenant_id();
BEGIN
  UPDATE beds SET status = 'occupied'
  WHERE id = p_bed_id AND status = 'available'
  RETURNING ward_id INTO v_ward_id;

  IF v_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bed is no longer available');
  END IF;

  INSERT INTO admissions (id, tenant_id, patient_id, admitting_doctor_id, ward_id, bed_id, reason, status)
  VALUES (p_admission_id, v_tenant_id, p_patient_id, p_doctor_id, v_ward_id, p_bed_id, p_reason, 'admitted');

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: create_next_month_partitions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_next_month_partitions() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  p_start date := date_trunc('month', now() + interval '1 month')::date;
  p_end   date := (p_start + interval '1 month')::date;
  suffix  text := to_char(p_start, '"y"YYYY"m"MM');
BEGIN
  IF NOT partition_exists('audit_logs_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'audit_logs_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'audit_logs_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, entity, entity_id, created_at DESC)', 'audit_logs_' || suffix);
  END IF;

  IF NOT partition_exists('appointments_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF appointments FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'appointments_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, doctor_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, scheduled_at DESC)', 'appointments_' || suffix);
  END IF;

  IF NOT partition_exists('visits_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF visits FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'visits_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, visit_date DESC)', 'visits_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, visit_date DESC)', 'visits_' || suffix);
  END IF;

  IF NOT partition_exists('bill_items_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF bill_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'bill_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (bill_id, created_at DESC)', 'bill_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'bill_items_' || suffix);
  END IF;

  IF NOT partition_exists('lab_order_items_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF lab_order_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'lab_order_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (lab_order_id, created_at DESC)', 'lab_order_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'lab_order_items_' || suffix);
  END IF;

  RAISE NOTICE 'Partitions ready for %', suffix;
END;
$$;


--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select tenant_id from profiles where id = auth.uid()
$$;


--
-- Name: dispense_drug(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispense_drug(p_dispense_id uuid, p_patient_id uuid, p_prescription_id uuid, p_drug_id uuid, p_drug_master_id uuid, p_batch_id uuid, p_qty integer, p_price_snapshot numeric, p_dispensed_by uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
BEGIN
  UPDATE drug_batches
  SET qty_available = qty_available - p_qty
  WHERE id = p_batch_id
    AND qty_available >= p_qty
    AND expiry > CURRENT_DATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock or batch expired');
  END IF;

  INSERT INTO dispenses (id, tenant_id, patient_id, prescription_id, drug_id, drug_master_id,
                         drug_batch_id, qty, price_snapshot, billing_status, dispensed_by)
  VALUES (p_dispense_id, v_tenant_id, p_patient_id, p_prescription_id,
          p_drug_id, p_drug_master_id,
          p_batch_id, p_qty, p_price_snapshot, 'unbilled', p_dispensed_by);

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: get_next_appointment_token(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_appointment_token(p_doctor_id uuid, p_date date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id  uuid := current_tenant_id();
  v_next_token int;
begin
  insert into appointment_token_counter (tenant_id, doctor_id, date, last_token)
  values (v_tenant_id, p_doctor_id, p_date, 1)
  on conflict (tenant_id, doctor_id, date) do update
    set last_token = appointment_token_counter.last_token + 1
  returning last_token into v_next_token;
  return v_next_token;
end;
$$;


--
-- Name: get_next_bill_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_bill_no() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from current_date)::int;
  v_seq       int;
begin
  insert into bill_no_seq (tenant_id, year, last_no) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_no = bill_no_seq.last_no + 1
  returning last_no into v_seq;
  return 'BILL-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end;
$$;


--
-- Name: get_next_po_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_po_no() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from current_date)::int;
  v_seq       int;
begin
  insert into po_no_seq (tenant_id, year, last_no) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_no = po_no_seq.last_no + 1
  returning last_no into v_seq;
  return 'PO-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end;
$$;


--
-- Name: get_next_uhid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_uhid() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from now())::int;
  v_next      int;
begin
  insert into uhid_counter (tenant_id, year, last_val) values (v_tenant_id, v_year, 1)
  on conflict (tenant_id, year) do update set last_val = uhid_counter.last_val + 1
  returning last_val into v_next;
  return 'UH-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
end;
$$;


--
-- Name: issue_blood_unit(uuid, uuid, uuid, uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_blood_unit(p_issue_id uuid, p_request_id uuid, p_blood_unit_id uuid, p_patient_id uuid, p_price_snapshot numeric, p_issued_by uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_unit  blood_units%ROWTYPE;
  v_req   blood_requests%ROWTYPE;
  v_issued_count int;
BEGIN
  -- Lock and claim the unit atomically
  UPDATE blood_units
  SET    status = 'issued'
  WHERE  id = p_blood_unit_id
    AND  status = 'available'
    AND  expiry >= CURRENT_DATE
  RETURNING * INTO v_unit;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit unavailable, already issued, or expired');
  END IF;

  -- Verify blood group + component match the request
  SELECT * INTO v_req FROM blood_requests WHERE id = p_request_id;
  IF v_unit.blood_group <> v_req.blood_group OR v_unit.component <> v_req.component THEN
    -- Roll back the status update
    UPDATE blood_units SET status = 'available' WHERE id = p_blood_unit_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Blood group or component mismatch');
  END IF;

  -- Record the issue
  INSERT INTO blood_issues (id, request_id, blood_unit_id, patient_id, price_snapshot, billing_status, issued_by)
  VALUES (p_issue_id, p_request_id, p_blood_unit_id, p_patient_id, p_price_snapshot, 'unbilled', p_issued_by);

  -- Check if request is fully satisfied
  SELECT COUNT(*) INTO v_issued_count FROM blood_issues WHERE request_id = p_request_id;
  IF v_issued_count >= v_req.units_required THEN
    UPDATE blood_requests SET status = 'issued' WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: partition_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.partition_exists(p_name text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_name AND c.relkind = 'r'
  );
$$;


--
-- Name: purge_tenant_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_tenant_data(p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN

  -- ── OT: consumables and team members before schedules ─────────────────────
  DELETE FROM ot_consumables  WHERE tenant_id = p_tenant_id;
  DELETE FROM ot_team_members WHERE ot_schedule_id IN (
    SELECT id FROM ot_schedules WHERE tenant_id = p_tenant_id
  );

  -- ── IPD treatment / medication — all before admissions ────────────────────
  DELETE FROM ipd_pharmacy_requests       WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_medication_orders       WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_admin_schedule          WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_progress_notes          WHERE tenant_id = p_tenant_id;
  DELETE FROM admission_nurse_assignments WHERE tenant_id = p_tenant_id;
  DELETE FROM advance_deposit_requests    WHERE tenant_id = p_tenant_id;

  -- ── Billing leaves — before bills ─────────────────────────────────────────
  DELETE FROM bill_items                  WHERE tenant_id = p_tenant_id;
  DELETE FROM payments                    WHERE tenant_id = p_tenant_id;
  DELETE FROM admission_advance_refunds   WHERE tenant_id = p_tenant_id;
  DELETE FROM insurance_claims            WHERE tenant_id = p_tenant_id;
  DELETE FROM admission_advances          WHERE tenant_id = p_tenant_id;

  -- ── Lab / radiology order children ────────────────────────────────────────
  DELETE FROM lab_order_items             WHERE tenant_id = p_tenant_id;
  DELETE FROM radiology_orders            WHERE tenant_id = p_tenant_id;

  -- ── Pharmacy POS ──────────────────────────────────────────────────────────
  DELETE FROM pharmacy_sale_items         WHERE tenant_id = p_tenant_id;
  DELETE FROM pharmacy_sales              WHERE tenant_id = p_tenant_id;

  -- ── Blood bank leaves ─────────────────────────────────────────────────────
  DELETE FROM blood_issues                WHERE tenant_id = p_tenant_id;

  -- ── Pharmacy / dental / patient attachments ────────────────────────────────
  DELETE FROM dispenses                   WHERE tenant_id = p_tenant_id;
  DELETE FROM dental_treatments           WHERE tenant_id = p_tenant_id;
  DELETE FROM dental_recalls              WHERE tenant_id = p_tenant_id;
  DELETE FROM patient_dental_chart        WHERE tenant_id = p_tenant_id;
  DELETE FROM patient_documents           WHERE tenant_id = p_tenant_id;
  -- patient_allergies: patient_id→patients CASCADE (auto on patients delete)
  -- but explicit here for safety and completeness
  DELETE FROM patient_allergies           WHERE tenant_id = p_tenant_id;

  -- ── Stock ─────────────────────────────────────────────────────────────────
  DELETE FROM po_items                    WHERE tenant_id = p_tenant_id;
  DELETE FROM stock_movements             WHERE tenant_id = p_tenant_id;
  DELETE FROM drug_batches                WHERE tenant_id = p_tenant_id;

  -- ── Mid-level: bills, orders, schedules ───────────────────────────────────
  DELETE FROM bills                       WHERE tenant_id = p_tenant_id;
  DELETE FROM lab_orders                  WHERE tenant_id = p_tenant_id;
  DELETE FROM ot_schedules                WHERE tenant_id = p_tenant_id;
  DELETE FROM prescriptions               WHERE tenant_id = p_tenant_id;

  -- ── Blood bank parents ────────────────────────────────────────────────────
  DELETE FROM blood_units                 WHERE tenant_id = p_tenant_id;
  DELETE FROM blood_requests              WHERE tenant_id = p_tenant_id;
  DELETE FROM blood_donors                WHERE tenant_id = p_tenant_id;

  -- ── OPD visits (partitioned — DELETE on parent covers all partitions) ──────
  DELETE FROM visits                      WHERE tenant_id = p_tenant_id;

  -- ── Insurance parents ─────────────────────────────────────────────────────
  DELETE FROM insurance_policies          WHERE tenant_id = p_tenant_id;

  -- ── Admissions — after ALL IPD / OT / billing / blood tables ─────────────
  DELETE FROM admissions                  WHERE tenant_id = p_tenant_id;

  -- ── Infrastructure freed by admissions ────────────────────────────────────
  DELETE FROM beds                        WHERE tenant_id = p_tenant_id;
  DELETE FROM ot_rooms                    WHERE tenant_id = p_tenant_id;

  -- ── Pharmacy infrastructure ────────────────────────────────────────────────
  DELETE FROM purchase_orders             WHERE tenant_id = p_tenant_id;
  DELETE FROM drugs                       WHERE tenant_id = p_tenant_id;
  DELETE FROM inventory_items             WHERE tenant_id = p_tenant_id;
  DELETE FROM suppliers                   WHERE tenant_id = p_tenant_id;

  -- ── Appointments + emergency (partitioned — DELETE on parent covers all) ───
  DELETE FROM appointments                WHERE tenant_id = p_tenant_id;
  DELETE FROM emergency_cases             WHERE tenant_id = p_tenant_id;

  -- ── HR ────────────────────────────────────────────────────────────────────
  DELETE FROM duty_roster                 WHERE tenant_id = p_tenant_id;
  DELETE FROM staff_attendance            WHERE tenant_id = p_tenant_id;
  DELETE FROM staff_profiles              WHERE tenant_id = p_tenant_id;

  -- ── Catalog / config ──────────────────────────────────────────────────────
  DELETE FROM lab_tests_catalog           WHERE tenant_id = p_tenant_id;
  DELETE FROM radiology_catalog           WHERE tenant_id = p_tenant_id;
  DELETE FROM procedure_tariffs           WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_custom_charges          WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_billing_config          WHERE tenant_id = p_tenant_id;
  DELETE FROM tariffs                     WHERE tenant_id = p_tenant_id;

  -- ── Notifications / audit ─────────────────────────────────────────────────
  DELETE FROM notifications               WHERE tenant_id = p_tenant_id;
  DELETE FROM audit_logs                  WHERE tenant_id = p_tenant_id;

  -- ── CRITICAL: auth_otp_codes BEFORE profiles ──────────────────────────────
  -- profile_id → profiles(id) ON DELETE NO ACTION.
  -- If this is skipped, DELETE FROM profiles will fail with FK violation.
  DELETE FROM auth_otp_codes              WHERE tenant_id = p_tenant_id;

  -- ── Top-level tenant data ─────────────────────────────────────────────────

  -- Patients (after all clinical tables + patient_allergies explicit delete above)
  -- patient_allergies, device_push_tokens cascade from here automatically
  DELETE FROM patients                    WHERE tenant_id = p_tenant_id;

  -- Profiles — device_push_tokens cascades on DELETE (safe)
  DELETE FROM profiles                    WHERE tenant_id = p_tenant_id;

  -- tenant_profiles: tenant_id→tenants CASCADE fires only on tenant row DELETE.
  -- Since we UPDATE (not DELETE) the tenant row, must explicitly purge.
  DELETE FROM tenant_profiles             WHERE tenant_id = p_tenant_id;

  -- Ward hierarchy — must delete wards before ward_room_types
  -- (wards.room_type_id → ward_room_types FK)
  DELETE FROM wards                       WHERE tenant_id = p_tenant_id;

  -- ward_room_types.tenant_id is TEXT — cast the UUID param
  DELETE FROM ward_room_types             WHERE tenant_id = p_tenant_id::text;

  -- Departments (after wards and profiles)
  DELETE FROM departments                 WHERE tenant_id = p_tenant_id;

  -- ── Subscription: mark cancelled, keep row for billing history ────────────
  UPDATE subscriptions SET status = 'cancelled'
    WHERE tenant_id = p_tenant_id;

  -- ── Mark tenant as purged — row is preserved for audit trail ─────────────
  UPDATE tenants SET status = 'purged' WHERE id = p_tenant_id;

END;
$$;


--
-- Name: refresh_dashboard_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_dashboard_views() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bed_occupancy_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_footfall_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_lowstock_alerts_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pending_bills_by_tenant;
END;
$$;


--
-- Name: transfer_bed(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_bed(p_admission_id uuid, p_old_bed_id uuid, p_new_bed_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_ward_id uuid;
BEGIN
  UPDATE beds SET status = 'occupied'
  WHERE id = p_new_bed_id AND status = 'available'
  RETURNING ward_id INTO v_new_ward_id;

  IF v_new_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target bed is no longer available');
  END IF;

  UPDATE beds SET status = 'available' WHERE id = p_old_bed_id;

  UPDATE admissions
  SET bed_id = p_new_bed_id, ward_id = v_new_ward_id
  WHERE id = p_admission_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admission_advance_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admission_advance_refunds (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    amount numeric NOT NULL,
    method text NOT NULL,
    refunded_by uuid,
    refunded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admission_advance_refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT admission_advance_refunds_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'bank_transfer'::text])))
);


--
-- Name: admission_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admission_advances (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    amount numeric NOT NULL,
    method text NOT NULL,
    received_by uuid,
    received_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admission_advances_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT admission_advances_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'bank_transfer'::text])))
);


--
-- Name: admission_nurse_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admission_nurse_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    nurse_id uuid NOT NULL,
    shift text NOT NULL,
    assigned_date date NOT NULL,
    charge_snapshot numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admission_nurse_assignments_shift_check CHECK ((shift = ANY (ARRAY['morning'::text, 'night'::text])))
);


--
-- Name: admissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admissions (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    admitting_doctor_id uuid NOT NULL,
    ward_id uuid,
    bed_id uuid,
    reason text,
    admitted_at timestamp with time zone DEFAULT now(),
    discharged_at timestamp with time zone,
    status text DEFAULT 'admitted'::text NOT NULL,
    discharge_summary text,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    tenant_id uuid NOT NULL,
    procedure_tariff_id uuid,
    treatment_value numeric,
    combined_bill_no text,
    direct_ot boolean DEFAULT false NOT NULL,
    CONSTRAINT admissions_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text]))),
    CONSTRAINT admissions_status_check CHECK ((status = ANY (ARRAY['admitted'::text, 'discharged'::text, 'transferred'::text])))
);


--
-- Name: advance_deposit_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_deposit_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    method text,
    advance_id uuid,
    created_by uuid,
    collected_by uuid,
    collected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advance_deposit_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT advance_deposit_requests_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'bank_transfer'::text]))),
    CONSTRAINT advance_deposit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'collected'::text, 'waived'::text])))
);


--
-- Name: appointment_token_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_token_counter (
    doctor_id uuid NOT NULL,
    date date NOT NULL,
    last_token integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    token_no integer,
    status text DEFAULT 'booked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'checked_in'::text, 'done'::text, 'cancelled'::text, 'no_show'::text])))
)
PARTITION BY RANGE (scheduled_at);


--
-- Name: appointments_y2026m04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments_y2026m04 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    token_no integer,
    status text DEFAULT 'booked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'checked_in'::text, 'done'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: appointments_y2026m05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments_y2026m05 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    token_no integer,
    status text DEFAULT 'booked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'checked_in'::text, 'done'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: appointments_y2026m06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments_y2026m06 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    token_no integer,
    status text DEFAULT 'booked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'checked_in'::text, 'done'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: appointments_y2026m07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments_y2026m07 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    token_no integer,
    status text DEFAULT 'booked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'checked_in'::text, 'done'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: appointments_y2026m08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments_y2026m08 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    department_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    token_no integer,
    status text DEFAULT 'booked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'checked_in'::text, 'done'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
)
PARTITION BY RANGE (created_at);


--
-- Name: audit_logs_y2026m04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_y2026m04 (
    id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: audit_logs_y2026m05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_y2026m05 (
    id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: audit_logs_y2026m06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_y2026m06 (
    id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: audit_logs_y2026m07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_y2026m07 (
    id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: audit_logs_y2026m08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_y2026m08 (
    id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: auth_otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_otp_codes (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    purpose text DEFAULT 'login_2fa'::text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT auth_otp_codes_purpose_check CHECK ((purpose = 'login_2fa'::text))
);


--
-- Name: beds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beds (
    id uuid NOT NULL,
    ward_id uuid NOT NULL,
    bed_no text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT beds_status_check CHECK ((status = ANY (ARRAY['available'::text, 'occupied'::text, 'maintenance'::text])))
);


--
-- Name: bill_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_items (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    source text NOT NULL,
    ref_id uuid,
    description text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_source_check CHECK ((source = ANY (ARRAY['consultation'::text, 'bed'::text, 'lab'::text, 'radiology'::text, 'pharmacy'::text, 'ipd_pharmacy'::text, 'ot'::text, 'ot_consumable'::text, 'blood'::text, 'manual'::text, 'dental'::text, 'pharmacy_sale_item'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text])))
)
PARTITION BY RANGE (created_at);


--
-- Name: bill_items_y2026m04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_items_y2026m04 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    source text NOT NULL,
    ref_id uuid,
    description text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_source_check CHECK ((source = ANY (ARRAY['consultation'::text, 'bed'::text, 'lab'::text, 'radiology'::text, 'pharmacy'::text, 'ipd_pharmacy'::text, 'ot'::text, 'ot_consumable'::text, 'blood'::text, 'manual'::text, 'dental'::text, 'pharmacy_sale_item'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text])))
);


--
-- Name: bill_items_y2026m05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_items_y2026m05 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    source text NOT NULL,
    ref_id uuid,
    description text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_source_check CHECK ((source = ANY (ARRAY['consultation'::text, 'bed'::text, 'lab'::text, 'radiology'::text, 'pharmacy'::text, 'ipd_pharmacy'::text, 'ot'::text, 'ot_consumable'::text, 'blood'::text, 'manual'::text, 'dental'::text, 'pharmacy_sale_item'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text])))
);


--
-- Name: bill_items_y2026m06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_items_y2026m06 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    source text NOT NULL,
    ref_id uuid,
    description text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_source_check CHECK ((source = ANY (ARRAY['consultation'::text, 'bed'::text, 'lab'::text, 'radiology'::text, 'pharmacy'::text, 'ipd_pharmacy'::text, 'ot'::text, 'ot_consumable'::text, 'blood'::text, 'manual'::text, 'dental'::text, 'pharmacy_sale_item'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text])))
);


--
-- Name: bill_items_y2026m07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_items_y2026m07 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    source text NOT NULL,
    ref_id uuid,
    description text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_source_check CHECK ((source = ANY (ARRAY['consultation'::text, 'bed'::text, 'lab'::text, 'radiology'::text, 'pharmacy'::text, 'ipd_pharmacy'::text, 'ot'::text, 'ot_consumable'::text, 'blood'::text, 'manual'::text, 'dental'::text, 'pharmacy_sale_item'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text])))
);


--
-- Name: bill_items_y2026m08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_items_y2026m08 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    source text NOT NULL,
    ref_id uuid,
    description text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_items_source_check CHECK ((source = ANY (ARRAY['consultation'::text, 'bed'::text, 'lab'::text, 'radiology'::text, 'pharmacy'::text, 'ipd_pharmacy'::text, 'ot'::text, 'ot_consumable'::text, 'blood'::text, 'manual'::text, 'dental'::text, 'pharmacy_sale_item'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text])))
);


--
-- Name: bill_no_seq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_no_seq (
    year integer NOT NULL,
    last_no integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bills (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    admission_id uuid,
    bill_no text NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    paid numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    appointment_id uuid,
    billing_date date,
    bill_source text,
    consolidated_by uuid,
    CONSTRAINT bills_bill_source_check CHECK ((bill_source = ANY (ARRAY['bed'::text, 'lab'::text, 'radiology'::text, 'ipd_pharmacy'::text, 'nursing'::text, 'nursing_morning'::text, 'nursing_night'::text, 'consolidated'::text, 'advance_refund'::text, 'appointment_refund'::text, 'ot'::text]))),
    CONSTRAINT bills_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'unpaid'::text, 'partial'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: blood_donors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_donors (
    id uuid NOT NULL,
    name text NOT NULL,
    blood_group text NOT NULL,
    phone text,
    last_donation_date date,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: blood_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_issues (
    id uuid NOT NULL,
    request_id uuid NOT NULL,
    blood_unit_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    issued_by uuid,
    issued_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT blood_issues_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text])))
);


--
-- Name: blood_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_requests (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    blood_group text NOT NULL,
    component text NOT NULL,
    units_required integer NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_by uuid,
    notes text,
    requested_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT blood_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'cross_matched'::text, 'issued'::text, 'cancelled'::text]))),
    CONSTRAINT blood_requests_units_required_check CHECK ((units_required > 0))
);


--
-- Name: blood_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_units (
    id uuid NOT NULL,
    blood_group text NOT NULL,
    component text NOT NULL,
    donor_id uuid,
    collected_at date,
    expiry date NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT blood_units_blood_group_check CHECK ((blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text]))),
    CONSTRAINT blood_units_component_check CHECK ((component = ANY (ARRAY['whole'::text, 'prbc'::text, 'plasma'::text, 'platelets'::text]))),
    CONSTRAINT blood_units_status_check CHECK ((status = ANY (ARRAY['available'::text, 'reserved'::text, 'issued'::text, 'expired'::text, 'discarded'::text])))
);


--
-- Name: dental_recalls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dental_recalls (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    recall_date date NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dental_recalls_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'notified'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: dental_treatments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dental_treatments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    tooth_number integer,
    procedure text NOT NULL,
    notes text,
    price_snapshot numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dental_treatments_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text]))),
    CONSTRAINT dental_treatments_tooth_number_check CHECK (((tooth_number >= 1) AND (tooth_number <= 32)))
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    clinical_template text DEFAULT 'general'::text NOT NULL,
    CONSTRAINT departments_clinical_template_check CHECK ((clinical_template = ANY (ARRAY['general'::text, 'dental'::text, 'ophthalmology'::text])))
);


--
-- Name: device_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_push_tokens (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    platform text NOT NULL,
    push_token text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_seen_at timestamp with time zone DEFAULT now(),
    CONSTRAINT device_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])))
);


--
-- Name: dispenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispenses (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    prescription_id uuid,
    drug_id uuid,
    drug_batch_id uuid NOT NULL,
    qty integer NOT NULL,
    price_snapshot numeric NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    dispensed_by uuid,
    dispensed_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    dispatched_at timestamp with time zone,
    admission_id uuid,
    drug_master_id uuid,
    CONSTRAINT chk_dispense_drug_ref CHECK ((((drug_id IS NOT NULL) AND (drug_master_id IS NULL)) OR ((drug_id IS NULL) AND (drug_master_id IS NOT NULL)))),
    CONSTRAINT dispenses_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text]))),
    CONSTRAINT dispenses_qty_check CHECK ((qty > 0))
);


--
-- Name: drug_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drug_batches (
    id uuid NOT NULL,
    drug_id uuid,
    batch_no text NOT NULL,
    expiry date NOT NULL,
    qty_available integer DEFAULT 0 NOT NULL,
    purchase_price numeric,
    mrp numeric NOT NULL,
    tenant_id uuid NOT NULL,
    drug_master_id uuid,
    reorder_level integer DEFAULT 0 NOT NULL,
    drug_brand_id uuid,
    brand_name text,
    manufacturer text,
    pack_size integer DEFAULT 1,
    pack_unit text DEFAULT 'strip'::text,
    mfg_date date,
    hsn_code text DEFAULT '30049099'::text,
    gst_rate numeric(5,2) DEFAULT 12.00,
    supplier_name text,
    supplier_invoice_no text,
    purchase_date date,
    storage_location text,
    CONSTRAINT chk_drug_batch_ref CHECK ((((drug_id IS NOT NULL) AND (drug_master_id IS NULL)) OR ((drug_id IS NULL) AND (drug_master_id IS NOT NULL))))
);


--
-- Name: drug_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drug_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drug_master_id uuid,
    brand_name text NOT NULL,
    manufacturer text NOT NULL,
    hsn_code text DEFAULT '30049099'::text NOT NULL,
    gst_rate numeric(5,2) DEFAULT 12.00 NOT NULL,
    pack_size integer DEFAULT 1 NOT NULL,
    pack_unit text DEFAULT 'strip'::text NOT NULL,
    mrp_per_pack numeric,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: drug_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drug_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    generic_name text,
    category text,
    form text,
    strength text,
    unit text,
    is_active boolean DEFAULT true NOT NULL,
    schedule text,
    atc_code text,
    pharmacological_class text
);


--
-- Name: drugs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drugs (
    id uuid NOT NULL,
    name text NOT NULL,
    generic_name text,
    form text,
    strength text,
    unit text,
    reorder_level integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: duty_roster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duty_roster (
    id uuid NOT NULL,
    profile_id uuid NOT NULL,
    date date NOT NULL,
    shift text,
    ward_id uuid,
    tenant_id uuid NOT NULL,
    CONSTRAINT duty_roster_shift_check CHECK ((shift = ANY (ARRAY['morning'::text, 'evening'::text, 'night'::text])))
);


--
-- Name: emergency_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emergency_cases (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    triage_level integer NOT NULL,
    arrival_mode text,
    complaint text,
    attended_by uuid,
    status text DEFAULT 'waiting'::text NOT NULL,
    outcome text,
    arrived_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT emergency_cases_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'in_treatment'::text, 'admitted'::text, 'discharged'::text, 'referred'::text]))),
    CONSTRAINT emergency_cases_triage_level_check CHECK (((triage_level >= 1) AND (triage_level <= 5)))
);


--
-- Name: insurance_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_claims (
    id uuid NOT NULL,
    bill_id uuid NOT NULL,
    policy_id uuid NOT NULL,
    claim_amount numeric NOT NULL,
    approved_amount numeric,
    status text DEFAULT 'draft'::text NOT NULL,
    remarks text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT insurance_claims_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'preauth'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'settled'::text])))
);


--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_policies (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    provider text NOT NULL,
    policy_no text NOT NULL,
    valid_till date,
    coverage_amount numeric,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid NOT NULL,
    name text NOT NULL,
    category text,
    unit text,
    qty_in_stock integer DEFAULT 0 NOT NULL,
    reorder_level integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: ipd_admin_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ipd_admin_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    given_at timestamp with time zone,
    given_by uuid,
    given_notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ipd_admin_schedule_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'given'::text, 'missed'::text, 'held'::text])))
);


--
-- Name: ipd_billing_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ipd_billing_config (
    tenant_id uuid NOT NULL,
    charge_room_rent boolean DEFAULT true NOT NULL,
    charge_doctor_fee boolean DEFAULT true NOT NULL,
    charge_nursing boolean DEFAULT true NOT NULL,
    charge_medicines boolean DEFAULT true NOT NULL,
    charge_admission_fee boolean DEFAULT false NOT NULL,
    admission_fee_amount numeric DEFAULT 0 NOT NULL,
    service_charge_per_day numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ipd_custom_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ipd_custom_charges (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    amount numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ipd_custom_charges_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: ipd_medication_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ipd_medication_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    admission_id uuid NOT NULL,
    ordered_by uuid NOT NULL,
    type text NOT NULL,
    drug_name text,
    dose numeric,
    dose_unit text,
    route text,
    fluid_name text,
    volume_ml numeric,
    rate_ml_per_hr numeric,
    flow_rate_lpm numeric,
    delivery_method text,
    frequency_type text NOT NULL,
    frequency_hours integer,
    start_at timestamp with time zone DEFAULT now() NOT NULL,
    stop_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    copied_from_visit_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    duration_days integer DEFAULT 3 NOT NULL,
    drug_master_id uuid,
    drug_id uuid,
    CONSTRAINT ipd_medication_orders_frequency_type_check CHECK ((frequency_type = ANY (ARRAY['stat'::text, 'daily'::text, 'twice_daily'::text, 'thrice_daily'::text, 'every_x_hours'::text, 'sos'::text, 'continuous'::text]))),
    CONSTRAINT ipd_medication_orders_status_check CHECK ((status = ANY (ARRAY['active'::text, 'stopped'::text]))),
    CONSTRAINT ipd_medication_orders_type_check CHECK ((type = ANY (ARRAY['medication'::text, 'iv_infusion'::text, 'oxygen'::text])))
);


--
-- Name: ipd_pharmacy_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ipd_pharmacy_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid,
    admission_id uuid NOT NULL,
    item_name text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit text,
    status text DEFAULT 'pending'::text NOT NULL,
    dispensed_by uuid,
    dispensed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    price_snapshot numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'pending'::text NOT NULL,
    drug_master_id uuid,
    drug_id uuid,
    CONSTRAINT ipd_pharmacy_requests_billing_status_check CHECK ((billing_status = ANY (ARRAY['pending'::text, 'unbilled'::text, 'billed'::text]))),
    CONSTRAINT ipd_pharmacy_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'dispensed'::text, 'cancelled'::text])))
);


--
-- Name: ipd_progress_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ipd_progress_notes (
    id uuid NOT NULL,
    admission_id uuid NOT NULL,
    author_id uuid,
    note text NOT NULL,
    vitals jsonb,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: lab_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_items (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    lab_order_id uuid NOT NULL,
    test_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    result_value numeric,
    result_text text,
    unit text,
    flag text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_order_items_flag_check CHECK ((flag = ANY (ARRAY['pending'::text, 'normal'::text, 'high'::text, 'low'::text])))
)
PARTITION BY RANGE (created_at);


--
-- Name: lab_order_items_y2026m04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_items_y2026m04 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    lab_order_id uuid NOT NULL,
    test_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    result_value numeric,
    result_text text,
    unit text,
    flag text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_order_items_flag_check CHECK ((flag = ANY (ARRAY['pending'::text, 'normal'::text, 'high'::text, 'low'::text])))
);


--
-- Name: lab_order_items_y2026m05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_items_y2026m05 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    lab_order_id uuid NOT NULL,
    test_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    result_value numeric,
    result_text text,
    unit text,
    flag text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_order_items_flag_check CHECK ((flag = ANY (ARRAY['pending'::text, 'normal'::text, 'high'::text, 'low'::text])))
);


--
-- Name: lab_order_items_y2026m06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_items_y2026m06 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    lab_order_id uuid NOT NULL,
    test_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    result_value numeric,
    result_text text,
    unit text,
    flag text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_order_items_flag_check CHECK ((flag = ANY (ARRAY['pending'::text, 'normal'::text, 'high'::text, 'low'::text])))
);


--
-- Name: lab_order_items_y2026m07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_items_y2026m07 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    lab_order_id uuid NOT NULL,
    test_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    result_value numeric,
    result_text text,
    unit text,
    flag text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_order_items_flag_check CHECK ((flag = ANY (ARRAY['pending'::text, 'normal'::text, 'high'::text, 'low'::text])))
);


--
-- Name: lab_order_items_y2026m08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_items_y2026m08 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    lab_order_id uuid NOT NULL,
    test_id uuid NOT NULL,
    price_snapshot numeric NOT NULL,
    result_value numeric,
    result_text text,
    unit text,
    flag text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_order_items_flag_check CHECK ((flag = ANY (ARRAY['pending'::text, 'normal'::text, 'high'::text, 'low'::text])))
);


--
-- Name: lab_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_orders (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    ordered_by uuid,
    status text DEFAULT 'ordered'::text NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    ordered_at timestamp with time zone DEFAULT now(),
    reported_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    admission_id uuid,
    priority text DEFAULT 'routine'::text NOT NULL,
    scheduled_for date,
    sample_label_printed_at timestamp with time zone,
    CONSTRAINT lab_orders_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text]))),
    CONSTRAINT lab_orders_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'collected'::text, 'processing'::text, 'reported'::text, 'cancelled'::text])))
);


--
-- Name: lab_tests_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_tests_catalog (
    id uuid NOT NULL,
    name text NOT NULL,
    code text,
    sample_type text,
    unit text,
    ref_low numeric,
    ref_high numeric,
    reference_range text,
    price numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    lab_master_id uuid,
    category text DEFAULT 'General'::text NOT NULL
);


--
-- Name: lab_tests_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_tests_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    category text DEFAULT 'General'::text NOT NULL,
    sample_type text,
    unit text,
    ref_low numeric,
    ref_high numeric,
    reference_range text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mv_bed_occupancy_by_tenant; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_bed_occupancy_by_tenant AS
 SELECT tenant_id,
    count(*) AS total_beds,
    count(*) FILTER (WHERE (status = 'occupied'::text)) AS occupied_beds,
    count(*) FILTER (WHERE (status = 'available'::text)) AS available_beds,
    count(*) FILTER (WHERE (status = 'maintenance'::text)) AS maintenance_beds
   FROM public.beds
  GROUP BY tenant_id
  WITH NO DATA;


--
-- Name: mv_daily_footfall_by_tenant; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_footfall_by_tenant AS
 SELECT tenant_id,
    day,
    sum(cnt) AS total_footfall
   FROM ( SELECT appointments.tenant_id,
            ((appointments.scheduled_at AT TIME ZONE 'UTC'::text))::date AS day,
            count(*) AS cnt
           FROM public.appointments
          GROUP BY appointments.tenant_id, (((appointments.scheduled_at AT TIME ZONE 'UTC'::text))::date)
        UNION ALL
         SELECT emergency_cases.tenant_id,
            ((emergency_cases.arrived_at AT TIME ZONE 'UTC'::text))::date AS day,
            count(*) AS cnt
           FROM public.emergency_cases
          GROUP BY emergency_cases.tenant_id, (((emergency_cases.arrived_at AT TIME ZONE 'UTC'::text))::date)) sub
  GROUP BY tenant_id, day
  WITH NO DATA;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid NOT NULL,
    bill_id uuid NOT NULL,
    amount numeric NOT NULL,
    method text NOT NULL,
    reference text,
    received_by uuid,
    received_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'bank_transfer'::text, 'insurance'::text, 'advance'::text])))
);


--
-- Name: mv_daily_revenue_by_tenant; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_revenue_by_tenant AS
 SELECT tenant_id,
    ((received_at AT TIME ZONE 'UTC'::text))::date AS day,
    (sum(amount))::numeric(14,2) AS total_amount
   FROM public.payments
  GROUP BY tenant_id, (((received_at AT TIME ZONE 'UTC'::text))::date)
  WITH NO DATA;


--
-- Name: mv_lowstock_alerts_by_tenant; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_lowstock_alerts_by_tenant AS
 SELECT tenant_id,
    count(*) FILTER (WHERE (qty_in_stock <= reorder_level)) AS low_stock_count,
    count(*) FILTER (WHERE (qty_in_stock = 0)) AS out_of_stock_count
   FROM public.inventory_items
  WHERE (is_active = true)
  GROUP BY tenant_id
  WITH NO DATA;


--
-- Name: mv_pending_bills_by_tenant; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_pending_bills_by_tenant AS
 SELECT tenant_id,
    count(*) AS pending_count,
    (sum(total))::numeric(14,2) AS pending_total
   FROM public.bills
  WHERE (status = ANY (ARRAY['unpaid'::text, 'partial'::text]))
  GROUP BY tenant_id
  WITH NO DATA;


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id uuid NOT NULL,
    key text NOT NULL,
    channel text NOT NULL,
    provider_template_name text,
    body_preview text,
    is_active boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT notification_templates_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'sms'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    patient_id uuid,
    channel text NOT NULL,
    template_key text,
    recipient_phone text NOT NULL,
    ref_type text NOT NULL,
    ref_id uuid,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_message_id text,
    error text,
    sent_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT notifications_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'sms'::text]))),
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text])))
);


--
-- Name: ot_consumables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_consumables (
    id uuid NOT NULL,
    ot_schedule_id uuid NOT NULL,
    description text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    drug_master_id uuid,
    drug_id uuid,
    pharmacy_request_id uuid
);


--
-- Name: ot_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_rooms (
    id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    ot_type text,
    floor text,
    block text,
    notes text,
    status text DEFAULT 'active'::text NOT NULL
);


--
-- Name: ot_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_schedules (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    surgeon_id uuid NOT NULL,
    anaesthetist_id uuid,
    ot_room_id uuid NOT NULL,
    procedure_name text NOT NULL,
    scheduled_start timestamp with time zone NOT NULL,
    scheduled_end timestamp with time zone NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    notes text,
    price_snapshot numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    post_op_ward_id uuid,
    post_op_bed_id uuid,
    admission_id uuid,
    CONSTRAINT ot_schedules_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text]))),
    CONSTRAINT ot_schedules_check CHECK ((scheduled_end > scheduled_start)),
    CONSTRAINT ot_schedules_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: ot_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ot_schedule_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role text DEFAULT 'assistant'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_allergies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_allergies (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    allergen text NOT NULL,
    reaction text,
    severity text DEFAULT 'moderate'::text NOT NULL,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT patient_allergies_severity_check CHECK ((severity = ANY (ARRAY['mild'::text, 'moderate'::text, 'severe'::text])))
);


--
-- Name: patient_dental_chart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_dental_chart (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    tooth_number integer NOT NULL,
    current_status text DEFAULT 'healthy'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT patient_dental_chart_current_status_check CHECK ((current_status = ANY (ARRAY['healthy'::text, 'decayed'::text, 'filled'::text, 'crowned'::text, 'root_canal'::text, 'missing'::text, 'extracted'::text, 'implant'::text]))),
    CONSTRAINT patient_dental_chart_tooth_number_check CHECK (((tooth_number >= 1) AND (tooth_number <= 32)))
);


--
-- Name: patient_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_documents (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    title text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    file_path text NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT patient_documents_category_check CHECK ((category = ANY (ARRAY['external_report'::text, 'referral'::text, 'consent_form'::text, 'identity'::text, 'insurance'::text, 'other'::text])))
);


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id uuid NOT NULL,
    uhid text NOT NULL,
    full_name text NOT NULL,
    dob date,
    gender text,
    phone text NOT NULL,
    email text,
    address text,
    blood_group text,
    allergies text,
    emergency_contact_name text,
    emergency_contact_phone text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    notify_whatsapp_consent boolean DEFAULT false NOT NULL,
    notify_sms_consent boolean DEFAULT false NOT NULL,
    tenant_id uuid NOT NULL,
    combined_bill_no text,
    aadhaar_no text,
    wristband_printed_at timestamp with time zone,
    CONSTRAINT patients_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])))
);


--
-- Name: pharmacy_sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_sale_items (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    pharmacy_sale_id uuid NOT NULL,
    prescription_id uuid,
    drug_id uuid,
    qty integer NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    drug_master_id uuid,
    CONSTRAINT chk_sale_item_drug_ref CHECK ((((drug_id IS NOT NULL) AND (drug_master_id IS NULL)) OR ((drug_id IS NULL) AND (drug_master_id IS NOT NULL)))),
    CONSTRAINT pharmacy_sale_items_qty_check CHECK ((qty > 0))
);


--
-- Name: pharmacy_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_sales (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    bill_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pharmacy_sales_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'billed'::text, 'paid'::text, 'fulfilled'::text, 'cancelled'::text])))
);


--
-- Name: platform_admin_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admin_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_tenant_id uuid,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid NOT NULL,
    full_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: po_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_items (
    id uuid NOT NULL,
    po_id uuid NOT NULL,
    item_id uuid NOT NULL,
    qty integer NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    received_qty integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT po_items_qty_check CHECK ((qty > 0))
);


--
-- Name: po_no_seq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_no_seq (
    year integer NOT NULL,
    last_no integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescriptions (
    id uuid NOT NULL,
    visit_id uuid NOT NULL,
    drug_name text NOT NULL,
    dosage text,
    frequency text,
    duration text,
    instructions text,
    tenant_id uuid NOT NULL
);


--
-- Name: procedure_tariffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedure_tariffs (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    default_price numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT procedure_tariffs_category_check CHECK ((category = ANY (ARRAY['general'::text, 'surgery'::text, 'procedure'::text, 'package'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    phone text,
    department_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    phone_verified boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text, 'lab_tech'::text, 'pharmacist'::text, 'accountant'::text])))
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid NOT NULL,
    po_no text NOT NULL,
    supplier_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    received_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ordered'::text, 'received'::text, 'partially_received'::text, 'cancelled'::text])))
);


--
-- Name: radiology_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radiology_catalog (
    id uuid NOT NULL,
    name text NOT NULL,
    modality text,
    price numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    radiology_master_id uuid,
    body_part text DEFAULT 'General'::text NOT NULL
);


--
-- Name: radiology_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radiology_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    modality text NOT NULL,
    body_part text DEFAULT 'General'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: radiology_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radiology_orders (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    test_id uuid NOT NULL,
    ordered_by uuid,
    price_snapshot numeric NOT NULL,
    status text DEFAULT 'ordered'::text NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    report text,
    image_url text,
    ordered_at timestamp with time zone DEFAULT now(),
    reported_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    admission_id uuid,
    priority text DEFAULT 'routine'::text NOT NULL,
    scheduled_for date,
    CONSTRAINT radiology_orders_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text]))),
    CONSTRAINT radiology_orders_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'performed'::text, 'reported'::text, 'cancelled'::text])))
);


--
-- Name: staff_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_attendance (
    id uuid NOT NULL,
    profile_id uuid NOT NULL,
    date date NOT NULL,
    status text NOT NULL,
    shift text,
    check_in time without time zone,
    check_out time without time zone,
    tenant_id uuid NOT NULL,
    CONSTRAINT staff_attendance_shift_check CHECK ((shift = ANY (ARRAY['morning'::text, 'evening'::text, 'night'::text]))),
    CONSTRAINT staff_attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'leave'::text, 'half_day'::text])))
);


--
-- Name: staff_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_profiles (
    profile_id uuid NOT NULL,
    designation text,
    joining_date date,
    address text,
    emergency_contact text,
    tenant_id uuid NOT NULL,
    consultation_fee numeric,
    nursing_charge_per_shift numeric
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid NOT NULL,
    item_id uuid NOT NULL,
    change integer NOT NULL,
    reason text NOT NULL,
    ref_id uuid,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT stock_movements_reason_check CHECK ((reason = ANY (ARRAY['purchase'::text, 'issue'::text, 'adjustment'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text,
    plan text NOT NULL,
    status text NOT NULL,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: tariffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tariffs (
    id uuid NOT NULL,
    key text NOT NULL,
    label text,
    amount numeric DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: tenant_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_profiles (
    tenant_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    tagline text,
    tagline2 text,
    logo_url text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    pincode text,
    phone1 text,
    phone2 text,
    email text,
    website text,
    cin_no text,
    gst_no text,
    emergency_contact text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'trial'::text NOT NULL,
    plan text DEFAULT 'starter'::text NOT NULL,
    custom_domain text,
    trial_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    enabled_modules jsonb DEFAULT '["ipd", "emergency", "bloodbank", "ot", "lab", "radiology", "pharmacy", "insurance", "inventory", "hr"]'::jsonb NOT NULL,
    sms_2fa_enabled boolean DEFAULT false NOT NULL,
    advance_percentage numeric DEFAULT 50 NOT NULL,
    override_access_until timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    terms_version text,
    CONSTRAINT tenants_advance_percentage_check CHECK (((advance_percentage >= (0)::numeric) AND (advance_percentage <= (100)::numeric))),
    CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'cancelled'::text, 'purged'::text])))
);


--
-- Name: uhid_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uhid_counter (
    year integer NOT NULL,
    last_val integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: v_replication_lag; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_replication_lag AS
 SELECT client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    (sent_lsn - replay_lsn) AS lag_bytes,
    EXTRACT(epoch FROM write_lag) AS write_lag_seconds,
    EXTRACT(epoch FROM flush_lag) AS flush_lag_seconds,
    EXTRACT(epoch FROM replay_lag) AS replay_lag_seconds,
    now() AS checked_at
   FROM pg_stat_replication;


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    appointment_id uuid,
    type text DEFAULT 'opd'::text NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    vitals jsonb,
    complaint text,
    diagnosis text,
    icd_code text,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_data jsonb,
    consultation_fee numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    combined_bill_no text,
    CONSTRAINT visits_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text, 'waived'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
)
PARTITION BY RANGE (visit_date);


--
-- Name: visits_y2026m04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits_y2026m04 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    appointment_id uuid,
    type text DEFAULT 'opd'::text NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    vitals jsonb,
    complaint text,
    diagnosis text,
    icd_code text,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_data jsonb,
    consultation_fee numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    combined_bill_no text,
    CONSTRAINT visits_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text, 'waived'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: visits_y2026m05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits_y2026m05 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    appointment_id uuid,
    type text DEFAULT 'opd'::text NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    vitals jsonb,
    complaint text,
    diagnosis text,
    icd_code text,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_data jsonb,
    consultation_fee numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    combined_bill_no text,
    CONSTRAINT visits_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text, 'waived'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: visits_y2026m06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits_y2026m06 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    appointment_id uuid,
    type text DEFAULT 'opd'::text NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    vitals jsonb,
    complaint text,
    diagnosis text,
    icd_code text,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_data jsonb,
    consultation_fee numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    combined_bill_no text,
    CONSTRAINT visits_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text, 'waived'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: visits_y2026m07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits_y2026m07 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    appointment_id uuid,
    type text DEFAULT 'opd'::text NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    vitals jsonb,
    complaint text,
    diagnosis text,
    icd_code text,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_data jsonb,
    consultation_fee numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    combined_bill_no text,
    CONSTRAINT visits_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text, 'waived'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: visits_y2026m08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits_y2026m08 (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    appointment_id uuid,
    type text DEFAULT 'opd'::text NOT NULL,
    visit_date timestamp with time zone DEFAULT now() NOT NULL,
    vitals jsonb,
    complaint text,
    diagnosis text,
    icd_code text,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clinical_data jsonb,
    consultation_fee numeric DEFAULT 0 NOT NULL,
    billing_status text DEFAULT 'unbilled'::text NOT NULL,
    combined_bill_no text,
    CONSTRAINT visits_billing_status_check CHECK ((billing_status = ANY (ARRAY['unbilled'::text, 'billed'::text, 'waived'::text]))),
    CONSTRAINT visits_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: ward_room_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ward_room_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    daily_rate numeric DEFAULT 0 NOT NULL,
    is_multi_bed boolean DEFAULT false NOT NULL
);


--
-- Name: wards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wards (
    id uuid NOT NULL,
    name text NOT NULL,
    ward_type text,
    department_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    daily_rate numeric DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    is_temp boolean DEFAULT false NOT NULL,
    room_type text,
    floor text,
    block text,
    room_type_id uuid
);


--
-- Name: appointments_y2026m04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ATTACH PARTITION public.appointments_y2026m04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: appointments_y2026m05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ATTACH PARTITION public.appointments_y2026m05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: appointments_y2026m06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ATTACH PARTITION public.appointments_y2026m06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: appointments_y2026m07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ATTACH PARTITION public.appointments_y2026m07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: appointments_y2026m08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ATTACH PARTITION public.appointments_y2026m08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: audit_logs_y2026m04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_y2026m04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: audit_logs_y2026m05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_y2026m05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: audit_logs_y2026m06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_y2026m06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: audit_logs_y2026m07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_y2026m07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: audit_logs_y2026m08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_y2026m08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: bill_items_y2026m04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items ATTACH PARTITION public.bill_items_y2026m04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: bill_items_y2026m05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items ATTACH PARTITION public.bill_items_y2026m05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: bill_items_y2026m06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items ATTACH PARTITION public.bill_items_y2026m06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: bill_items_y2026m07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items ATTACH PARTITION public.bill_items_y2026m07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: bill_items_y2026m08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items ATTACH PARTITION public.bill_items_y2026m08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: lab_order_items_y2026m04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items ATTACH PARTITION public.lab_order_items_y2026m04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: lab_order_items_y2026m05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items ATTACH PARTITION public.lab_order_items_y2026m05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: lab_order_items_y2026m06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items ATTACH PARTITION public.lab_order_items_y2026m06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: lab_order_items_y2026m07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items ATTACH PARTITION public.lab_order_items_y2026m07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: lab_order_items_y2026m08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items ATTACH PARTITION public.lab_order_items_y2026m08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: visits_y2026m04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits ATTACH PARTITION public.visits_y2026m04 FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: visits_y2026m05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits ATTACH PARTITION public.visits_y2026m05 FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: visits_y2026m06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits ATTACH PARTITION public.visits_y2026m06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: visits_y2026m07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits ATTACH PARTITION public.visits_y2026m07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: visits_y2026m08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits ATTACH PARTITION public.visits_y2026m08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: admission_advance_refunds admission_advance_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advance_refunds
    ADD CONSTRAINT admission_advance_refunds_pkey PRIMARY KEY (id);


--
-- Name: admission_advances admission_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advances
    ADD CONSTRAINT admission_advances_pkey PRIMARY KEY (id);


--
-- Name: admission_nurse_assignments admission_nurse_assignments_admission_id_shift_assigned_dat_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_nurse_assignments
    ADD CONSTRAINT admission_nurse_assignments_admission_id_shift_assigned_dat_key UNIQUE (admission_id, shift, assigned_date);


--
-- Name: admission_nurse_assignments admission_nurse_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_nurse_assignments
    ADD CONSTRAINT admission_nurse_assignments_pkey PRIMARY KEY (id);


--
-- Name: admissions admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_pkey PRIMARY KEY (id);


--
-- Name: advance_deposit_requests advance_deposit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_deposit_requests
    ADD CONSTRAINT advance_deposit_requests_pkey PRIMARY KEY (id);


--
-- Name: appointment_token_counter appointment_token_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_token_counter
    ADD CONSTRAINT appointment_token_counter_pkey PRIMARY KEY (tenant_id, doctor_id, date);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id, scheduled_at);


--
-- Name: appointments_y2026m04 appointments_y2026m04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments_y2026m04
    ADD CONSTRAINT appointments_y2026m04_pkey PRIMARY KEY (id, scheduled_at);


--
-- Name: appointments_y2026m05 appointments_y2026m05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments_y2026m05
    ADD CONSTRAINT appointments_y2026m05_pkey PRIMARY KEY (id, scheduled_at);


--
-- Name: appointments_y2026m06 appointments_y2026m06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments_y2026m06
    ADD CONSTRAINT appointments_y2026m06_pkey PRIMARY KEY (id, scheduled_at);


--
-- Name: appointments_y2026m07 appointments_y2026m07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments_y2026m07
    ADD CONSTRAINT appointments_y2026m07_pkey PRIMARY KEY (id, scheduled_at);


--
-- Name: appointments_y2026m08 appointments_y2026m08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments_y2026m08
    ADD CONSTRAINT appointments_y2026m08_pkey PRIMARY KEY (id, scheduled_at);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_y2026m04 audit_logs_y2026m04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs_y2026m04
    ADD CONSTRAINT audit_logs_y2026m04_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_y2026m05 audit_logs_y2026m05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs_y2026m05
    ADD CONSTRAINT audit_logs_y2026m05_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_y2026m06 audit_logs_y2026m06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs_y2026m06
    ADD CONSTRAINT audit_logs_y2026m06_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_y2026m07 audit_logs_y2026m07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs_y2026m07
    ADD CONSTRAINT audit_logs_y2026m07_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_y2026m08 audit_logs_y2026m08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs_y2026m08
    ADD CONSTRAINT audit_logs_y2026m08_pkey PRIMARY KEY (id, created_at);


--
-- Name: auth_otp_codes auth_otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp_codes
    ADD CONSTRAINT auth_otp_codes_pkey PRIMARY KEY (id);


--
-- Name: beds beds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_pkey PRIMARY KEY (id);


--
-- Name: beds beds_ward_id_bed_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_ward_id_bed_no_key UNIQUE (ward_id, bed_no);


--
-- Name: bill_items bill_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items
    ADD CONSTRAINT bill_items_pkey PRIMARY KEY (id, created_at);


--
-- Name: bill_items_y2026m04 bill_items_y2026m04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items_y2026m04
    ADD CONSTRAINT bill_items_y2026m04_pkey PRIMARY KEY (id, created_at);


--
-- Name: bill_items_y2026m05 bill_items_y2026m05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items_y2026m05
    ADD CONSTRAINT bill_items_y2026m05_pkey PRIMARY KEY (id, created_at);


--
-- Name: bill_items_y2026m06 bill_items_y2026m06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items_y2026m06
    ADD CONSTRAINT bill_items_y2026m06_pkey PRIMARY KEY (id, created_at);


--
-- Name: bill_items_y2026m07 bill_items_y2026m07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items_y2026m07
    ADD CONSTRAINT bill_items_y2026m07_pkey PRIMARY KEY (id, created_at);


--
-- Name: bill_items_y2026m08 bill_items_y2026m08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_items_y2026m08
    ADD CONSTRAINT bill_items_y2026m08_pkey PRIMARY KEY (id, created_at);


--
-- Name: bill_no_seq bill_no_seq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_no_seq
    ADD CONSTRAINT bill_no_seq_pkey PRIMARY KEY (tenant_id, year);


--
-- Name: bills bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (id);


--
-- Name: blood_donors blood_donors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_donors
    ADD CONSTRAINT blood_donors_pkey PRIMARY KEY (id);


--
-- Name: blood_issues blood_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_issues
    ADD CONSTRAINT blood_issues_pkey PRIMARY KEY (id);


--
-- Name: blood_requests blood_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT blood_requests_pkey PRIMARY KEY (id);


--
-- Name: blood_units blood_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_units
    ADD CONSTRAINT blood_units_pkey PRIMARY KEY (id);


--
-- Name: dental_recalls dental_recalls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dental_recalls
    ADD CONSTRAINT dental_recalls_pkey PRIMARY KEY (id);


--
-- Name: dental_treatments dental_treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dental_treatments
    ADD CONSTRAINT dental_treatments_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: device_push_tokens device_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: device_push_tokens device_push_tokens_profile_id_push_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_profile_id_push_token_key UNIQUE (profile_id, push_token);


--
-- Name: dispenses dispenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_pkey PRIMARY KEY (id);


--
-- Name: drug_batches drug_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_batches
    ADD CONSTRAINT drug_batches_pkey PRIMARY KEY (id);


--
-- Name: drug_brands drug_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_brands
    ADD CONSTRAINT drug_brands_pkey PRIMARY KEY (id);


--
-- Name: drug_master drug_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_master
    ADD CONSTRAINT drug_master_pkey PRIMARY KEY (id);


--
-- Name: drugs drugs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drugs
    ADD CONSTRAINT drugs_pkey PRIMARY KEY (id);


--
-- Name: duty_roster duty_roster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_roster
    ADD CONSTRAINT duty_roster_pkey PRIMARY KEY (id);


--
-- Name: duty_roster duty_roster_profile_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_roster
    ADD CONSTRAINT duty_roster_profile_id_date_key UNIQUE (profile_id, date);


--
-- Name: emergency_cases emergency_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_cases
    ADD CONSTRAINT emergency_cases_pkey PRIMARY KEY (id);


--
-- Name: insurance_claims insurance_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_pkey PRIMARY KEY (id);


--
-- Name: insurance_policies insurance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: ipd_admin_schedule ipd_admin_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_admin_schedule
    ADD CONSTRAINT ipd_admin_schedule_pkey PRIMARY KEY (id);


--
-- Name: ipd_billing_config ipd_billing_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_billing_config
    ADD CONSTRAINT ipd_billing_config_pkey PRIMARY KEY (tenant_id);


--
-- Name: ipd_custom_charges ipd_custom_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_custom_charges
    ADD CONSTRAINT ipd_custom_charges_pkey PRIMARY KEY (id);


--
-- Name: ipd_medication_orders ipd_medication_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_medication_orders
    ADD CONSTRAINT ipd_medication_orders_pkey PRIMARY KEY (id);


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_pkey PRIMARY KEY (id);


--
-- Name: ipd_progress_notes ipd_progress_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_progress_notes
    ADD CONSTRAINT ipd_progress_notes_pkey PRIMARY KEY (id);


--
-- Name: lab_order_items lab_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items
    ADD CONSTRAINT lab_order_items_pkey PRIMARY KEY (id, created_at);


--
-- Name: lab_order_items_y2026m04 lab_order_items_y2026m04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items_y2026m04
    ADD CONSTRAINT lab_order_items_y2026m04_pkey PRIMARY KEY (id, created_at);


--
-- Name: lab_order_items_y2026m05 lab_order_items_y2026m05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items_y2026m05
    ADD CONSTRAINT lab_order_items_y2026m05_pkey PRIMARY KEY (id, created_at);


--
-- Name: lab_order_items_y2026m06 lab_order_items_y2026m06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items_y2026m06
    ADD CONSTRAINT lab_order_items_y2026m06_pkey PRIMARY KEY (id, created_at);


--
-- Name: lab_order_items_y2026m07 lab_order_items_y2026m07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items_y2026m07
    ADD CONSTRAINT lab_order_items_y2026m07_pkey PRIMARY KEY (id, created_at);


--
-- Name: lab_order_items_y2026m08 lab_order_items_y2026m08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_items_y2026m08
    ADD CONSTRAINT lab_order_items_y2026m08_pkey PRIMARY KEY (id, created_at);


--
-- Name: lab_orders lab_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_pkey PRIMARY KEY (id);


--
-- Name: lab_tests_catalog lab_tests_catalog_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests_catalog
    ADD CONSTRAINT lab_tests_catalog_code_key UNIQUE (code);


--
-- Name: lab_tests_catalog lab_tests_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests_catalog
    ADD CONSTRAINT lab_tests_catalog_pkey PRIMARY KEY (id);


--
-- Name: lab_tests_master lab_tests_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests_master
    ADD CONSTRAINT lab_tests_master_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_key_tenant_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_key_tenant_unique UNIQUE (key, tenant_id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: ot_consumables ot_consumables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_consumables
    ADD CONSTRAINT ot_consumables_pkey PRIMARY KEY (id);


--
-- Name: ot_rooms ot_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_rooms
    ADD CONSTRAINT ot_rooms_pkey PRIMARY KEY (id);


--
-- Name: ot_schedules ot_schedules_ot_room_id_tstzrange_excl; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_ot_room_id_tstzrange_excl EXCLUDE USING gist (ot_room_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&) WHERE ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text])));


--
-- Name: ot_schedules ot_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_pkey PRIMARY KEY (id);


--
-- Name: ot_team_members ot_team_members_ot_schedule_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_team_members
    ADD CONSTRAINT ot_team_members_ot_schedule_id_profile_id_key UNIQUE (ot_schedule_id, profile_id);


--
-- Name: ot_team_members ot_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_team_members
    ADD CONSTRAINT ot_team_members_pkey PRIMARY KEY (id);


--
-- Name: patient_allergies patient_allergies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_pkey PRIMARY KEY (id);


--
-- Name: patient_dental_chart patient_dental_chart_patient_id_tooth_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_dental_chart
    ADD CONSTRAINT patient_dental_chart_patient_id_tooth_number_key UNIQUE (patient_id, tooth_number);


--
-- Name: patient_dental_chart patient_dental_chart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_dental_chart
    ADD CONSTRAINT patient_dental_chart_pkey PRIMARY KEY (id);


--
-- Name: patient_documents patient_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_sale_items pharmacy_sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sale_items
    ADD CONSTRAINT pharmacy_sale_items_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_sales pharmacy_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sales
    ADD CONSTRAINT pharmacy_sales_pkey PRIMARY KEY (id);


--
-- Name: platform_admin_audit platform_admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit
    ADD CONSTRAINT platform_admin_audit_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: po_items po_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT po_items_pkey PRIMARY KEY (id);


--
-- Name: po_no_seq po_no_seq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_no_seq
    ADD CONSTRAINT po_no_seq_pkey PRIMARY KEY (tenant_id, year);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: procedure_tariffs procedure_tariffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedure_tariffs
    ADD CONSTRAINT procedure_tariffs_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: radiology_catalog radiology_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_catalog
    ADD CONSTRAINT radiology_catalog_pkey PRIMARY KEY (id);


--
-- Name: radiology_master radiology_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_master
    ADD CONSTRAINT radiology_master_pkey PRIMARY KEY (id);


--
-- Name: radiology_orders radiology_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_profile_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_profile_id_date_key UNIQUE (profile_id, date);


--
-- Name: staff_profiles staff_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (profile_id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_tenant_id_key UNIQUE (tenant_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tariffs tariffs_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariffs
    ADD CONSTRAINT tariffs_key_key UNIQUE (key);


--
-- Name: tariffs tariffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariffs
    ADD CONSTRAINT tariffs_pkey PRIMARY KEY (id);


--
-- Name: tenant_profiles tenant_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_profiles
    ADD CONSTRAINT tenant_profiles_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenants tenants_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_custom_domain_key UNIQUE (custom_domain);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: uhid_counter uhid_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uhid_counter
    ADD CONSTRAINT uhid_counter_pkey PRIMARY KEY (tenant_id, year);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id, visit_date);


--
-- Name: visits_y2026m04 visits_y2026m04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits_y2026m04
    ADD CONSTRAINT visits_y2026m04_pkey PRIMARY KEY (id, visit_date);


--
-- Name: visits_y2026m05 visits_y2026m05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits_y2026m05
    ADD CONSTRAINT visits_y2026m05_pkey PRIMARY KEY (id, visit_date);


--
-- Name: visits_y2026m06 visits_y2026m06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits_y2026m06
    ADD CONSTRAINT visits_y2026m06_pkey PRIMARY KEY (id, visit_date);


--
-- Name: visits_y2026m07 visits_y2026m07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits_y2026m07
    ADD CONSTRAINT visits_y2026m07_pkey PRIMARY KEY (id, visit_date);


--
-- Name: visits_y2026m08 visits_y2026m08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits_y2026m08
    ADD CONSTRAINT visits_y2026m08_pkey PRIMARY KEY (id, visit_date);


--
-- Name: ward_room_types ward_room_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_room_types
    ADD CONSTRAINT ward_room_types_pkey PRIMARY KEY (id);


--
-- Name: ward_room_types ward_room_types_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_room_types
    ADD CONSTRAINT ward_room_types_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: wards wards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_pkey PRIMARY KEY (id);


--
-- Name: admission_advance_refunds_admission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admission_advance_refunds_admission_idx ON public.admission_advance_refunds USING btree (admission_id);


--
-- Name: admission_advances_admission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admission_advances_admission_idx ON public.admission_advances USING btree (admission_id);


--
-- Name: admissions_bed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admissions_bed_idx ON public.admissions USING btree (bed_id);


--
-- Name: admissions_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admissions_patient_idx ON public.admissions USING btree (patient_id);


--
-- Name: admissions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admissions_status_idx ON public.admissions USING btree (status);


--
-- Name: idx_appt_doctor_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_doctor_scheduled ON ONLY public.appointments USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx ON public.appointments_y2026m04 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: idx_appointments_doctor_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_doctor_scheduled ON ONLY public.appointments USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx1 ON public.appointments_y2026m04 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: idx_appt_patient_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_patient_scheduled ON ONLY public.appointments USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx ON public.appointments_y2026m04 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: idx_appointments_patient_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient_scheduled ON ONLY public.appointments USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx1 ON public.appointments_y2026m04 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: idx_appt_tenant_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_tenant_scheduled ON ONLY public.appointments USING btree (tenant_id, scheduled_at);


--
-- Name: appointments_y2026m04_tenant_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_scheduled_at_idx ON public.appointments_y2026m04 USING btree (tenant_id, scheduled_at);


--
-- Name: idx_appt_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_status_scheduled ON ONLY public.appointments USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m04_tenant_id_status_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_status_scheduled_at_idx ON public.appointments_y2026m04 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: idx_appointments_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_status_scheduled ON ONLY public.appointments USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m04_tenant_id_status_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m04_tenant_id_status_scheduled_at_idx1 ON public.appointments_y2026m04 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx ON public.appointments_y2026m05 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx1 ON public.appointments_y2026m05 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx ON public.appointments_y2026m05 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx1 ON public.appointments_y2026m05 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m05_tenant_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_scheduled_at_idx ON public.appointments_y2026m05 USING btree (tenant_id, scheduled_at);


--
-- Name: appointments_y2026m05_tenant_id_status_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_status_scheduled_at_idx ON public.appointments_y2026m05 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m05_tenant_id_status_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m05_tenant_id_status_scheduled_at_idx1 ON public.appointments_y2026m05 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx ON public.appointments_y2026m06 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx1 ON public.appointments_y2026m06 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx ON public.appointments_y2026m06 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx1 ON public.appointments_y2026m06 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m06_tenant_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_scheduled_at_idx ON public.appointments_y2026m06 USING btree (tenant_id, scheduled_at);


--
-- Name: appointments_y2026m06_tenant_id_status_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_status_scheduled_at_idx ON public.appointments_y2026m06 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m06_tenant_id_status_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m06_tenant_id_status_scheduled_at_idx1 ON public.appointments_y2026m06 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx ON public.appointments_y2026m07 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx1 ON public.appointments_y2026m07 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx ON public.appointments_y2026m07 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx1 ON public.appointments_y2026m07 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m07_tenant_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_scheduled_at_idx ON public.appointments_y2026m07 USING btree (tenant_id, scheduled_at);


--
-- Name: appointments_y2026m07_tenant_id_status_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_status_scheduled_at_idx ON public.appointments_y2026m07 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m07_tenant_id_status_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m07_tenant_id_status_scheduled_at_idx1 ON public.appointments_y2026m07 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx ON public.appointments_y2026m08 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx1 ON public.appointments_y2026m08 USING btree (tenant_id, doctor_id, scheduled_at);


--
-- Name: appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx ON public.appointments_y2026m08 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx1 ON public.appointments_y2026m08 USING btree (tenant_id, patient_id, scheduled_at DESC);


--
-- Name: appointments_y2026m08_tenant_id_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_scheduled_at_idx ON public.appointments_y2026m08 USING btree (tenant_id, scheduled_at);


--
-- Name: appointments_y2026m08_tenant_id_status_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_status_scheduled_at_idx ON public.appointments_y2026m08 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: appointments_y2026m08_tenant_id_status_scheduled_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appointments_y2026m08_tenant_id_status_scheduled_at_idx1 ON public.appointments_y2026m08 USING btree (tenant_id, status, scheduled_at) WHERE (status = ANY (ARRAY['booked'::text, 'checked_in'::text]));


--
-- Name: attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_date_idx ON public.staff_attendance USING btree (date);


--
-- Name: attendance_profile_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_profile_date_idx ON public.staff_attendance USING btree (profile_id, date);


--
-- Name: idx_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor ON ONLY public.audit_logs USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m04_tenant_id_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m04_tenant_id_actor_id_created_at_idx ON public.audit_logs_y2026m04 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: idx_audit_tenant_actor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_actor_created ON ONLY public.audit_logs USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m04_tenant_id_actor_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m04_tenant_id_actor_id_created_at_idx1 ON public.audit_logs_y2026m04 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: idx_audit_logs_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_tenant_created ON ONLY public.audit_logs USING btree (tenant_id, created_at DESC);


--
-- Name: audit_logs_y2026m04_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m04_tenant_id_created_at_idx ON public.audit_logs_y2026m04 USING btree (tenant_id, created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON ONLY public.audit_logs USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx ON public.audit_logs_y2026m04 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: idx_audit_tenant_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_entity ON ONLY public.audit_logs USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx1 ON public.audit_logs_y2026m04 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m05_tenant_id_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m05_tenant_id_actor_id_created_at_idx ON public.audit_logs_y2026m05 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m05_tenant_id_actor_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m05_tenant_id_actor_id_created_at_idx1 ON public.audit_logs_y2026m05 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m05_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m05_tenant_id_created_at_idx ON public.audit_logs_y2026m05 USING btree (tenant_id, created_at DESC);


--
-- Name: audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx ON public.audit_logs_y2026m05 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx1 ON public.audit_logs_y2026m05 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m06_tenant_id_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m06_tenant_id_actor_id_created_at_idx ON public.audit_logs_y2026m06 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m06_tenant_id_actor_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m06_tenant_id_actor_id_created_at_idx1 ON public.audit_logs_y2026m06 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m06_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m06_tenant_id_created_at_idx ON public.audit_logs_y2026m06 USING btree (tenant_id, created_at DESC);


--
-- Name: audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx ON public.audit_logs_y2026m06 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx1 ON public.audit_logs_y2026m06 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m07_tenant_id_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m07_tenant_id_actor_id_created_at_idx ON public.audit_logs_y2026m07 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m07_tenant_id_actor_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m07_tenant_id_actor_id_created_at_idx1 ON public.audit_logs_y2026m07 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m07_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m07_tenant_id_created_at_idx ON public.audit_logs_y2026m07 USING btree (tenant_id, created_at DESC);


--
-- Name: audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx ON public.audit_logs_y2026m07 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx1 ON public.audit_logs_y2026m07 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m08_tenant_id_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m08_tenant_id_actor_id_created_at_idx ON public.audit_logs_y2026m08 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m08_tenant_id_actor_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m08_tenant_id_actor_id_created_at_idx1 ON public.audit_logs_y2026m08 USING btree (tenant_id, actor_id, created_at DESC);


--
-- Name: audit_logs_y2026m08_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m08_tenant_id_created_at_idx ON public.audit_logs_y2026m08 USING btree (tenant_id, created_at DESC);


--
-- Name: audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx ON public.audit_logs_y2026m08 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx1 ON public.audit_logs_y2026m08 USING btree (tenant_id, entity, entity_id, created_at DESC);


--
-- Name: batches_drug_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX batches_drug_expiry_idx ON public.drug_batches USING btree (drug_id, expiry);


--
-- Name: beds_ward_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX beds_ward_status_idx ON public.beds USING btree (ward_id, status);


--
-- Name: idx_bill_items_bill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_items_bill ON ONLY public.bill_items USING btree (bill_id, created_at DESC);


--
-- Name: bill_items_y2026m04_bill_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m04_bill_id_created_at_idx ON public.bill_items_y2026m04 USING btree (bill_id, created_at DESC);


--
-- Name: idx_bill_items_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_items_ref ON ONLY public.bill_items USING btree (ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: bill_items_y2026m04_ref_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m04_ref_id_idx ON public.bill_items_y2026m04 USING btree (ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: idx_bill_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_items_tenant ON ONLY public.bill_items USING btree (tenant_id, created_at DESC);


--
-- Name: bill_items_y2026m04_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m04_tenant_id_created_at_idx ON public.bill_items_y2026m04 USING btree (tenant_id, created_at DESC);


--
-- Name: bill_items_y2026m05_bill_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m05_bill_id_created_at_idx ON public.bill_items_y2026m05 USING btree (bill_id, created_at DESC);


--
-- Name: bill_items_y2026m05_ref_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m05_ref_id_idx ON public.bill_items_y2026m05 USING btree (ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: bill_items_y2026m05_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m05_tenant_id_created_at_idx ON public.bill_items_y2026m05 USING btree (tenant_id, created_at DESC);


--
-- Name: bill_items_y2026m06_bill_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m06_bill_id_created_at_idx ON public.bill_items_y2026m06 USING btree (bill_id, created_at DESC);


--
-- Name: bill_items_y2026m06_ref_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m06_ref_id_idx ON public.bill_items_y2026m06 USING btree (ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: bill_items_y2026m06_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m06_tenant_id_created_at_idx ON public.bill_items_y2026m06 USING btree (tenant_id, created_at DESC);


--
-- Name: bill_items_y2026m07_bill_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m07_bill_id_created_at_idx ON public.bill_items_y2026m07 USING btree (bill_id, created_at DESC);


--
-- Name: bill_items_y2026m07_ref_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m07_ref_id_idx ON public.bill_items_y2026m07 USING btree (ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: bill_items_y2026m07_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m07_tenant_id_created_at_idx ON public.bill_items_y2026m07 USING btree (tenant_id, created_at DESC);


--
-- Name: bill_items_y2026m08_bill_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m08_bill_id_created_at_idx ON public.bill_items_y2026m08 USING btree (bill_id, created_at DESC);


--
-- Name: bill_items_y2026m08_ref_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m08_ref_id_idx ON public.bill_items_y2026m08 USING btree (ref_id) WHERE (ref_id IS NOT NULL);


--
-- Name: bill_items_y2026m08_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bill_items_y2026m08_tenant_id_created_at_idx ON public.bill_items_y2026m08 USING btree (tenant_id, created_at DESC);


--
-- Name: bills_appointment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bills_appointment_idx ON public.bills USING btree (appointment_id);


--
-- Name: bills_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bills_patient_idx ON public.bills USING btree (patient_id);


--
-- Name: bills_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bills_status_idx ON public.bills USING btree (status);


--
-- Name: bills_tenant_bill_no_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bills_tenant_bill_no_unique ON public.bills USING btree (tenant_id, bill_no);


--
-- Name: bills_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bills_visit_idx ON public.bills USING btree (visit_id);


--
-- Name: blood_issues_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blood_issues_patient_idx ON public.blood_issues USING btree (patient_id);


--
-- Name: blood_issues_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blood_issues_request_idx ON public.blood_issues USING btree (request_id);


--
-- Name: blood_requests_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blood_requests_patient_idx ON public.blood_requests USING btree (patient_id);


--
-- Name: blood_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blood_requests_status_idx ON public.blood_requests USING btree (status);


--
-- Name: blood_units_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blood_units_expiry_idx ON public.blood_units USING btree (expiry);


--
-- Name: blood_units_inventory_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blood_units_inventory_idx ON public.blood_units USING btree (blood_group, component, status);


--
-- Name: dispenses_admission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispenses_admission_idx ON public.dispenses USING btree (admission_id);


--
-- Name: dispenses_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispenses_patient_idx ON public.dispenses USING btree (patient_id);


--
-- Name: dispenses_prescription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispenses_prescription_idx ON public.dispenses USING btree (prescription_id);


--
-- Name: drugs_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drugs_name_idx ON public.drugs USING btree (name);


--
-- Name: emergency_triage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX emergency_triage_idx ON public.emergency_cases USING btree (status, triage_level, arrived_at);


--
-- Name: idx_admissions_combined_bill_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admissions_combined_bill_no ON public.admissions USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: idx_admissions_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admissions_tenant_status ON public.admissions USING btree (tenant_id, status);


--
-- Name: idx_attendance_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_tenant_date ON public.staff_attendance USING btree (tenant_id, date);


--
-- Name: idx_auth_otp_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_profile ON public.auth_otp_codes USING btree (profile_id, created_at DESC);


--
-- Name: idx_batches_drug_id_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_drug_id_tenant ON public.drug_batches USING btree (drug_id, tenant_id, expiry) WHERE (drug_id IS NOT NULL);


--
-- Name: idx_batches_drug_master_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_drug_master_tenant ON public.drug_batches USING btree (drug_master_id, tenant_id, expiry) WHERE (drug_master_id IS NOT NULL);


--
-- Name: idx_beds_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beds_tenant_status ON public.beds USING btree (tenant_id, status);


--
-- Name: idx_bills_admission_billing_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_admission_billing_date ON public.bills USING btree (tenant_id, admission_id, billing_date) WHERE (billing_date IS NOT NULL);


--
-- Name: idx_bills_bill_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_bill_source ON public.bills USING btree (tenant_id, bill_source, billing_date) WHERE (bill_source IS NOT NULL);


--
-- Name: idx_bills_consolidated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_consolidated_by ON public.bills USING btree (consolidated_by) WHERE (consolidated_by IS NOT NULL);


--
-- Name: idx_bills_ipd_daily_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bills_ipd_daily_dedup ON public.bills USING btree (tenant_id, admission_id, billing_date, bill_source) WHERE ((admission_id IS NOT NULL) AND (billing_date IS NOT NULL) AND (bill_source IS NOT NULL) AND (status <> 'cancelled'::text));


--
-- Name: idx_bills_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_tenant_date ON public.bills USING btree (tenant_id, created_at);


--
-- Name: idx_bills_tenant_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_tenant_patient ON public.bills USING btree (tenant_id, patient_id, created_at DESC);


--
-- Name: idx_bills_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_tenant_status ON public.bills USING btree (tenant_id, status);


--
-- Name: idx_bills_tenant_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_tenant_status_created ON public.bills USING btree (tenant_id, status, created_at DESC);


--
-- Name: idx_dental_chart_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dental_chart_patient ON public.patient_dental_chart USING btree (patient_id);


--
-- Name: idx_dental_recalls_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dental_recalls_date ON public.dental_recalls USING btree (recall_date) WHERE (status = 'pending'::text);


--
-- Name: idx_dental_recalls_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dental_recalls_patient ON public.dental_recalls USING btree (patient_id, recall_date);


--
-- Name: idx_dental_treatments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dental_treatments_patient ON public.dental_treatments USING btree (patient_id, created_at DESC);


--
-- Name: idx_dental_treatments_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dental_treatments_visit ON public.dental_treatments USING btree (visit_id);


--
-- Name: idx_departments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_tenant ON public.departments USING btree (tenant_id);


--
-- Name: idx_device_tokens_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tokens_profile ON public.device_push_tokens USING btree (profile_id);


--
-- Name: idx_device_tokens_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tokens_tenant ON public.device_push_tokens USING btree (tenant_id);


--
-- Name: idx_drug_batches_tenant_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drug_batches_tenant_expiry ON public.drug_batches USING btree (tenant_id, expiry) WHERE (qty_available > 0);


--
-- Name: idx_drug_batches_tenant_low_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drug_batches_tenant_low_stock ON public.drug_batches USING btree (tenant_id, qty_available) WHERE (qty_available < 10);


--
-- Name: idx_drug_brands_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drug_brands_master ON public.drug_brands USING btree (drug_master_id);


--
-- Name: idx_drug_brands_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drug_brands_name ON public.drug_brands USING btree (brand_name text_pattern_ops);


--
-- Name: idx_drug_master_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drug_master_category ON public.drug_master USING btree (category);


--
-- Name: idx_drug_master_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drug_master_name ON public.drug_master USING btree (name text_pattern_ops);


--
-- Name: idx_duty_roster_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_duty_roster_tenant_date ON public.duty_roster USING btree (tenant_id, date);


--
-- Name: idx_emergency_tenant_arrived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emergency_tenant_arrived ON public.emergency_cases USING btree (tenant_id, arrived_at DESC);


--
-- Name: idx_emergency_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emergency_tenant_status ON public.emergency_cases USING btree (tenant_id, status);


--
-- Name: idx_emergency_tenant_triage_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emergency_tenant_triage_status ON public.emergency_cases USING btree (tenant_id, triage_level, status);


--
-- Name: idx_inv_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_items_tenant ON public.inventory_items USING btree (tenant_id);


--
-- Name: idx_inventory_tenant_low_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_tenant_low_stock ON public.inventory_items USING btree (tenant_id, qty_in_stock, reorder_level) WHERE (is_active = true);


--
-- Name: idx_ipd_med_orders_drug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipd_med_orders_drug ON public.ipd_medication_orders USING btree (drug_id) WHERE (drug_id IS NOT NULL);


--
-- Name: idx_ipd_med_orders_drug_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipd_med_orders_drug_master ON public.ipd_medication_orders USING btree (drug_master_id) WHERE (drug_master_id IS NOT NULL);


--
-- Name: idx_ipd_pharm_req_drug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipd_pharm_req_drug ON public.ipd_pharmacy_requests USING btree (drug_id) WHERE (drug_id IS NOT NULL);


--
-- Name: idx_ipd_pharm_req_drug_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipd_pharm_req_drug_master ON public.ipd_pharmacy_requests USING btree (drug_master_id) WHERE (drug_master_id IS NOT NULL);


--
-- Name: idx_ipd_pharmacy_req_billing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipd_pharmacy_req_billing ON public.ipd_pharmacy_requests USING btree (admission_id, billing_status, status);


--
-- Name: idx_lab_catalog_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_catalog_master ON public.lab_tests_catalog USING btree (lab_master_id) WHERE (lab_master_id IS NOT NULL);


--
-- Name: idx_lab_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_items_order ON ONLY public.lab_order_items USING btree (lab_order_id, created_at DESC);


--
-- Name: idx_lab_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_items_tenant ON ONLY public.lab_order_items USING btree (tenant_id, created_at DESC);


--
-- Name: idx_lab_items_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_items_test ON ONLY public.lab_order_items USING btree (tenant_id, test_id, created_at DESC);


--
-- Name: idx_lab_orders_tenant_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_orders_tenant_patient ON public.lab_orders USING btree (tenant_id, patient_id, ordered_at DESC);


--
-- Name: idx_lab_orders_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_orders_tenant_status ON public.lab_orders USING btree (tenant_id, status);


--
-- Name: idx_notifications_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_tenant_date ON public.notifications USING btree (tenant_id, created_at);


--
-- Name: idx_nurse_assignments_admission_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nurse_assignments_admission_date ON public.admission_nurse_assignments USING btree (tenant_id, admission_id, assigned_date);


--
-- Name: idx_ot_schedules_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_schedules_admission ON public.ot_schedules USING btree (admission_id) WHERE (admission_id IS NOT NULL);


--
-- Name: idx_ot_schedules_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_schedules_tenant_date ON public.ot_schedules USING btree (tenant_id, scheduled_start);


--
-- Name: idx_ot_team_members_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_team_members_schedule ON public.ot_team_members USING btree (ot_schedule_id);


--
-- Name: idx_paa_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paa_admin ON public.platform_admin_audit USING btree (admin_id, created_at DESC);


--
-- Name: idx_paa_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paa_created ON public.platform_admin_audit USING btree (created_at DESC);


--
-- Name: idx_paa_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paa_tenant ON public.platform_admin_audit USING btree (target_tenant_id, created_at DESC);


--
-- Name: idx_patient_allergies_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_allergies_tenant ON public.patient_allergies USING btree (tenant_id, patient_id);


--
-- Name: idx_patient_docs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_docs_tenant ON public.patient_documents USING btree (tenant_id, patient_id);


--
-- Name: idx_patients_aadhaar_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_patients_aadhaar_tenant ON public.patients USING btree (tenant_id, aadhaar_no) WHERE (aadhaar_no IS NOT NULL);


--
-- Name: idx_patients_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_tenant ON public.patients USING btree (tenant_id);


--
-- Name: idx_patients_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_tenant_created ON public.patients USING btree (tenant_id, created_at DESC);


--
-- Name: idx_patients_tenant_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_tenant_name_trgm ON public.patients USING gin (full_name extensions.gin_trgm_ops);


--
-- Name: idx_patients_tenant_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_tenant_phone ON public.patients USING btree (tenant_id, phone);


--
-- Name: idx_payments_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant_date ON public.payments USING btree (tenant_id, received_at);


--
-- Name: idx_payments_tenant_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant_received ON public.payments USING btree (tenant_id, received_at DESC);


--
-- Name: idx_po_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_tenant_status ON public.purchase_orders USING btree (tenant_id, status);


--
-- Name: idx_prescriptions_tenant_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prescriptions_tenant_visit ON public.prescriptions USING btree (tenant_id, visit_id);


--
-- Name: idx_profiles_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tenant ON public.profiles USING btree (tenant_id);


--
-- Name: idx_rad_orders_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rad_orders_tenant_status ON public.radiology_orders USING btree (tenant_id, status);


--
-- Name: idx_radiology_catalog_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radiology_catalog_master ON public.radiology_catalog USING btree (radiology_master_id) WHERE (radiology_master_id IS NOT NULL);


--
-- Name: idx_radiology_orders_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radiology_orders_tenant_status ON public.radiology_orders USING btree (tenant_id, status, ordered_at DESC);


--
-- Name: idx_stock_mvmt_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mvmt_tenant_date ON public.stock_movements USING btree (tenant_id, created_at);


--
-- Name: idx_visits_appt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_appt_id ON ONLY public.visits USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: idx_visits_combined_bill_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_combined_bill_no ON ONLY public.visits USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: idx_visits_doctor_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_doctor_date ON ONLY public.visits USING btree (tenant_id, doctor_id, visit_date DESC);


--
-- Name: idx_visits_patient_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_patient_date ON ONLY public.visits USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: idx_visits_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_tenant_date ON ONLY public.visits USING btree (tenant_id, visit_date DESC);


--
-- Name: idx_visits_tenant_patient_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_tenant_patient_date ON ONLY public.visits USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: idx_ward_room_types_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ward_room_types_tenant ON public.ward_room_types USING btree (tenant_id);


--
-- Name: idx_wards_room_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wards_room_type ON public.wards USING btree (room_type_id) WHERE (room_type_id IS NOT NULL);


--
-- Name: idx_wards_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wards_tenant ON public.wards USING btree (tenant_id);


--
-- Name: insurance_claims_bill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_claims_bill_idx ON public.insurance_claims USING btree (bill_id);


--
-- Name: insurance_claims_policy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_claims_policy_idx ON public.insurance_claims USING btree (policy_id);


--
-- Name: insurance_claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_claims_status_idx ON public.insurance_claims USING btree (status);


--
-- Name: insurance_policies_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insurance_policies_patient_idx ON public.insurance_policies USING btree (patient_id);


--
-- Name: inventory_items_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_items_category_idx ON public.inventory_items USING btree (category);


--
-- Name: inventory_items_low_stock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_items_low_stock_idx ON public.inventory_items USING btree (qty_in_stock, reorder_level);


--
-- Name: ipd_admin_schedule_admission_id_due_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_admin_schedule_admission_id_due_at_idx ON public.ipd_admin_schedule USING btree (admission_id, due_at);


--
-- Name: ipd_admin_schedule_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_admin_schedule_order_id_idx ON public.ipd_admin_schedule USING btree (order_id);


--
-- Name: ipd_admin_schedule_tenant_id_status_due_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_admin_schedule_tenant_id_status_due_at_idx ON public.ipd_admin_schedule USING btree (tenant_id, status, due_at);


--
-- Name: ipd_medication_orders_admission_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_medication_orders_admission_id_status_idx ON public.ipd_medication_orders USING btree (admission_id, status);


--
-- Name: ipd_medication_orders_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_medication_orders_tenant_id_created_at_idx ON public.ipd_medication_orders USING btree (tenant_id, created_at DESC);


--
-- Name: ipd_notes_admission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_notes_admission_idx ON public.ipd_progress_notes USING btree (admission_id);


--
-- Name: ipd_pharmacy_requests_admission_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_pharmacy_requests_admission_id_status_idx ON public.ipd_pharmacy_requests USING btree (admission_id, status);


--
-- Name: ipd_pharmacy_requests_tenant_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ipd_pharmacy_requests_tenant_id_status_created_at_idx ON public.ipd_pharmacy_requests USING btree (tenant_id, status, created_at DESC);


--
-- Name: lab_order_items_y2026m04_lab_order_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m04_lab_order_id_created_at_idx ON public.lab_order_items_y2026m04 USING btree (lab_order_id, created_at DESC);


--
-- Name: lab_order_items_y2026m04_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m04_tenant_id_created_at_idx ON public.lab_order_items_y2026m04 USING btree (tenant_id, created_at DESC);


--
-- Name: lab_order_items_y2026m04_tenant_id_test_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m04_tenant_id_test_id_created_at_idx ON public.lab_order_items_y2026m04 USING btree (tenant_id, test_id, created_at DESC);


--
-- Name: lab_order_items_y2026m05_lab_order_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m05_lab_order_id_created_at_idx ON public.lab_order_items_y2026m05 USING btree (lab_order_id, created_at DESC);


--
-- Name: lab_order_items_y2026m05_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m05_tenant_id_created_at_idx ON public.lab_order_items_y2026m05 USING btree (tenant_id, created_at DESC);


--
-- Name: lab_order_items_y2026m05_tenant_id_test_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m05_tenant_id_test_id_created_at_idx ON public.lab_order_items_y2026m05 USING btree (tenant_id, test_id, created_at DESC);


--
-- Name: lab_order_items_y2026m06_lab_order_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m06_lab_order_id_created_at_idx ON public.lab_order_items_y2026m06 USING btree (lab_order_id, created_at DESC);


--
-- Name: lab_order_items_y2026m06_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m06_tenant_id_created_at_idx ON public.lab_order_items_y2026m06 USING btree (tenant_id, created_at DESC);


--
-- Name: lab_order_items_y2026m06_tenant_id_test_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m06_tenant_id_test_id_created_at_idx ON public.lab_order_items_y2026m06 USING btree (tenant_id, test_id, created_at DESC);


--
-- Name: lab_order_items_y2026m07_lab_order_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m07_lab_order_id_created_at_idx ON public.lab_order_items_y2026m07 USING btree (lab_order_id, created_at DESC);


--
-- Name: lab_order_items_y2026m07_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m07_tenant_id_created_at_idx ON public.lab_order_items_y2026m07 USING btree (tenant_id, created_at DESC);


--
-- Name: lab_order_items_y2026m07_tenant_id_test_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m07_tenant_id_test_id_created_at_idx ON public.lab_order_items_y2026m07 USING btree (tenant_id, test_id, created_at DESC);


--
-- Name: lab_order_items_y2026m08_lab_order_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m08_lab_order_id_created_at_idx ON public.lab_order_items_y2026m08 USING btree (lab_order_id, created_at DESC);


--
-- Name: lab_order_items_y2026m08_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m08_tenant_id_created_at_idx ON public.lab_order_items_y2026m08 USING btree (tenant_id, created_at DESC);


--
-- Name: lab_order_items_y2026m08_tenant_id_test_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_items_y2026m08_tenant_id_test_id_created_at_idx ON public.lab_order_items_y2026m08 USING btree (tenant_id, test_id, created_at DESC);


--
-- Name: lab_orders_admission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_orders_admission_idx ON public.lab_orders USING btree (admission_id);


--
-- Name: lab_orders_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_orders_patient_idx ON public.lab_orders USING btree (patient_id);


--
-- Name: lab_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_orders_status_idx ON public.lab_orders USING btree (status);


--
-- Name: lab_orders_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_orders_visit_idx ON public.lab_orders USING btree (visit_id);


--
-- Name: mv_bed_occupancy_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_bed_occupancy_pk ON public.mv_bed_occupancy_by_tenant USING btree (tenant_id);


--
-- Name: mv_daily_footfall_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_daily_footfall_pk ON public.mv_daily_footfall_by_tenant USING btree (tenant_id, day);


--
-- Name: mv_daily_revenue_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_daily_revenue_pk ON public.mv_daily_revenue_by_tenant USING btree (tenant_id, day);


--
-- Name: mv_lowstock_alerts_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_lowstock_alerts_pk ON public.mv_lowstock_alerts_by_tenant USING btree (tenant_id);


--
-- Name: mv_pending_bills_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_pending_bills_pk ON public.mv_pending_bills_by_tenant USING btree (tenant_id);


--
-- Name: notifications_patient_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_patient_created ON public.notifications USING btree (patient_id, created_at);


--
-- Name: notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_status ON public.notifications USING btree (status);


--
-- Name: ot_consumables_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ot_consumables_schedule_idx ON public.ot_consumables USING btree (ot_schedule_id);


--
-- Name: ot_schedules_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ot_schedules_patient_idx ON public.ot_schedules USING btree (patient_id);


--
-- Name: ot_schedules_room_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ot_schedules_room_date_idx ON public.ot_schedules USING btree (ot_room_id, scheduled_start);


--
-- Name: ot_schedules_surgeon_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ot_schedules_surgeon_idx ON public.ot_schedules USING btree (surgeon_id);


--
-- Name: patient_allergies_patient_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patient_allergies_patient_id_idx ON public.patient_allergies USING btree (patient_id);


--
-- Name: patient_documents_patient_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patient_documents_patient_id_idx ON public.patient_documents USING btree (patient_id);


--
-- Name: patients_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patients_name_idx ON public.patients USING btree (full_name);


--
-- Name: patients_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patients_phone_idx ON public.patients USING btree (phone);


--
-- Name: patients_tenant_uhid_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX patients_tenant_uhid_unique ON public.patients USING btree (tenant_id, uhid);


--
-- Name: patients_uhid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patients_uhid_idx ON public.patients USING btree (uhid);


--
-- Name: payments_bill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_bill_idx ON public.payments USING btree (bill_id);


--
-- Name: pharmacy_sale_items_drug_master_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_sale_items_drug_master_idx ON public.pharmacy_sale_items USING btree (drug_master_id) WHERE (drug_master_id IS NOT NULL);


--
-- Name: pharmacy_sale_items_sale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_sale_items_sale_idx ON public.pharmacy_sale_items USING btree (pharmacy_sale_id);


--
-- Name: pharmacy_sales_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_sales_patient_idx ON public.pharmacy_sales USING btree (patient_id);


--
-- Name: pharmacy_sales_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_sales_status_idx ON public.pharmacy_sales USING btree (status);


--
-- Name: pharmacy_sales_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_sales_visit_idx ON public.pharmacy_sales USING btree (visit_id);


--
-- Name: po_items_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_items_po_idx ON public.po_items USING btree (po_id);


--
-- Name: po_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_status_idx ON public.purchase_orders USING btree (status);


--
-- Name: po_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_supplier_idx ON public.purchase_orders USING btree (supplier_id);


--
-- Name: po_tenant_po_no_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX po_tenant_po_no_unique ON public.purchase_orders USING btree (tenant_id, po_no);


--
-- Name: prescriptions_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescriptions_visit_idx ON public.prescriptions USING btree (visit_id);


--
-- Name: procedure_tariffs_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX procedure_tariffs_tenant_idx ON public.procedure_tariffs USING btree (tenant_id);


--
-- Name: radiology_orders_admission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radiology_orders_admission_idx ON public.radiology_orders USING btree (admission_id);


--
-- Name: radiology_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radiology_patient_idx ON public.radiology_orders USING btree (patient_id);


--
-- Name: radiology_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radiology_status_idx ON public.radiology_orders USING btree (status);


--
-- Name: radiology_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radiology_visit_idx ON public.radiology_orders USING btree (visit_id);


--
-- Name: roster_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roster_date_idx ON public.duty_roster USING btree (date);


--
-- Name: roster_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roster_profile_idx ON public.duty_roster USING btree (profile_id);


--
-- Name: stock_movements_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_date_idx ON public.stock_movements USING btree (created_at);


--
-- Name: stock_movements_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_item_idx ON public.stock_movements USING btree (item_id);


--
-- Name: visits_y2026m04_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m04_appointment_id_idx ON public.visits_y2026m04 USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: visits_y2026m04_combined_bill_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m04_combined_bill_no_idx ON public.visits_y2026m04 USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: visits_y2026m04_tenant_id_doctor_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m04_tenant_id_doctor_id_visit_date_idx ON public.visits_y2026m04 USING btree (tenant_id, doctor_id, visit_date DESC);


--
-- Name: visits_y2026m04_tenant_id_patient_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m04_tenant_id_patient_id_visit_date_idx ON public.visits_y2026m04 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m04_tenant_id_patient_id_visit_date_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m04_tenant_id_patient_id_visit_date_idx1 ON public.visits_y2026m04 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m04_tenant_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m04_tenant_id_visit_date_idx ON public.visits_y2026m04 USING btree (tenant_id, visit_date DESC);


--
-- Name: visits_y2026m05_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m05_appointment_id_idx ON public.visits_y2026m05 USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: visits_y2026m05_combined_bill_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m05_combined_bill_no_idx ON public.visits_y2026m05 USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: visits_y2026m05_tenant_id_doctor_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m05_tenant_id_doctor_id_visit_date_idx ON public.visits_y2026m05 USING btree (tenant_id, doctor_id, visit_date DESC);


--
-- Name: visits_y2026m05_tenant_id_patient_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m05_tenant_id_patient_id_visit_date_idx ON public.visits_y2026m05 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m05_tenant_id_patient_id_visit_date_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m05_tenant_id_patient_id_visit_date_idx1 ON public.visits_y2026m05 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m05_tenant_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m05_tenant_id_visit_date_idx ON public.visits_y2026m05 USING btree (tenant_id, visit_date DESC);


--
-- Name: visits_y2026m06_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m06_appointment_id_idx ON public.visits_y2026m06 USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: visits_y2026m06_combined_bill_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m06_combined_bill_no_idx ON public.visits_y2026m06 USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: visits_y2026m06_tenant_id_doctor_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m06_tenant_id_doctor_id_visit_date_idx ON public.visits_y2026m06 USING btree (tenant_id, doctor_id, visit_date DESC);


--
-- Name: visits_y2026m06_tenant_id_patient_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m06_tenant_id_patient_id_visit_date_idx ON public.visits_y2026m06 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m06_tenant_id_patient_id_visit_date_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m06_tenant_id_patient_id_visit_date_idx1 ON public.visits_y2026m06 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m06_tenant_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m06_tenant_id_visit_date_idx ON public.visits_y2026m06 USING btree (tenant_id, visit_date DESC);


--
-- Name: visits_y2026m07_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m07_appointment_id_idx ON public.visits_y2026m07 USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: visits_y2026m07_combined_bill_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m07_combined_bill_no_idx ON public.visits_y2026m07 USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: visits_y2026m07_tenant_id_doctor_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m07_tenant_id_doctor_id_visit_date_idx ON public.visits_y2026m07 USING btree (tenant_id, doctor_id, visit_date DESC);


--
-- Name: visits_y2026m07_tenant_id_patient_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m07_tenant_id_patient_id_visit_date_idx ON public.visits_y2026m07 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m07_tenant_id_patient_id_visit_date_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m07_tenant_id_patient_id_visit_date_idx1 ON public.visits_y2026m07 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m07_tenant_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m07_tenant_id_visit_date_idx ON public.visits_y2026m07 USING btree (tenant_id, visit_date DESC);


--
-- Name: visits_y2026m08_appointment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m08_appointment_id_idx ON public.visits_y2026m08 USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: visits_y2026m08_combined_bill_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m08_combined_bill_no_idx ON public.visits_y2026m08 USING btree (combined_bill_no) WHERE (combined_bill_no IS NOT NULL);


--
-- Name: visits_y2026m08_tenant_id_doctor_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m08_tenant_id_doctor_id_visit_date_idx ON public.visits_y2026m08 USING btree (tenant_id, doctor_id, visit_date DESC);


--
-- Name: visits_y2026m08_tenant_id_patient_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m08_tenant_id_patient_id_visit_date_idx ON public.visits_y2026m08 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m08_tenant_id_patient_id_visit_date_idx1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m08_tenant_id_patient_id_visit_date_idx1 ON public.visits_y2026m08 USING btree (tenant_id, patient_id, visit_date DESC);


--
-- Name: visits_y2026m08_tenant_id_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_y2026m08_tenant_id_visit_date_idx ON public.visits_y2026m08 USING btree (tenant_id, visit_date DESC);


--
-- Name: appointments_y2026m04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.appointments_pkey ATTACH PARTITION public.appointments_y2026m04_pkey;


--
-- Name: appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_doctor_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx;


--
-- Name: appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_doctor_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_doctor_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_patient_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx;


--
-- Name: appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_patient_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_patient_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m04_tenant_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_tenant_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_scheduled_at_idx;


--
-- Name: appointments_y2026m04_tenant_id_status_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_status_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_status_scheduled_at_idx;


--
-- Name: appointments_y2026m04_tenant_id_status_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_status_scheduled ATTACH PARTITION public.appointments_y2026m04_tenant_id_status_scheduled_at_idx1;


--
-- Name: appointments_y2026m05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.appointments_pkey ATTACH PARTITION public.appointments_y2026m05_pkey;


--
-- Name: appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_doctor_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx;


--
-- Name: appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_doctor_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_doctor_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_patient_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx;


--
-- Name: appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_patient_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_patient_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m05_tenant_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_tenant_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_scheduled_at_idx;


--
-- Name: appointments_y2026m05_tenant_id_status_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_status_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_status_scheduled_at_idx;


--
-- Name: appointments_y2026m05_tenant_id_status_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_status_scheduled ATTACH PARTITION public.appointments_y2026m05_tenant_id_status_scheduled_at_idx1;


--
-- Name: appointments_y2026m06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.appointments_pkey ATTACH PARTITION public.appointments_y2026m06_pkey;


--
-- Name: appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_doctor_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx;


--
-- Name: appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_doctor_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_doctor_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_patient_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx;


--
-- Name: appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_patient_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_patient_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m06_tenant_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_tenant_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_scheduled_at_idx;


--
-- Name: appointments_y2026m06_tenant_id_status_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_status_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_status_scheduled_at_idx;


--
-- Name: appointments_y2026m06_tenant_id_status_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_status_scheduled ATTACH PARTITION public.appointments_y2026m06_tenant_id_status_scheduled_at_idx1;


--
-- Name: appointments_y2026m07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.appointments_pkey ATTACH PARTITION public.appointments_y2026m07_pkey;


--
-- Name: appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_doctor_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx;


--
-- Name: appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_doctor_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_doctor_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_patient_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx;


--
-- Name: appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_patient_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_patient_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m07_tenant_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_tenant_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_scheduled_at_idx;


--
-- Name: appointments_y2026m07_tenant_id_status_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_status_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_status_scheduled_at_idx;


--
-- Name: appointments_y2026m07_tenant_id_status_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_status_scheduled ATTACH PARTITION public.appointments_y2026m07_tenant_id_status_scheduled_at_idx1;


--
-- Name: appointments_y2026m08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.appointments_pkey ATTACH PARTITION public.appointments_y2026m08_pkey;


--
-- Name: appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_doctor_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx;


--
-- Name: appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_doctor_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_doctor_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_patient_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx;


--
-- Name: appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_patient_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_patient_id_scheduled_at_idx1;


--
-- Name: appointments_y2026m08_tenant_id_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_tenant_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_scheduled_at_idx;


--
-- Name: appointments_y2026m08_tenant_id_status_scheduled_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appt_status_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_status_scheduled_at_idx;


--
-- Name: appointments_y2026m08_tenant_id_status_scheduled_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_appointments_status_scheduled ATTACH PARTITION public.appointments_y2026m08_tenant_id_status_scheduled_at_idx1;


--
-- Name: audit_logs_y2026m04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_y2026m04_pkey;


--
-- Name: audit_logs_y2026m04_tenant_id_actor_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_actor ATTACH PARTITION public.audit_logs_y2026m04_tenant_id_actor_id_created_at_idx;


--
-- Name: audit_logs_y2026m04_tenant_id_actor_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_actor_created ATTACH PARTITION public.audit_logs_y2026m04_tenant_id_actor_id_created_at_idx1;


--
-- Name: audit_logs_y2026m04_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_tenant_created ATTACH PARTITION public.audit_logs_y2026m04_tenant_id_created_at_idx;


--
-- Name: audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_entity ATTACH PARTITION public.audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx;


--
-- Name: audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_entity ATTACH PARTITION public.audit_logs_y2026m04_tenant_id_entity_entity_id_created_at_idx1;


--
-- Name: audit_logs_y2026m05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_y2026m05_pkey;


--
-- Name: audit_logs_y2026m05_tenant_id_actor_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_actor ATTACH PARTITION public.audit_logs_y2026m05_tenant_id_actor_id_created_at_idx;


--
-- Name: audit_logs_y2026m05_tenant_id_actor_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_actor_created ATTACH PARTITION public.audit_logs_y2026m05_tenant_id_actor_id_created_at_idx1;


--
-- Name: audit_logs_y2026m05_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_tenant_created ATTACH PARTITION public.audit_logs_y2026m05_tenant_id_created_at_idx;


--
-- Name: audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_entity ATTACH PARTITION public.audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx;


--
-- Name: audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_entity ATTACH PARTITION public.audit_logs_y2026m05_tenant_id_entity_entity_id_created_at_idx1;


--
-- Name: audit_logs_y2026m06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_y2026m06_pkey;


--
-- Name: audit_logs_y2026m06_tenant_id_actor_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_actor ATTACH PARTITION public.audit_logs_y2026m06_tenant_id_actor_id_created_at_idx;


--
-- Name: audit_logs_y2026m06_tenant_id_actor_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_actor_created ATTACH PARTITION public.audit_logs_y2026m06_tenant_id_actor_id_created_at_idx1;


--
-- Name: audit_logs_y2026m06_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_tenant_created ATTACH PARTITION public.audit_logs_y2026m06_tenant_id_created_at_idx;


--
-- Name: audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_entity ATTACH PARTITION public.audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx;


--
-- Name: audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_entity ATTACH PARTITION public.audit_logs_y2026m06_tenant_id_entity_entity_id_created_at_idx1;


--
-- Name: audit_logs_y2026m07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_y2026m07_pkey;


--
-- Name: audit_logs_y2026m07_tenant_id_actor_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_actor ATTACH PARTITION public.audit_logs_y2026m07_tenant_id_actor_id_created_at_idx;


--
-- Name: audit_logs_y2026m07_tenant_id_actor_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_actor_created ATTACH PARTITION public.audit_logs_y2026m07_tenant_id_actor_id_created_at_idx1;


--
-- Name: audit_logs_y2026m07_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_tenant_created ATTACH PARTITION public.audit_logs_y2026m07_tenant_id_created_at_idx;


--
-- Name: audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_entity ATTACH PARTITION public.audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx;


--
-- Name: audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_entity ATTACH PARTITION public.audit_logs_y2026m07_tenant_id_entity_entity_id_created_at_idx1;


--
-- Name: audit_logs_y2026m08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_y2026m08_pkey;


--
-- Name: audit_logs_y2026m08_tenant_id_actor_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_actor ATTACH PARTITION public.audit_logs_y2026m08_tenant_id_actor_id_created_at_idx;


--
-- Name: audit_logs_y2026m08_tenant_id_actor_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_actor_created ATTACH PARTITION public.audit_logs_y2026m08_tenant_id_actor_id_created_at_idx1;


--
-- Name: audit_logs_y2026m08_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_tenant_created ATTACH PARTITION public.audit_logs_y2026m08_tenant_id_created_at_idx;


--
-- Name: audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_logs_entity ATTACH PARTITION public.audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx;


--
-- Name: audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_audit_tenant_entity ATTACH PARTITION public.audit_logs_y2026m08_tenant_id_entity_entity_id_created_at_idx1;


--
-- Name: bill_items_y2026m04_bill_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_bill ATTACH PARTITION public.bill_items_y2026m04_bill_id_created_at_idx;


--
-- Name: bill_items_y2026m04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.bill_items_pkey ATTACH PARTITION public.bill_items_y2026m04_pkey;


--
-- Name: bill_items_y2026m04_ref_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_ref ATTACH PARTITION public.bill_items_y2026m04_ref_id_idx;


--
-- Name: bill_items_y2026m04_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_tenant ATTACH PARTITION public.bill_items_y2026m04_tenant_id_created_at_idx;


--
-- Name: bill_items_y2026m05_bill_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_bill ATTACH PARTITION public.bill_items_y2026m05_bill_id_created_at_idx;


--
-- Name: bill_items_y2026m05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.bill_items_pkey ATTACH PARTITION public.bill_items_y2026m05_pkey;


--
-- Name: bill_items_y2026m05_ref_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_ref ATTACH PARTITION public.bill_items_y2026m05_ref_id_idx;


--
-- Name: bill_items_y2026m05_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_tenant ATTACH PARTITION public.bill_items_y2026m05_tenant_id_created_at_idx;


--
-- Name: bill_items_y2026m06_bill_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_bill ATTACH PARTITION public.bill_items_y2026m06_bill_id_created_at_idx;


--
-- Name: bill_items_y2026m06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.bill_items_pkey ATTACH PARTITION public.bill_items_y2026m06_pkey;


--
-- Name: bill_items_y2026m06_ref_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_ref ATTACH PARTITION public.bill_items_y2026m06_ref_id_idx;


--
-- Name: bill_items_y2026m06_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_tenant ATTACH PARTITION public.bill_items_y2026m06_tenant_id_created_at_idx;


--
-- Name: bill_items_y2026m07_bill_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_bill ATTACH PARTITION public.bill_items_y2026m07_bill_id_created_at_idx;


--
-- Name: bill_items_y2026m07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.bill_items_pkey ATTACH PARTITION public.bill_items_y2026m07_pkey;


--
-- Name: bill_items_y2026m07_ref_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_ref ATTACH PARTITION public.bill_items_y2026m07_ref_id_idx;


--
-- Name: bill_items_y2026m07_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_tenant ATTACH PARTITION public.bill_items_y2026m07_tenant_id_created_at_idx;


--
-- Name: bill_items_y2026m08_bill_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_bill ATTACH PARTITION public.bill_items_y2026m08_bill_id_created_at_idx;


--
-- Name: bill_items_y2026m08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.bill_items_pkey ATTACH PARTITION public.bill_items_y2026m08_pkey;


--
-- Name: bill_items_y2026m08_ref_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_ref ATTACH PARTITION public.bill_items_y2026m08_ref_id_idx;


--
-- Name: bill_items_y2026m08_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_bill_items_tenant ATTACH PARTITION public.bill_items_y2026m08_tenant_id_created_at_idx;


--
-- Name: lab_order_items_y2026m04_lab_order_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_order ATTACH PARTITION public.lab_order_items_y2026m04_lab_order_id_created_at_idx;


--
-- Name: lab_order_items_y2026m04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.lab_order_items_pkey ATTACH PARTITION public.lab_order_items_y2026m04_pkey;


--
-- Name: lab_order_items_y2026m04_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_tenant ATTACH PARTITION public.lab_order_items_y2026m04_tenant_id_created_at_idx;


--
-- Name: lab_order_items_y2026m04_tenant_id_test_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_test ATTACH PARTITION public.lab_order_items_y2026m04_tenant_id_test_id_created_at_idx;


--
-- Name: lab_order_items_y2026m05_lab_order_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_order ATTACH PARTITION public.lab_order_items_y2026m05_lab_order_id_created_at_idx;


--
-- Name: lab_order_items_y2026m05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.lab_order_items_pkey ATTACH PARTITION public.lab_order_items_y2026m05_pkey;


--
-- Name: lab_order_items_y2026m05_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_tenant ATTACH PARTITION public.lab_order_items_y2026m05_tenant_id_created_at_idx;


--
-- Name: lab_order_items_y2026m05_tenant_id_test_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_test ATTACH PARTITION public.lab_order_items_y2026m05_tenant_id_test_id_created_at_idx;


--
-- Name: lab_order_items_y2026m06_lab_order_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_order ATTACH PARTITION public.lab_order_items_y2026m06_lab_order_id_created_at_idx;


--
-- Name: lab_order_items_y2026m06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.lab_order_items_pkey ATTACH PARTITION public.lab_order_items_y2026m06_pkey;


--
-- Name: lab_order_items_y2026m06_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_tenant ATTACH PARTITION public.lab_order_items_y2026m06_tenant_id_created_at_idx;


--
-- Name: lab_order_items_y2026m06_tenant_id_test_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_test ATTACH PARTITION public.lab_order_items_y2026m06_tenant_id_test_id_created_at_idx;


--
-- Name: lab_order_items_y2026m07_lab_order_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_order ATTACH PARTITION public.lab_order_items_y2026m07_lab_order_id_created_at_idx;


--
-- Name: lab_order_items_y2026m07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.lab_order_items_pkey ATTACH PARTITION public.lab_order_items_y2026m07_pkey;


--
-- Name: lab_order_items_y2026m07_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_tenant ATTACH PARTITION public.lab_order_items_y2026m07_tenant_id_created_at_idx;


--
-- Name: lab_order_items_y2026m07_tenant_id_test_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_test ATTACH PARTITION public.lab_order_items_y2026m07_tenant_id_test_id_created_at_idx;


--
-- Name: lab_order_items_y2026m08_lab_order_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_order ATTACH PARTITION public.lab_order_items_y2026m08_lab_order_id_created_at_idx;


--
-- Name: lab_order_items_y2026m08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.lab_order_items_pkey ATTACH PARTITION public.lab_order_items_y2026m08_pkey;


--
-- Name: lab_order_items_y2026m08_tenant_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_tenant ATTACH PARTITION public.lab_order_items_y2026m08_tenant_id_created_at_idx;


--
-- Name: lab_order_items_y2026m08_tenant_id_test_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_lab_items_test ATTACH PARTITION public.lab_order_items_y2026m08_tenant_id_test_id_created_at_idx;


--
-- Name: visits_y2026m04_appointment_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_appt_id ATTACH PARTITION public.visits_y2026m04_appointment_id_idx;


--
-- Name: visits_y2026m04_combined_bill_no_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_combined_bill_no ATTACH PARTITION public.visits_y2026m04_combined_bill_no_idx;


--
-- Name: visits_y2026m04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.visits_pkey ATTACH PARTITION public.visits_y2026m04_pkey;


--
-- Name: visits_y2026m04_tenant_id_doctor_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_doctor_date ATTACH PARTITION public.visits_y2026m04_tenant_id_doctor_id_visit_date_idx;


--
-- Name: visits_y2026m04_tenant_id_patient_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_patient_date ATTACH PARTITION public.visits_y2026m04_tenant_id_patient_id_visit_date_idx;


--
-- Name: visits_y2026m04_tenant_id_patient_id_visit_date_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_patient_date ATTACH PARTITION public.visits_y2026m04_tenant_id_patient_id_visit_date_idx1;


--
-- Name: visits_y2026m04_tenant_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_date ATTACH PARTITION public.visits_y2026m04_tenant_id_visit_date_idx;


--
-- Name: visits_y2026m05_appointment_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_appt_id ATTACH PARTITION public.visits_y2026m05_appointment_id_idx;


--
-- Name: visits_y2026m05_combined_bill_no_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_combined_bill_no ATTACH PARTITION public.visits_y2026m05_combined_bill_no_idx;


--
-- Name: visits_y2026m05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.visits_pkey ATTACH PARTITION public.visits_y2026m05_pkey;


--
-- Name: visits_y2026m05_tenant_id_doctor_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_doctor_date ATTACH PARTITION public.visits_y2026m05_tenant_id_doctor_id_visit_date_idx;


--
-- Name: visits_y2026m05_tenant_id_patient_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_patient_date ATTACH PARTITION public.visits_y2026m05_tenant_id_patient_id_visit_date_idx;


--
-- Name: visits_y2026m05_tenant_id_patient_id_visit_date_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_patient_date ATTACH PARTITION public.visits_y2026m05_tenant_id_patient_id_visit_date_idx1;


--
-- Name: visits_y2026m05_tenant_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_date ATTACH PARTITION public.visits_y2026m05_tenant_id_visit_date_idx;


--
-- Name: visits_y2026m06_appointment_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_appt_id ATTACH PARTITION public.visits_y2026m06_appointment_id_idx;


--
-- Name: visits_y2026m06_combined_bill_no_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_combined_bill_no ATTACH PARTITION public.visits_y2026m06_combined_bill_no_idx;


--
-- Name: visits_y2026m06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.visits_pkey ATTACH PARTITION public.visits_y2026m06_pkey;


--
-- Name: visits_y2026m06_tenant_id_doctor_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_doctor_date ATTACH PARTITION public.visits_y2026m06_tenant_id_doctor_id_visit_date_idx;


--
-- Name: visits_y2026m06_tenant_id_patient_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_patient_date ATTACH PARTITION public.visits_y2026m06_tenant_id_patient_id_visit_date_idx;


--
-- Name: visits_y2026m06_tenant_id_patient_id_visit_date_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_patient_date ATTACH PARTITION public.visits_y2026m06_tenant_id_patient_id_visit_date_idx1;


--
-- Name: visits_y2026m06_tenant_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_date ATTACH PARTITION public.visits_y2026m06_tenant_id_visit_date_idx;


--
-- Name: visits_y2026m07_appointment_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_appt_id ATTACH PARTITION public.visits_y2026m07_appointment_id_idx;


--
-- Name: visits_y2026m07_combined_bill_no_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_combined_bill_no ATTACH PARTITION public.visits_y2026m07_combined_bill_no_idx;


--
-- Name: visits_y2026m07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.visits_pkey ATTACH PARTITION public.visits_y2026m07_pkey;


--
-- Name: visits_y2026m07_tenant_id_doctor_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_doctor_date ATTACH PARTITION public.visits_y2026m07_tenant_id_doctor_id_visit_date_idx;


--
-- Name: visits_y2026m07_tenant_id_patient_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_patient_date ATTACH PARTITION public.visits_y2026m07_tenant_id_patient_id_visit_date_idx;


--
-- Name: visits_y2026m07_tenant_id_patient_id_visit_date_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_patient_date ATTACH PARTITION public.visits_y2026m07_tenant_id_patient_id_visit_date_idx1;


--
-- Name: visits_y2026m07_tenant_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_date ATTACH PARTITION public.visits_y2026m07_tenant_id_visit_date_idx;


--
-- Name: visits_y2026m08_appointment_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_appt_id ATTACH PARTITION public.visits_y2026m08_appointment_id_idx;


--
-- Name: visits_y2026m08_combined_bill_no_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_combined_bill_no ATTACH PARTITION public.visits_y2026m08_combined_bill_no_idx;


--
-- Name: visits_y2026m08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.visits_pkey ATTACH PARTITION public.visits_y2026m08_pkey;


--
-- Name: visits_y2026m08_tenant_id_doctor_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_doctor_date ATTACH PARTITION public.visits_y2026m08_tenant_id_doctor_id_visit_date_idx;


--
-- Name: visits_y2026m08_tenant_id_patient_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_patient_date ATTACH PARTITION public.visits_y2026m08_tenant_id_patient_id_visit_date_idx;


--
-- Name: visits_y2026m08_tenant_id_patient_id_visit_date_idx1; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_patient_date ATTACH PARTITION public.visits_y2026m08_tenant_id_patient_id_visit_date_idx1;


--
-- Name: visits_y2026m08_tenant_id_visit_date_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_visits_tenant_date ATTACH PARTITION public.visits_y2026m08_tenant_id_visit_date_idx;


--
-- Name: admission_advance_refunds admission_advance_refunds_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advance_refunds
    ADD CONSTRAINT admission_advance_refunds_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: admission_advance_refunds admission_advance_refunds_refunded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advance_refunds
    ADD CONSTRAINT admission_advance_refunds_refunded_by_fkey FOREIGN KEY (refunded_by) REFERENCES public.profiles(id);


--
-- Name: admission_advance_refunds admission_advance_refunds_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advance_refunds
    ADD CONSTRAINT admission_advance_refunds_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: admission_advances admission_advances_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advances
    ADD CONSTRAINT admission_advances_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: admission_advances admission_advances_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advances
    ADD CONSTRAINT admission_advances_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: admission_advances admission_advances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_advances
    ADD CONSTRAINT admission_advances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: admission_nurse_assignments admission_nurse_assignments_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_nurse_assignments
    ADD CONSTRAINT admission_nurse_assignments_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: admission_nurse_assignments admission_nurse_assignments_nurse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_nurse_assignments
    ADD CONSTRAINT admission_nurse_assignments_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES public.profiles(id);


--
-- Name: admission_nurse_assignments admission_nurse_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admission_nurse_assignments
    ADD CONSTRAINT admission_nurse_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: admissions admissions_admitting_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_admitting_doctor_id_fkey FOREIGN KEY (admitting_doctor_id) REFERENCES public.profiles(id);


--
-- Name: admissions admissions_bed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_bed_id_fkey FOREIGN KEY (bed_id) REFERENCES public.beds(id);


--
-- Name: admissions admissions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: admissions admissions_procedure_tariff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_procedure_tariff_id_fkey FOREIGN KEY (procedure_tariff_id) REFERENCES public.procedure_tariffs(id);


--
-- Name: admissions admissions_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id);


--
-- Name: advance_deposit_requests advance_deposit_requests_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_deposit_requests
    ADD CONSTRAINT advance_deposit_requests_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: advance_deposit_requests advance_deposit_requests_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_deposit_requests
    ADD CONSTRAINT advance_deposit_requests_advance_id_fkey FOREIGN KEY (advance_id) REFERENCES public.admission_advances(id);


--
-- Name: advance_deposit_requests advance_deposit_requests_collected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_deposit_requests
    ADD CONSTRAINT advance_deposit_requests_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES public.profiles(id);


--
-- Name: advance_deposit_requests advance_deposit_requests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_deposit_requests
    ADD CONSTRAINT advance_deposit_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: advance_deposit_requests advance_deposit_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_deposit_requests
    ADD CONSTRAINT advance_deposit_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: appointments appointments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: appointments appointments_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id);


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: appointments appointments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: auth_otp_codes auth_otp_codes_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp_codes
    ADD CONSTRAINT auth_otp_codes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: auth_otp_codes auth_otp_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp_codes
    ADD CONSTRAINT auth_otp_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: beds beds_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id) ON DELETE CASCADE;


--
-- Name: bill_items bill_items_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.bill_items
    ADD CONSTRAINT bill_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;


--
-- Name: bill_items bill_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.bill_items
    ADD CONSTRAINT bill_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: bills bills_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: bills bills_consolidated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_consolidated_by_fkey FOREIGN KEY (consolidated_by) REFERENCES public.bills(id);


--
-- Name: bills bills_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: bills bills_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: blood_issues blood_issues_blood_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_issues
    ADD CONSTRAINT blood_issues_blood_unit_id_fkey FOREIGN KEY (blood_unit_id) REFERENCES public.blood_units(id);


--
-- Name: blood_issues blood_issues_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_issues
    ADD CONSTRAINT blood_issues_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.profiles(id);


--
-- Name: blood_issues blood_issues_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_issues
    ADD CONSTRAINT blood_issues_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: blood_issues blood_issues_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_issues
    ADD CONSTRAINT blood_issues_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.blood_requests(id);


--
-- Name: blood_requests blood_requests_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT blood_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: blood_requests blood_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT blood_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: blood_units blood_units_donor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_units
    ADD CONSTRAINT blood_units_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.blood_donors(id);


--
-- Name: dental_recalls dental_recalls_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dental_recalls
    ADD CONSTRAINT dental_recalls_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: dental_recalls dental_recalls_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dental_recalls
    ADD CONSTRAINT dental_recalls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: dental_treatments dental_treatments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dental_treatments
    ADD CONSTRAINT dental_treatments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: dental_treatments dental_treatments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dental_treatments
    ADD CONSTRAINT dental_treatments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: device_push_tokens device_push_tokens_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: device_push_tokens device_push_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: dispenses dispenses_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: dispenses dispenses_dispensed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.profiles(id);


--
-- Name: dispenses dispenses_drug_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_drug_batch_id_fkey FOREIGN KEY (drug_batch_id) REFERENCES public.drug_batches(id);


--
-- Name: dispenses dispenses_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.drugs(id);


--
-- Name: dispenses dispenses_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: dispenses dispenses_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: dispenses dispenses_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT dispenses_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);


--
-- Name: drug_batches drug_batches_drug_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_batches
    ADD CONSTRAINT drug_batches_drug_brand_id_fkey FOREIGN KEY (drug_brand_id) REFERENCES public.drug_brands(id);


--
-- Name: drug_batches drug_batches_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_batches
    ADD CONSTRAINT drug_batches_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.drugs(id);


--
-- Name: drug_batches drug_batches_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_batches
    ADD CONSTRAINT drug_batches_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: drug_brands drug_brands_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_brands
    ADD CONSTRAINT drug_brands_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: duty_roster duty_roster_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_roster
    ADD CONSTRAINT duty_roster_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: duty_roster duty_roster_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_roster
    ADD CONSTRAINT duty_roster_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id);


--
-- Name: emergency_cases emergency_cases_attended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_cases
    ADD CONSTRAINT emergency_cases_attended_by_fkey FOREIGN KEY (attended_by) REFERENCES public.profiles(id);


--
-- Name: emergency_cases emergency_cases_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_cases
    ADD CONSTRAINT emergency_cases_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: admissions fk_admissions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT fk_admissions_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: patient_allergies fk_allergies_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT fk_allergies_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: staff_attendance fk_attendance_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT fk_attendance_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: beds fk_beds_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT fk_beds_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: bills fk_bills_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT fk_bills_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: blood_donors fk_blood_donors_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_donors
    ADD CONSTRAINT fk_blood_donors_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: blood_issues fk_blood_issues_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_issues
    ADD CONSTRAINT fk_blood_issues_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: blood_requests fk_blood_requests_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT fk_blood_requests_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: blood_units fk_blood_units_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_units
    ADD CONSTRAINT fk_blood_units_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: departments fk_departments_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: dispenses fk_dispenses_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispenses
    ADD CONSTRAINT fk_dispenses_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: patient_documents fk_documents_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT fk_documents_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: drug_batches fk_drug_batches_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drug_batches
    ADD CONSTRAINT fk_drug_batches_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: drugs fk_drugs_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drugs
    ADD CONSTRAINT fk_drugs_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: duty_roster fk_duty_roster_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_roster
    ADD CONSTRAINT fk_duty_roster_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: emergency_cases fk_emergency_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_cases
    ADD CONSTRAINT fk_emergency_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: insurance_claims fk_ins_claims_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT fk_ins_claims_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: insurance_policies fk_ins_policies_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT fk_ins_policies_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_items fk_inv_items_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT fk_inv_items_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ipd_progress_notes fk_ipd_notes_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_progress_notes
    ADD CONSTRAINT fk_ipd_notes_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lab_tests_catalog fk_lab_catalog_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests_catalog
    ADD CONSTRAINT fk_lab_catalog_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lab_orders fk_lab_orders_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT fk_lab_orders_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notification_templates fk_notif_tpl_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT fk_notif_tpl_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notifications fk_notifications_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ot_consumables fk_ot_consumables_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_consumables
    ADD CONSTRAINT fk_ot_consumables_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ot_rooms fk_ot_rooms_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_rooms
    ADD CONSTRAINT fk_ot_rooms_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ot_schedules fk_ot_schedules_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT fk_ot_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: patients fk_patients_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT fk_patients_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payments fk_payments_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: po_items fk_po_items_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT fk_po_items_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchase_orders fk_po_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT fk_po_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: prescriptions fk_prescriptions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT fk_prescriptions_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles fk_profiles_dept; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_profiles_dept FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: profiles fk_profiles_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT fk_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: radiology_catalog fk_rad_catalog_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_catalog
    ADD CONSTRAINT fk_rad_catalog_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: radiology_orders fk_rad_orders_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT fk_rad_orders_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: staff_profiles fk_staff_profiles_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT fk_staff_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: stock_movements fk_stock_mvmt_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT fk_stock_mvmt_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: suppliers fk_suppliers_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tariffs fk_tariffs_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariffs
    ADD CONSTRAINT fk_tariffs_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: wards fk_wards_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT fk_wards_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: insurance_claims insurance_claims_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: insurance_claims insurance_claims_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT insurance_claims_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.insurance_policies(id);


--
-- Name: insurance_policies insurance_policies_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: ipd_admin_schedule ipd_admin_schedule_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_admin_schedule
    ADD CONSTRAINT ipd_admin_schedule_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: ipd_admin_schedule ipd_admin_schedule_given_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_admin_schedule
    ADD CONSTRAINT ipd_admin_schedule_given_by_fkey FOREIGN KEY (given_by) REFERENCES public.profiles(id);


--
-- Name: ipd_admin_schedule ipd_admin_schedule_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_admin_schedule
    ADD CONSTRAINT ipd_admin_schedule_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.ipd_medication_orders(id) ON DELETE CASCADE;


--
-- Name: ipd_admin_schedule ipd_admin_schedule_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_admin_schedule
    ADD CONSTRAINT ipd_admin_schedule_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ipd_billing_config ipd_billing_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_billing_config
    ADD CONSTRAINT ipd_billing_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ipd_custom_charges ipd_custom_charges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_custom_charges
    ADD CONSTRAINT ipd_custom_charges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ipd_medication_orders ipd_medication_orders_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_medication_orders
    ADD CONSTRAINT ipd_medication_orders_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: ipd_medication_orders ipd_medication_orders_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_medication_orders
    ADD CONSTRAINT ipd_medication_orders_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.drugs(id);


--
-- Name: ipd_medication_orders ipd_medication_orders_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_medication_orders
    ADD CONSTRAINT ipd_medication_orders_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: ipd_medication_orders ipd_medication_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_medication_orders
    ADD CONSTRAINT ipd_medication_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.profiles(id);


--
-- Name: ipd_medication_orders ipd_medication_orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_medication_orders
    ADD CONSTRAINT ipd_medication_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_dispensed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.profiles(id);


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.drugs(id);


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.ipd_medication_orders(id) ON DELETE CASCADE;


--
-- Name: ipd_pharmacy_requests ipd_pharmacy_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_pharmacy_requests
    ADD CONSTRAINT ipd_pharmacy_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ipd_progress_notes ipd_progress_notes_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_progress_notes
    ADD CONSTRAINT ipd_progress_notes_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE CASCADE;


--
-- Name: ipd_progress_notes ipd_progress_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ipd_progress_notes
    ADD CONSTRAINT ipd_progress_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: lab_order_items lab_order_items_lab_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items
    ADD CONSTRAINT lab_order_items_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES public.lab_orders(id) ON DELETE CASCADE;


--
-- Name: lab_order_items lab_order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items
    ADD CONSTRAINT lab_order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lab_order_items lab_order_items_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items
    ADD CONSTRAINT lab_order_items_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.lab_tests_catalog(id);


--
-- Name: lab_orders lab_orders_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: lab_orders lab_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.profiles(id);


--
-- Name: lab_orders lab_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: lab_tests_catalog lab_tests_catalog_lab_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests_catalog
    ADD CONSTRAINT lab_tests_catalog_lab_master_id_fkey FOREIGN KEY (lab_master_id) REFERENCES public.lab_tests_master(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: notifications notifications_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.profiles(id);


--
-- Name: ot_consumables ot_consumables_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_consumables
    ADD CONSTRAINT ot_consumables_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.drugs(id);


--
-- Name: ot_consumables ot_consumables_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_consumables
    ADD CONSTRAINT ot_consumables_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: ot_consumables ot_consumables_ot_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_consumables
    ADD CONSTRAINT ot_consumables_ot_schedule_id_fkey FOREIGN KEY (ot_schedule_id) REFERENCES public.ot_schedules(id) ON DELETE CASCADE;


--
-- Name: ot_consumables ot_consumables_pharmacy_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_consumables
    ADD CONSTRAINT ot_consumables_pharmacy_request_id_fkey FOREIGN KEY (pharmacy_request_id) REFERENCES public.ipd_pharmacy_requests(id);


--
-- Name: ot_schedules ot_schedules_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id) ON DELETE SET NULL;


--
-- Name: ot_schedules ot_schedules_anaesthetist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_anaesthetist_id_fkey FOREIGN KEY (anaesthetist_id) REFERENCES public.profiles(id);


--
-- Name: ot_schedules ot_schedules_ot_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_ot_room_id_fkey FOREIGN KEY (ot_room_id) REFERENCES public.ot_rooms(id);


--
-- Name: ot_schedules ot_schedules_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: ot_schedules ot_schedules_post_op_bed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_post_op_bed_id_fkey FOREIGN KEY (post_op_bed_id) REFERENCES public.beds(id) ON DELETE SET NULL;


--
-- Name: ot_schedules ot_schedules_post_op_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_post_op_ward_id_fkey FOREIGN KEY (post_op_ward_id) REFERENCES public.wards(id) ON DELETE SET NULL;


--
-- Name: ot_schedules ot_schedules_surgeon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_schedules
    ADD CONSTRAINT ot_schedules_surgeon_id_fkey FOREIGN KEY (surgeon_id) REFERENCES public.profiles(id);


--
-- Name: ot_team_members ot_team_members_ot_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_team_members
    ADD CONSTRAINT ot_team_members_ot_schedule_id_fkey FOREIGN KEY (ot_schedule_id) REFERENCES public.ot_schedules(id) ON DELETE CASCADE;


--
-- Name: ot_team_members ot_team_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_team_members
    ADD CONSTRAINT ot_team_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: patient_allergies patient_allergies_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_allergies patient_allergies_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: patient_dental_chart patient_dental_chart_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_dental_chart
    ADD CONSTRAINT patient_dental_chart_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_dental_chart patient_dental_chart_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_dental_chart
    ADD CONSTRAINT patient_dental_chart_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: patient_documents patient_documents_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_documents patient_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: patients patients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payments payments_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: pharmacy_sale_items pharmacy_sale_items_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sale_items
    ADD CONSTRAINT pharmacy_sale_items_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.drugs(id);


--
-- Name: pharmacy_sale_items pharmacy_sale_items_drug_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sale_items
    ADD CONSTRAINT pharmacy_sale_items_drug_master_id_fkey FOREIGN KEY (drug_master_id) REFERENCES public.drug_master(id);


--
-- Name: pharmacy_sale_items pharmacy_sale_items_pharmacy_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sale_items
    ADD CONSTRAINT pharmacy_sale_items_pharmacy_sale_id_fkey FOREIGN KEY (pharmacy_sale_id) REFERENCES public.pharmacy_sales(id) ON DELETE CASCADE;


--
-- Name: pharmacy_sale_items pharmacy_sale_items_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sale_items
    ADD CONSTRAINT pharmacy_sale_items_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);


--
-- Name: pharmacy_sale_items pharmacy_sale_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sale_items
    ADD CONSTRAINT pharmacy_sale_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: pharmacy_sales pharmacy_sales_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sales
    ADD CONSTRAINT pharmacy_sales_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: pharmacy_sales pharmacy_sales_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sales
    ADD CONSTRAINT pharmacy_sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pharmacy_sales pharmacy_sales_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sales
    ADD CONSTRAINT pharmacy_sales_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: pharmacy_sales pharmacy_sales_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sales
    ADD CONSTRAINT pharmacy_sales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: platform_admin_audit platform_admin_audit_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit
    ADD CONSTRAINT platform_admin_audit_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id);


--
-- Name: platform_admin_audit platform_admin_audit_target_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_audit
    ADD CONSTRAINT platform_admin_audit_target_tenant_id_fkey FOREIGN KEY (target_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: platform_admins platform_admins_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: po_items po_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT po_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);


--
-- Name: po_items po_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_items
    ADD CONSTRAINT po_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: procedure_tariffs procedure_tariffs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedure_tariffs
    ADD CONSTRAINT procedure_tariffs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: radiology_catalog radiology_catalog_radiology_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_catalog
    ADD CONSTRAINT radiology_catalog_radiology_master_id_fkey FOREIGN KEY (radiology_master_id) REFERENCES public.radiology_master(id) ON DELETE SET NULL;


--
-- Name: radiology_orders radiology_orders_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: radiology_orders radiology_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.profiles(id);


--
-- Name: radiology_orders radiology_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: radiology_orders radiology_orders_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.radiology_catalog(id);


--
-- Name: staff_attendance staff_attendance_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: staff_profiles staff_profiles_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT staff_profiles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: stock_movements stock_movements_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);


--
-- Name: subscriptions subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_profiles tenant_profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_profiles
    ADD CONSTRAINT tenant_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: visits visits_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.visits
    ADD CONSTRAINT visits_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id);


--
-- Name: visits visits_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.visits
    ADD CONSTRAINT visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: visits visits_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.visits
    ADD CONSTRAINT visits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: wards wards_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: wards wards_room_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_room_type_id_fkey FOREIGN KEY (room_type_id) REFERENCES public.ward_room_types(id) ON DELETE SET NULL;


--
-- Name: admission_advance_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admission_advance_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_advance_refunds admission_advance_refunds_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_advance_refunds_tenant_all ON public.admission_advance_refunds USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: admission_advances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admission_advances ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_advances admission_advances_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admission_advances_tenant_all ON public.admission_advances USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: admission_nurse_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admission_nurse_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: admissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

--
-- Name: admissions admissions_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admissions_tenant_all ON public.admissions USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: advance_deposit_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advance_deposit_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_allergies allergies_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allergies_tenant_all ON public.patient_allergies USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: appointment_token_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointment_token_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments appointments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_tenant_read ON public.appointments FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text])))))));


--
-- Name: appointments appointments_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_tenant_update ON public.appointments FOR UPDATE USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text])))))));


--
-- Name: appointments appointments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appointments_tenant_write ON public.appointments FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text])))))));


--
-- Name: appointments_y2026m04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments_y2026m04 ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments_y2026m05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments_y2026m05 ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments_y2026m06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments_y2026m06 ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments_y2026m07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments_y2026m07 ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments_y2026m08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments_y2026m08 ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_attendance attendance_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_tenant_all ON public.staff_attendance USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_tenant_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_tenant_admin_read ON public.audit_logs FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: audit_logs audit_logs_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_tenant_insert ON public.audit_logs FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: audit_logs_y2026m04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs_y2026m04 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs_y2026m05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs_y2026m05 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs_y2026m06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs_y2026m06 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs_y2026m07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs_y2026m07 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs_y2026m08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs_y2026m08 ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_otp_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_otp_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: beds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

--
-- Name: beds beds_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY beds_tenant_read ON public.beds FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: beds beds_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY beds_tenant_write ON public.beds USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'nurse'::text])) AND (profiles.tenant_id = public.current_tenant_id())))))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'nurse'::text])) AND (profiles.tenant_id = public.current_tenant_id()))))));


--
-- Name: bill_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_items bill_items_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bill_items_tenant_all ON public.bill_items USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: bill_items_y2026m04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_items_y2026m04 ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_items_y2026m05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_items_y2026m05 ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_items_y2026m06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_items_y2026m06 ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_items_y2026m07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_items_y2026m07 ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_items_y2026m08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_items_y2026m08 ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_no_seq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_no_seq ENABLE ROW LEVEL SECURITY;

--
-- Name: bills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

--
-- Name: bills bills_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bills_tenant_all ON public.bills USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: blood_donors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blood_donors ENABLE ROW LEVEL SECURITY;

--
-- Name: blood_donors blood_donors_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blood_donors_tenant_all ON public.blood_donors USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: blood_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blood_issues ENABLE ROW LEVEL SECURITY;

--
-- Name: blood_issues blood_issues_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blood_issues_tenant_all ON public.blood_issues USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: blood_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: blood_requests blood_requests_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blood_requests_tenant_all ON public.blood_requests USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: blood_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blood_units ENABLE ROW LEVEL SECURITY;

--
-- Name: blood_units blood_units_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blood_units_tenant_all ON public.blood_units USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: dental_recalls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dental_recalls ENABLE ROW LEVEL SECURITY;

--
-- Name: dental_treatments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dental_treatments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments departments_tenant_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_tenant_admin_write ON public.departments USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id())))))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id()))))));


--
-- Name: departments departments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_tenant_read ON public.departments FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: device_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: device_push_tokens device_tokens_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY device_tokens_own_profile ON public.device_push_tokens USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));


--
-- Name: dispenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispenses ENABLE ROW LEVEL SECURITY;

--
-- Name: dispenses dispenses_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dispenses_tenant_all ON public.dispenses USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: patient_documents documents_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_tenant_all ON public.patient_documents USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: drug_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drug_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: drug_batches drug_batches_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drug_batches_tenant_all ON public.drug_batches USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: drug_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drug_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: drug_brands drug_brands_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drug_brands_read ON public.drug_brands FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: drug_master; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drug_master ENABLE ROW LEVEL SECURITY;

--
-- Name: drug_master drug_master_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drug_master_read ON public.drug_master FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: drugs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;

--
-- Name: drugs drugs_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drugs_tenant_all ON public.drugs USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: duty_roster; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.duty_roster ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_roster duty_roster_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY duty_roster_tenant_all ON public.duty_roster USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: emergency_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: emergency_cases emergency_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY emergency_tenant_all ON public.emergency_cases USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: insurance_claims ins_claims_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ins_claims_tenant_all ON public.insurance_claims USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: insurance_policies ins_policies_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ins_policies_tenant_all ON public.insurance_policies USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: insurance_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: insurance_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items inv_items_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_items_tenant_all ON public.inventory_items USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: ipd_admin_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ipd_admin_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: ipd_billing_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ipd_billing_config ENABLE ROW LEVEL SECURITY;

--
-- Name: ipd_custom_charges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ipd_custom_charges ENABLE ROW LEVEL SECURITY;

--
-- Name: ipd_medication_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ipd_medication_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: ipd_progress_notes ipd_notes_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipd_notes_tenant_all ON public.ipd_progress_notes USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: ipd_pharmacy_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ipd_pharmacy_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: ipd_progress_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ipd_progress_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_tests_catalog lab_catalog_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_catalog_tenant_all ON public.lab_tests_catalog USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: lab_order_items lab_items_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_items_tenant_all ON public.lab_order_items USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: lab_tests_master lab_master_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_master_read ON public.lab_tests_master FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: lab_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_order_items_y2026m04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items_y2026m04 ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_order_items_y2026m05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items_y2026m05 ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_order_items_y2026m06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items_y2026m06 ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_order_items_y2026m07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items_y2026m07 ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_order_items_y2026m08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_order_items_y2026m08 ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_orders lab_orders_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_orders_tenant_all ON public.lab_orders USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: lab_tests_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_tests_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_tests_master; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_tests_master ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_templates notif_tpl_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_tpl_tenant_all ON public.notification_templates USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: notification_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_tenant_all ON public.notifications USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: ot_consumables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ot_consumables ENABLE ROW LEVEL SECURITY;

--
-- Name: ot_consumables ot_consumables_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ot_consumables_tenant_all ON public.ot_consumables USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: ot_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ot_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: ot_rooms ot_rooms_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ot_rooms_tenant_all ON public.ot_rooms USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: ot_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ot_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: ot_schedules ot_schedules_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ot_schedules_tenant_all ON public.ot_schedules USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: ot_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ot_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_otp_codes otp_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY otp_tenant_isolation ON public.auth_otp_codes USING ((tenant_id = public.current_tenant_id()));


--
-- Name: platform_admin_audit paa_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY paa_read ON public.platform_admin_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid()))));


--
-- Name: patient_allergies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_dental_chart; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_dental_chart ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: patients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

--
-- Name: patients patients_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_tenant_read ON public.patients FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text, 'lab_tech'::text, 'pharmacist'::text, 'accountant'::text])))))));


--
-- Name: patients patients_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_tenant_update ON public.patients FOR UPDATE USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text])))))));


--
-- Name: patients patients_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY patients_tenant_write ON public.patients FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text])))))));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_tenant_all ON public.payments USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: pharmacy_sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pharmacy_sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_sale_items pharmacy_sale_items_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pharmacy_sale_items_tenant_all ON public.pharmacy_sale_items USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: pharmacy_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pharmacy_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_sales pharmacy_sales_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pharmacy_sales_tenant_all ON public.pharmacy_sales USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: tenants platform_admin_all_tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admin_all_tenants ON public.tenants USING ((EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid()))));


--
-- Name: platform_admin_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_read ON public.platform_admins FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.platform_admins pa
  WHERE (pa.id = auth.uid()))));


--
-- Name: platform_admins platform_admins_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_write ON public.platform_admins FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.platform_admins pa
  WHERE (pa.id = auth.uid()))));


--
-- Name: po_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;

--
-- Name: po_items po_items_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_items_tenant_all ON public.po_items USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: po_no_seq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_no_seq ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders po_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_tenant_all ON public.purchase_orders USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: prescriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: prescriptions prescriptions_tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prescriptions_tenant_delete ON public.prescriptions FOR DELETE USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text])))))));


--
-- Name: prescriptions prescriptions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prescriptions_tenant_read ON public.prescriptions FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text, 'pharmacist'::text])))))));


--
-- Name: prescriptions prescriptions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prescriptions_tenant_write ON public.prescriptions FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text])))))));


--
-- Name: procedure_tariffs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procedure_tariffs ENABLE ROW LEVEL SECURITY;

--
-- Name: procedure_tariffs procedure_tariffs_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY procedure_tariffs_tenant_all ON public.procedure_tariffs USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_tenant_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_tenant_admin_delete ON public.profiles FOR DELETE USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.tenant_id = public.current_tenant_id()))))));


--
-- Name: profiles profiles_tenant_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_tenant_admin_insert ON public.profiles FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.tenant_id = public.current_tenant_id()))))));


--
-- Name: profiles profiles_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_tenant_read ON public.profiles FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: profiles profiles_tenant_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_tenant_self_update ON public.profiles FOR UPDATE USING (((tenant_id = public.current_tenant_id()) AND ((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.tenant_id = public.current_tenant_id()))))))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: radiology_catalog rad_catalog_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rad_catalog_tenant_all ON public.radiology_catalog USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: radiology_orders rad_orders_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rad_orders_tenant_all ON public.radiology_orders USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: radiology_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.radiology_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: radiology_master; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.radiology_master ENABLE ROW LEVEL SECURITY;

--
-- Name: radiology_master radiology_master_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY radiology_master_read ON public.radiology_master FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: radiology_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.radiology_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_profiles staff_profiles_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_profiles_tenant_all ON public.staff_profiles USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements stock_mvmt_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_mvmt_tenant_all ON public.stock_movements USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_service_write ON public.subscriptions USING ((EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid()))));


--
-- Name: subscriptions subscriptions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_tenant_read ON public.subscriptions FOR SELECT USING (((tenant_id = public.current_tenant_id()) OR (EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid())))));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_tenant_all ON public.suppliers USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: tariffs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY;

--
-- Name: tariffs tariffs_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tariffs_tenant_all ON public.tariffs USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: admission_nurse_assignments tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.admission_nurse_assignments USING ((tenant_id = public.current_tenant_id()));


--
-- Name: advance_deposit_requests tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.advance_deposit_requests USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dental_recalls tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.dental_recalls USING ((tenant_id = public.current_tenant_id()));


--
-- Name: dental_treatments tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.dental_treatments USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ipd_admin_schedule tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.ipd_admin_schedule USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ipd_billing_config tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.ipd_billing_config USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ipd_custom_charges tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.ipd_custom_charges USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ipd_medication_orders tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.ipd_medication_orders USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ipd_pharmacy_requests tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.ipd_pharmacy_requests USING ((tenant_id = public.current_tenant_id()));


--
-- Name: patient_dental_chart tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.patient_dental_chart USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ot_team_members tenant_ot_team_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ot_team_delete ON public.ot_team_members FOR DELETE USING ((ot_schedule_id IN ( SELECT ot_schedules.id
   FROM public.ot_schedules
  WHERE (ot_schedules.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: ot_team_members tenant_ot_team_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ot_team_insert ON public.ot_team_members FOR INSERT WITH CHECK ((ot_schedule_id IN ( SELECT ot_schedules.id
   FROM public.ot_schedules
  WHERE (ot_schedules.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: ot_team_members tenant_ot_team_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ot_team_select ON public.ot_team_members FOR SELECT USING ((ot_schedule_id IN ( SELECT ot_schedules.id
   FROM public.ot_schedules
  WHERE (ot_schedules.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: tenant_profiles tenant_profile_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_profile_select ON public.tenant_profiles FOR SELECT USING ((tenant_id = ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())
 LIMIT 1)));


--
-- Name: tenant_profiles tenant_profile_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_profile_upsert ON public.tenant_profiles USING ((tenant_id = ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())
 LIMIT 1))) WITH CHECK ((tenant_id = ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())
 LIMIT 1)));


--
-- Name: tenant_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: ward_room_types tenant_ward_room_types_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ward_room_types_delete ON public.ward_room_types FOR DELETE USING (((tenant_id = (public.current_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id()))))));


--
-- Name: ward_room_types tenant_ward_room_types_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ward_room_types_insert ON public.ward_room_types FOR INSERT WITH CHECK (((tenant_id = (public.current_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id()))))));


--
-- Name: ward_room_types tenant_ward_room_types_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ward_room_types_select ON public.ward_room_types FOR SELECT USING (((tenant_id = (public.current_tenant_id())::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: ward_room_types tenant_ward_room_types_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_ward_room_types_update ON public.ward_room_types FOR UPDATE USING (((tenant_id = (public.current_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id()))))));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_own_read ON public.tenants FOR SELECT USING (((id = public.current_tenant_id()) OR (EXISTS ( SELECT 1
   FROM public.platform_admins
  WHERE (platform_admins.id = auth.uid())))));


--
-- Name: appointment_token_counter token_counter_deny; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY token_counter_deny ON public.appointment_token_counter USING (false);


--
-- Name: uhid_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uhid_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: uhid_counter uhid_counter_deny; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uhid_counter_deny ON public.uhid_counter USING (false);


--
-- Name: visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

--
-- Name: visits visits_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_tenant_read ON public.visits FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text])))))));


--
-- Name: visits visits_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_tenant_update ON public.visits FOR UPDATE USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text])))))));


--
-- Name: visits visits_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_tenant_write ON public.visits FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true) AND (p.tenant_id = public.current_tenant_id()) AND (p.role = ANY (ARRAY['admin'::text, 'doctor'::text, 'nurse'::text])))))));


--
-- Name: visits_y2026m04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits_y2026m04 ENABLE ROW LEVEL SECURITY;

--
-- Name: visits_y2026m05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits_y2026m05 ENABLE ROW LEVEL SECURITY;

--
-- Name: visits_y2026m06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits_y2026m06 ENABLE ROW LEVEL SECURITY;

--
-- Name: visits_y2026m07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits_y2026m07 ENABLE ROW LEVEL SECURITY;

--
-- Name: visits_y2026m08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits_y2026m08 ENABLE ROW LEVEL SECURITY;

--
-- Name: ward_room_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ward_room_types ENABLE ROW LEVEL SECURITY;

--
-- Name: wards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;

--
-- Name: wards wards_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wards_tenant_read ON public.wards FOR SELECT USING (((tenant_id = public.current_tenant_id()) AND (auth.role() = 'authenticated'::text)));


--
-- Name: wards wards_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wards_tenant_write ON public.wards USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id())))))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.tenant_id = public.current_tenant_id()))))));


--
-- PostgreSQL database dump complete
--


