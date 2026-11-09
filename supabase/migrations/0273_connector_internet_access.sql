-- 0273 — A hospital's connector can be reached from the internet, through a
-- Cloudflare Tunnel, when an admin switches that on.
--
-- Why: scans and files stay on the hospital's own computer (see
-- docs/local-file-server.md), but a doctor at home and the patient portal need
-- to open them. The connector dials out to Cloudflare, so no port is opened on
-- the hospital's router and no public IP is needed.
--
-- Off by default. Putting a hospital's files on the internet is a decision an
-- admin makes per computer, never a side effect of installing the connector.
--
-- Columns only. Safe for the code that is live before this ships: nothing
-- existing reads or writes them.

ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS internet_access       boolean NOT NULL DEFAULT false,
  -- The address the connector's heartbeat came from. When a browser asking for
  -- a scan comes from the same address it is inside the hospital, so it gets
  -- the fast local link instead of a trip out to the internet and back.
  ADD COLUMN IF NOT EXISTS public_ip             text,
  -- Cloudflare's identifiers. The tunnel's run token is NOT stored: it is
  -- fetched from Cloudflare when the connector asks, so a database dump holds
  -- nothing that can run a tunnel.
  ADD COLUMN IF NOT EXISTS tunnel_id             text,
  ADD COLUMN IF NOT EXISTS tunnel_hostname       text,
  ADD COLUMN IF NOT EXISTS tunnel_dns_record_id  text,
  -- What the connector last reported about its tunnel, and when.
  ADD COLUMN IF NOT EXISTS tunnel_state          text,
  ADD COLUMN IF NOT EXISTS tunnel_state_at       timestamptz;

ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_tunnel_state_check;
ALTER TABLE connectors ADD CONSTRAINT connectors_tunnel_state_check
  CHECK (tunnel_state IS NULL OR tunnel_state = ANY (ARRAY['off','starting','up','down','missing']));

CREATE UNIQUE INDEX IF NOT EXISTS connectors_tunnel_hostname_key
  ON connectors (tunnel_hostname) WHERE tunnel_hostname IS NOT NULL;

COMMENT ON COLUMN connectors.internet_access IS
  'Admin switch: may this computer serve files to the internet through its Cloudflare Tunnel. Default off.';
COMMENT ON COLUMN connectors.tunnel_state IS
  'Last reported by the connector heartbeat: off | starting | up | down | missing (cloudflared not installed).';
