-- Somewhere for a hospital to actually get the installer.
--
-- The settings screen told people to "run the Uyirly Lab Connector installer"
-- and gave them no way to obtain it. This is the missing half.
--
-- ── Why storage rather than the repository ─────────────────────────────────
--
-- The executable is 82 MB, because it is Node with our code inside. Putting
-- that in git would bloat every clone for ever and would not survive the
-- deployment size limit anyway. It goes in a Supabase bucket in ap-south-1 —
-- next door to the hospitals downloading it — and this table records what is
-- there.
--
-- A table rather than a hardcoded URL so a new build can be published without
-- redeploying the application, and so the page can show a version, a size and
-- a checksum rather than an anonymous link.

CREATE TABLE IF NOT EXISTS connector_releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text NOT NULL,
  platform      text NOT NULL,              -- windows | macos | linux
  -- Path inside the bucket. The public URL is derived, never stored, so
  -- moving the project or the CDN does not strand every row.
  file_path     text NOT NULL,
  file_name     text NOT NULL,
  size_bytes    bigint NOT NULL,
  -- Shown on the page so a hospital, or we on a support call, can check the
  -- download is intact. An 82 MB file over a clinic's connection does get
  -- truncated.
  sha256        text NOT NULL,
  notes         text,
  -- Unsigned binaries make SmartScreen complain, and the page should say so
  -- honestly rather than let a hospital think something is wrong.
  is_signed     boolean NOT NULL DEFAULT false,
  published_at  timestamptz NOT NULL DEFAULT now(),
  is_current    boolean NOT NULL DEFAULT true,
  CONSTRAINT connector_releases_platform_check
    CHECK (platform = ANY (ARRAY['windows','macos','linux'])),
  CONSTRAINT connector_releases_version_key UNIQUE (version, platform)
);

-- Exactly one current release per platform, enforced rather than hoped for:
-- a hospital downloading yesterday's build because two rows said 'current' is
-- the kind of bug nobody notices until an analyzer misbehaves.
CREATE UNIQUE INDEX IF NOT EXISTS connector_releases_current_key
  ON connector_releases (platform) WHERE is_current;

ALTER TABLE connector_releases ENABLE ROW LEVEL SECURITY;

-- Shared knowledge, like device_library: every hospital sees the same build.
DROP POLICY IF EXISTS connector_releases_read ON connector_releases;
CREATE POLICY connector_releases_read ON connector_releases FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

-- ── The bucket ──────────────────────────────────────────────────────────────
--
-- Public on purpose. It holds one program we wrote and want people to install;
-- there is no patient data here and never will be. A signed URL would mean a
-- link that expires halfway through an 82 MB download on a clinic's
-- connection, and a download that cannot be resumed or retried.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('connector-downloads', 'connector-downloads', true, 262144000)  -- 250 MB
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 262144000;

-- Anyone may read — that is the point. Only the service role writes, which is
-- the publish script; no policy is needed for that because the service role
-- bypasses these entirely.
DROP POLICY IF EXISTS connector_downloads_public_read ON storage.objects;
CREATE POLICY connector_downloads_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'connector-downloads');
