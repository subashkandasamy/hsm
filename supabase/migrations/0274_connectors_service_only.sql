-- 0274 — connectors becomes server-only.
--
-- APPLY ONLY AFTER the code that reads connectors through the service client
-- is live (the commit that added 0273). The code before it reads this table as
-- the signed-in user and would lose the Settings → Devices page and scan links.
--
-- Why: the policy from 0184 let ANY signed-in staff member of the hospital read
-- and write every column — including viewer_key (the secret that signs scan
-- links), token_hash (whoever writes it can pose as the connector and post lab
-- results) and pairing_code (a live credential for the next few minutes). On
-- the hospital network alone that was a small risk. With the connector
-- reachable from the internet (0273), a leaked viewer_key opens scans from
-- anywhere, so the table goes the way shared_devices and staff_pins went in
-- 0272: no policies, no grants, and every read and write through server code
-- that checks the role first (src/app/actions/devices.ts).
--
-- RLS stays enabled with no policy, which denies everything to anon and
-- authenticated even if a grant reappears later. The service role bypasses it.

DROP POLICY IF EXISTS connectors_tenant_all ON connectors;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON connectors FROM anon, authenticated;
