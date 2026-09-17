-- Vitamin A doses follow the 16-month visit and then every 6 months, on the same
-- 30-day-month ages the rest of the schedule uses (16 months = 480 days), so they
-- group with the vaccines given at the same visit.
UPDATE immunization_schedule s SET due_age_days = v.due, min_age_days = v.due
FROM (VALUES ('2', 480), ('3', 660), ('4', 840), ('5', 1020), ('6', 1200), ('7', 1380), ('8', 1560), ('9', 1740)) AS v(dose, due)
WHERE s.vaccine = 'Vitamin A' AND s.dose_label = v.dose;
UPDATE immunization_schedule SET sort_order = 53 WHERE vaccine = 'Vitamin A' AND dose_label = '2';
