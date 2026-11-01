-- Which SECURITY DEFINER functions can the API roles call? Read-only; raises
-- by design.
--
--   psql "$DATABASE_URL" -f scripts/verify-rpc-grants.sql
--
-- `pg_default_acl` grants EXECUTE on every new function in `public` to `anon`
-- and `authenticated`, so a SECURITY DEFINER function is exposed at
-- /rest/v1/rpc/<name> the moment it is created unless something revokes it.
-- And the revocation does not survive a recreate:
--
--   CREATE OR REPLACE  -> keeps the ACL
--   DROP + CREATE      -> takes the default ACL back
--
-- That is how 0248 re-exposed `create_next_month_partitions` after a signature
-- change, and it will happen again to anything else that needs a DROP. Hence a
-- standing check rather than a one-off fix.
--
-- The allowlist below is the set that is MEANT to be callable, each with the
-- reason. Anything else appearing here is either a new function that needs a
-- REVOKE, or a deliberate addition that belongs on the list.

DO $$
DECLARE
  v_anon text := '';
  v_auth text := '';
  n_anon int := 0;
  n_auth int := 0;
  r record;

  -- Callable by signed-in staff on purpose.
  auth_ok text[] := ARRAY[
    -- evaluated inside RLS policies; revoking would lock users out
    'current_tenant_id', 'current_active_role', 'current_profile_role',
    'is_tenant_admin', 'is_platform_admin',
    -- called by the app as the acting user
    'ensure_appointment_partition', 'effective_test_range',
    'claim_bed_and_admit', 'transfer_bed', 'dispense_drug', 'issue_blood_unit',
    'save_lab_analyte_results', 'apply_advance_to_bill', 'record_bill_payment',
    'issue_credit_note', 'refund_admission_advance', 'cancel_bill',
    'get_mlc_pending', 'get_order_analyte_form', 'get_lab_report_analytes',
    'withdraw_stale_critical', 'withdraw_stale_critical_item',
    'bump_note_template_use', 'ensure_lab_samples',
    'get_unknown_analyzer_codes', 'get_unmatched_messages',
    'get_monthly_return_summary', 'get_mtp_drug_status',
    'get_next_appointment_token', 'get_next_bill_no', 'get_next_credit_no',
    'get_next_estimate_no', 'get_next_form_f_no', 'get_next_mlc_no',
    'get_next_mtp_no', 'get_next_po_no', 'get_next_referral_no',
    'get_next_summary_no', 'get_next_uhid', 'get_next_uhid_for',
    'tenant_doc_prefix', 'tenant_doc_prefix_short',
    'log_h1_supply', 'mtp_draft_on_dispense'
  ];

  -- Callable without signing in on purpose. Deliberately short.
  anon_ok text[] := ARRAY[
    -- return NULL without a session, and are needed by policy evaluation
    'current_tenant_id', 'current_active_role'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS a,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
     ORDER BY p.proname
  LOOP
    IF r.a AND NOT (r.proname = ANY (anon_ok)) THEN
      n_anon := n_anon + 1;
      v_anon := v_anon || format(E'\n    %s(%s)', r.proname, r.args);
    END IF;
    IF r.u AND NOT (r.proname = ANY (auth_ok)) THEN
      n_auth := n_auth + 1;
      v_auth := v_auth || format(E'\n    %s(%s)', r.proname, r.args);
    END IF;
  END LOOP;

  RAISE EXCEPTION '%', format(
    E'\nSECURITY DEFINER RPC GRANTS\n'
     '  callable by anon, not allowlisted          : %s   <- must be 0%s\n'
     '  callable by authenticated, not allowlisted : %s%s',
    n_anon, v_anon, n_auth, v_auth);
END $$;
