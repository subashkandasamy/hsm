-- The retention rule must not make a tenant undeletable.
--
-- 0201 refused to delete any Form F that is not a draft, because the Act
-- requires the record be kept for two years and a missing serial is a question
-- a hospital does not want to be asked.
--
-- That was right for a user and wrong for the platform. purge_tenant_data runs
-- when a hospital leaves, or when an erasure request has to be honoured under
-- the DPDP Act, and it ran straight into this trigger:
--
--   purge_tenant_data: Form F F/2627/00001 cannot be deleted —
--   the Act requires it be kept for two years. (continuing)
--
-- Leaving it would mean a tenant could be onboarded and never removed, with
-- their patients' reproductive histories stuck on our servers for ever. That
-- is a worse outcome than the one the trigger was guarding against.
--
-- ── Where the line actually falls ──────────────────────────────────────────
--
-- The two-year duty binds the HOSPITAL. It is their register, their
-- inspection, their liability. It does not bind us to retain data for a
-- customer who has left and asked us to erase it.
--
-- A hospital user is never service_role — that key exists only in our own
-- backend. So the retention rule stands for every real user of the product,
-- and the purge path can do its job.

CREATE OR REPLACE FUNCTION form_f_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Platform-level erasure: tenant purge, or a data-deletion request. Never
  -- reachable from the application, because a hospital's session is always
  -- 'authenticated' and never 'service_role'.
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Form F % cannot be deleted — the Act requires it be kept for two years.',
      OLD.serial_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END $$;

-- The same reasoning applies to the edit lock: a purge may need to cascade
-- through these rows, and a completed form must not be what stops it.
CREATE OR REPLACE FUNCTION form_f_lock_completed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'complete' THEN
    IF NEW.status = 'amended' AND OLD.status <> 'amended' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Form F % is complete and cannot be edited. Raise an amendment instead — the original stays on the record.',
      OLD.serial_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
