-- Migration 0117: email + password login for partners (replaces magic-link).
-- password_hash stores a scrypt hash (salt:hash). partner_login_tokens is
-- reused as set/reset-password tokens (single-use, expiring).

ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_hash TEXT;
