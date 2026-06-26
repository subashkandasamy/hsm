-- ============================================================
-- Fix: notification_templates unique constraint
-- The original constraint was UNIQUE(key) — globally unique.
-- With multi-tenant, each tenant needs its own set of templates,
-- so the correct constraint is UNIQUE(key, tenant_id).
-- Without this fix, the 2nd+ tenant signup fails to seed templates
-- because 'appointment_reminder' etc already exist from tenant 1.
-- ============================================================

-- Drop FK on notifications that depends on the old constraint
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_template_key_fkey;

-- Drop old global unique constraint
ALTER TABLE notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_key_key;

-- Add per-tenant unique constraint
ALTER TABLE notification_templates
  ADD CONSTRAINT notification_templates_key_tenant_unique
  UNIQUE (key, tenant_id);
