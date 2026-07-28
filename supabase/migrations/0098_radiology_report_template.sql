-- =====================================================================
-- 0098_radiology_report_template.sql
-- P2.4 — a notification template for delivering a radiology report to the
-- patient (lab already has 'lab_result_ready'). Mirrors the lab template's
-- tenant(s) so notify() resolves it the same way.
-- =====================================================================

INSERT INTO notification_templates (id, tenant_id, key, channel, provider_template_name, body_preview, is_active)
SELECT gen_random_uuid(), nt.tenant_id, 'radiology_report_ready', 'whatsapp', NULL,
  'Dear {{1}}, your radiology report for {{2}} is now available. Please visit the reception. — Uyirly', true
FROM notification_templates nt
WHERE nt.key = 'lab_result_ready'
  AND NOT EXISTS (
    SELECT 1 FROM notification_templates x WHERE x.tenant_id = nt.tenant_id AND x.key = 'radiology_report_ready'
  );

NOTIFY pgrst, 'reload schema';
