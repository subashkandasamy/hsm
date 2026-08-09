-- Migration 0118: stop pre-seeding tenant catalogs.
-- Signup no longer copies the master into each tenant's lab/radiology catalog.
-- Purge the previously-seeded, never-activated placeholder rows (inactive).
-- Anything a tenant actually activated (is_active = true, real price) is kept.
-- One-time cleanup; future catalog rows are only added on demand from master.

DELETE FROM lab_tests_catalog  WHERE is_active = false;
DELETE FROM radiology_catalog  WHERE is_active = false;
