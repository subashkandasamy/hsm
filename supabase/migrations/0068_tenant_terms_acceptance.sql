-- ============================================================
-- 0068: Record terms/privacy acceptance at signup
-- Additive columns on tenants — captures proof of consent
-- (who accepted the agreement and which version) for the
-- account created at signup. Zero impact on existing rows.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version     TEXT;
