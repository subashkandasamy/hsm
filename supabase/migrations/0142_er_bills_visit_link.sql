-- ER case bills belong to the case's ER consultation visit ───────────────────
-- The registration fee and ER charges were billed against the case only, so a
-- claim on the ER visit, the visit's financials and its summary left them out.
-- The app now links them when the visit is created; link existing ones.
UPDATE bills b
SET visit_id = v.id
FROM emergency_cases e
JOIN LATERAL (
  SELECT id FROM visits
  WHERE patient_id = e.patient_id
    AND type = 'emergency'
    AND created_at >= e.arrived_at - interval '5 minutes'
  ORDER BY created_at ASC
  LIMIT 1
) v ON true
WHERE b.emergency_case_id = e.id
  AND b.visit_id IS NULL
  AND b.status <> 'cancelled';
