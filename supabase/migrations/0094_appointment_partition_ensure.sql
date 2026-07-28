-- =====================================================================
-- 0094_appointment_partition_ensure.sql
-- P1.4 support — appointments is partitioned by month and partitions were only
-- pre-created through Aug 2026, so booking any later date (e.g. a follow-up a
-- couple of months out) would fail. Add a helper that creates the month's
-- partition on demand, pre-create the next 18 months, and call it before every
-- booking (see bookAppointment).
-- =====================================================================

CREATE OR REPLACE FUNCTION ensure_appointment_partition(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := date_trunc('month', p_date)::date;
  v_end   date := (date_trunc('month', p_date) + interval '1 month')::date;
  v_name  text := 'appointments_y' || to_char(v_start, 'YYYY') || 'm' || to_char(v_start, 'MM');
BEGIN
  IF NOT partition_exists(v_name) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF appointments FOR VALUES FROM (%L) TO (%L)', v_name, v_start, v_end);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_appointment_partition(date) TO authenticated;

-- Pre-create the next 18 months so booking is immediately safe.
DO $$
DECLARE i int;
BEGIN
  FOR i IN 0..17 LOOP
    PERFORM ensure_appointment_partition((date_trunc('month', CURRENT_DATE) + (i * interval '1 month'))::date);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
