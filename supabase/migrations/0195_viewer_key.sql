-- A lock on the scan viewer.
--
-- The connector serves images on port 5152 so a doctor at their own desk can
-- see them — the status page's loopback binding would have meant only the
-- person standing beside the machine ever could. But that left the images
-- readable by anyone on the hospital network who had a study's identifier.
--
-- Those identifiers are long and unguessable and nothing lists them, which is
-- obscurity rather than security. For patient images that is not good enough:
-- a study id ends up in a browser history, a chat message, a support ticket,
-- and from then on it is a permanent key to that patient's scans.
--
-- So Uyirly now signs the links it hands out and the connector refuses
-- anything else. The signature is over the study and an expiry, so a link that
-- leaks stops working, and one that is guessed never worked.
--
-- ── Why a second secret rather than the bearer token ───────────────────────
--
-- The connector's token is stored here only as a SHA-256, deliberately, so a
-- database dump leaks nothing. That means the server cannot sign with it. This
-- key is held in the clear because both sides must compute the same signature
-- — it grants nothing on its own, unlike the token, and is scoped to reading
-- images on one hospital's own network.

ALTER TABLE connectors ADD COLUMN IF NOT EXISTS viewer_key text;

COMMENT ON COLUMN connectors.viewer_key IS
  'Shared secret for signing scan-viewer links. Both sides need it in the clear, unlike token_hash. Grants nothing by itself: it only authorises reading images already on that hospital''s own network.';

-- Existing connectors get one now rather than on next pairing, so the viewer
-- is protected immediately instead of after everybody happens to reinstall.
-- Built from two v4 UUIDs rather than gen_random_bytes, which needs pgcrypto
-- and is not enabled here. Two of them carry about 244 bits of randomness,
-- which is far more than this needs.
UPDATE connectors
   SET viewer_key = replace(gen_random_uuid()::text, '-', '')
                 || replace(gen_random_uuid()::text, '-', '')
 WHERE viewer_key IS NULL;
