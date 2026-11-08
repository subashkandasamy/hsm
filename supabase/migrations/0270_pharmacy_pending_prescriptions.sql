-- The pharmacist's dispense queue.
--
-- A pharmacist could not dispense a prescription. The queue
-- (listPendingPrescriptions) reads `visits` for each prescription's patient
-- and date, and visits_tenant_read (0011) admits admin, doctor, nurse and
-- receptionist only. For a pharmacist the read returned nothing, without an
-- error: every patient showed as "—" and the dispense was sent with no
-- patient, so it failed. True since June 2026.
--
-- Adding pharmacist to visits_tenant_read would hand them the whole visit row
-- — complaints, findings, diagnosis. They need far less: which patient, which
-- day. So this function returns exactly the queue, SECURITY DEFINER so it can
-- read the visit, and nothing more:
--   * only the caller's own hospital (current_tenant_id());
--   * only to an active member of staff who can see prescriptions anyway
--     (current_active_role(), 0246 — checks is_active as well);
--   * only prescriptions not yet dispensed, and of their visits only the date
--     and the patient's name and UHID.
--
-- It also fixes two faults in the old query: it took an arbitrary 200
-- prescriptions (ordered by a random uuid), so a busy hospital's pending ones
-- could drop off the queue unseen; and it read past dispenses with no range,
-- so beyond PostgREST's 1,000-row cap a dispensed prescription came back as
-- pending. Here: newest visits first, and "not dispensed" is a NOT EXISTS.

CREATE OR REPLACE FUNCTION public.list_pending_prescriptions(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id            uuid,
  visit_id      uuid,
  drug_name     text,
  dosage        text,
  frequency     text,
  duration      text,
  instructions  text,
  visit_date    timestamptz,
  patient_id    uuid,
  patient_name  text,
  patient_uhid  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_role   text := current_active_role();
BEGIN
  -- The roles prescriptions_tenant_read already admits; nobody else.
  IF v_tenant IS NULL OR v_role IS NULL
     OR v_role NOT IN ('admin', 'doctor', 'nurse', 'receptionist', 'pharmacist') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT rx.id, rx.visit_id, rx.drug_name, rx.dosage, rx.frequency, rx.duration, rx.instructions,
         v.visit_date, v.patient_id, p.full_name, p.uhid
    FROM prescriptions rx
    JOIN visits v   ON v.id = rx.visit_id AND v.tenant_id = v_tenant
    JOIN patients p ON p.id = v.patient_id
   WHERE rx.tenant_id = v_tenant
     AND NOT EXISTS (SELECT 1 FROM dispenses d WHERE d.prescription_id = rx.id)
   ORDER BY v.visit_date DESC, rx.id
   LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END;
$$;

COMMENT ON FUNCTION public.list_pending_prescriptions(integer) IS
  'The pharmacy dispense queue: undispensed prescriptions of the caller''s hospital with visit date and patient name/UHID — so a pharmacist, who cannot read visits (visits_tenant_read), can still dispense. Newest first, at most 500.';

REVOKE ALL ON FUNCTION public.list_pending_prescriptions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_prescriptions(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
