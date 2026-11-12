-- BUG-058 (E2E 12 Nov 2026): "duplicate key value violates unique constraint
-- referrals_out_ref_no_key" on writing a referral letter. referral_seq had
-- fallen behind numbers already in referrals_out for that hospital, and each
-- failed try burnt a number. The counter now steps past any number already
-- used, so it heals itself on the next letter — no data is rewritten here, and
-- no hospital's existing letters or counter are touched until it writes one.
-- (createReferralOut also retries on a clash, for databases without this.)

CREATE OR REPLACE FUNCTION get_next_referral_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy     int  := fy_start_year();
  v_seq    int;
  v_no     text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_next_referral_no: tenant_id could not be resolved';
  END IF;
  LOOP
    INSERT INTO referral_seq (tenant_id, year, last_no) VALUES (v_tenant, v_fy, 1)
    ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = referral_seq.last_no + 1
    RETURNING last_no INTO v_seq;
    v_no := 'REF/' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM referrals_out WHERE tenant_id = v_tenant AND ref_no = v_no);
  END LOOP;
  RETURN v_no;
END $$;
