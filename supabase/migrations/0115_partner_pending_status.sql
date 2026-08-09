-- Migration 0115: allow self-registered partners to await admin approval.
-- Adds 'pending' (awaiting approval) and 'rejected' to partners.status.

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_status_check;
ALTER TABLE partners ADD  CONSTRAINT partners_status_check
  CHECK (status IN ('pending', 'active', 'suspended', 'rejected'));
