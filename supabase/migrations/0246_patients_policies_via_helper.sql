-- F-09. All three `patients` policies — SELECT, INSERT and UPDATE, not just the
-- UPDATE the finding names — embed an EXISTS subquery against `profiles`:
--
--   tenant_id = (select current_tenant_id())
--   AND EXISTS (SELECT 1 FROM profiles p
--                WHERE p.id = (select auth.uid())
--                  AND p.is_active = true
--                  AND p.tenant_id = (select current_tenant_id())
--                  AND p.role = ANY (ARRAY[...]))
--
-- This is not recursion today, because the `profiles` SELECT policy does not
-- reference `patients`. It becomes mutual recursion the day one does — the same
-- shape as the outage that took karur down, where a `profiles` policy queried
-- `profiles`. A latent fault of exactly the kind that is cheap now and an
-- emergency later.
--
-- THE TRAP, recorded because the obvious conversion is wrong:
-- `current_profile_role()` already exists and looks like the right helper. It
-- is not. Its body is `SELECT role FROM profiles WHERE id = auth.uid()` — no
-- `is_active`, no tenant comparison. Swapping the EXISTS for
-- `current_profile_role() = ANY (ARRAY[...])` would silently drop the
-- **is_active** check, so a deactivated staff member holding a live session
-- would regain write access to the patient register. The app layer redirects
-- them at `(dashboard)/layout.tsx`, but this policy is the defence in depth
-- underneath it, and quietly removing it while "tidying up" would be worse than
-- leaving the subquery alone.
--
-- So this adds a helper that preserves all three conditions exactly.

CREATE OR REPLACE FUNCTION public.current_active_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- The caller's own role, and only when the account is active and belongs to
  -- the hospital being served. Reads one row — the caller's — so being
  -- SECURITY DEFINER exposes nothing that auth.uid() did not already identify,
  -- and it cannot be pointed at anybody else. Being DEFINER is the point: it
  -- reads `profiles` without `profiles` RLS applying, which is what breaks the
  -- policy-to-policy link.
  SELECT role FROM profiles
   WHERE id = (SELECT auth.uid())
     AND is_active = true
     AND tenant_id = (SELECT current_tenant_id())
$function$;

-- Granted to anon as well as authenticated, deliberately, and for the same
-- reason migration 0238 carved out current_tenant_id: a policy whose function
-- the caller cannot EXECUTE **raises** rather than returning no rows. An
-- unauthenticated request must get "no rows", not an error. The function
-- returns NULL for anon anyway, since auth.uid() is NULL.
REVOKE ALL ON FUNCTION public.current_active_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_active_role() TO anon, authenticated, service_role;

-- ── The three policies, with identical role lists to before ─────────────────
-- NULL = ANY(...) evaluates to NULL, which a policy treats as false, so an
-- inactive or foreign caller is refused exactly as the EXISTS refused them.

DROP POLICY IF EXISTS patients_tenant_read ON public.patients;
CREATE POLICY patients_tenant_read ON public.patients
  FOR SELECT
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = ANY (ARRAY[
      'admin', 'doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'accountant'
    ])
  );

DROP POLICY IF EXISTS patients_tenant_write ON public.patients;
CREATE POLICY patients_tenant_write ON public.patients
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = ANY (ARRAY[
      'admin', 'doctor', 'nurse', 'receptionist'
    ])
  );

DROP POLICY IF EXISTS patients_tenant_update ON public.patients;
CREATE POLICY patients_tenant_update ON public.patients
  FOR UPDATE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = ANY (ARRAY[
      'admin', 'doctor', 'nurse', 'receptionist'
    ])
  )
  -- Spelled out rather than relying on Postgres reusing USING as the write
  -- check. Behaviourally identical to before — the reuse was already doing
  -- this — but it makes explicit that a patient cannot be updated INTO another
  -- hospital.
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = ANY (ARRAY[
      'admin', 'doctor', 'nurse', 'receptionist'
    ])
  );
