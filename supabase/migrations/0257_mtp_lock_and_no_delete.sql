-- F-54 — the MTP register has two of the three controls the other two have.
--
--   register          completeness  locked after completion  delete blocked
--   form_f_records    yes           yes                      yes
--   mlc_records       yes           yes                      yes
--   mtp_records       yes           NO                       NO
--
-- A completed MTP record could be silently edited, and deleted outright. Form F
-- and MLC both refuse. Of the three this is the register where a silent edit
-- matters most: MTP records carry statutory confidentiality and a retention
-- duty under the Medical Termination of Pregnancy Act. The pattern exists twice
-- already with the same helper shape, which reads as an omission rather than a
-- decision.
--
-- THE PART THAT IS NOT A COPY
--
-- `mtp_records.status` allows only ('draft','complete'). Form F and MLC allow
-- ('draft','complete','amended'), and their lock triggers permit exactly one
-- transition out of 'complete' — into 'amended' — so a mistake on a signed
-- record can be corrected by superseding it.
--
-- Adding the lock alone would therefore have been worse than leaving it: a typo
-- on a completed MTP record would become permanent, on a register a hospital is
-- legally required to keep accurate, with no route to a correction. The status
-- vocabulary and the amendment columns come first; the lock is only safe once
-- there is a way out.
--
-- 0 rows today, so nothing is being locked retroactively.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. An amendment route, matching Form F.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mtp_records
  ADD COLUMN IF NOT EXISTS amends_id    uuid REFERENCES public.mtp_records(id),
  ADD COLUMN IF NOT EXISTS amend_reason text;

ALTER TABLE public.mtp_records DROP CONSTRAINT IF EXISTS mtp_records_status_check;
ALTER TABLE public.mtp_records
  ADD CONSTRAINT mtp_records_status_check
  CHECK (status IN ('draft', 'complete', 'amended'));

COMMENT ON COLUMN public.mtp_records.amends_id IS
  'The completed record this one supersedes. Set by amendMtp; the original moves to status=amended (F-54).';
COMMENT ON COLUMN public.mtp_records.amend_reason IS
  'Why the original was amended. Required — a correction with no reason reads as tampering.';

-- ---------------------------------------------------------------------------
-- 2. Locked once complete.
-- ---------------------------------------------------------------------------
-- Modelled on form_f_lock_completed, including its service_role escape hatch,
-- which is needed so `purge_tenant_data` can remove a tenant. Worth restating
-- the consequence the audit already recorded: that hatch means our own backend
-- can edit a completed statutory record without the lock firing. The lock
-- protects the register from the hospital's users, not from us.
CREATE OR REPLACE FUNCTION public.mtp_lock_completed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'complete' THEN
    -- The one permitted way out: superseded by an amendment.
    IF NEW.status = 'amended' AND OLD.status <> 'amended' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'MTP record % is complete and cannot be edited. Raise an amendment instead — the original stays on the register.',
      OLD.serial_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_mtp_lock_completed ON public.mtp_records;
CREATE TRIGGER trg_mtp_lock_completed
  BEFORE UPDATE ON public.mtp_records
  FOR EACH ROW EXECUTE FUNCTION public.mtp_lock_completed();

-- ---------------------------------------------------------------------------
-- 3. Not deletable once it is more than a draft.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mtp_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'MTP record % cannot be deleted — the Act requires the register be kept.',
      OLD.serial_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_mtp_no_delete ON public.mtp_records;
CREATE TRIGGER trg_mtp_no_delete
  BEFORE DELETE ON public.mtp_records
  FOR EACH ROW EXECUTE FUNCTION public.mtp_no_delete();

-- These two are new functions, so they take the default ACL. They are triggers
-- and have no business being callable as RPCs — the lesson of F-77, applied in
-- the migration that creates them this time rather than the one after.
REVOKE ALL ON FUNCTION public.mtp_lock_completed() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mtp_no_delete()      FROM public, anon, authenticated;

COMMIT;
