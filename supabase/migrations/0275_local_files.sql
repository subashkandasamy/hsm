-- 0275 — Uploaded files kept on the hospital's own computer.
--
-- Three kinds of upload move off the cloud once a hospital switches it on
-- (user's choice, 9 Nov 2026): patient-profile documents, IPD declaration
-- uploads, and the image attached to a radiology report. Insurance papers and
-- the hospital logo stay in the cloud.
--
-- How (docs/local-file-server.md): the browser uploads to the cloud exactly as
-- before — a secure Uyirly page cannot upload straight to a local http
-- address, and an upload that fails because a PC is switched off would be
-- worse than one that waits. The file is noted here; the hospital computer
-- downloads it on its next heartbeat, checks it, says so, and only then is the
-- cloud copy deleted. Until that moment the file opens from the cloud as
-- before, so nothing is ever unreachable in between.
--
-- Server-only, like connectors (0274) and staff_pins (0272): no policies, no
-- grants. Read and written by the device API and the server actions.

ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS keep_uploads boolean NOT NULL DEFAULT false;

-- One computer per hospital holds its uploads, so a file is never looked for
-- on the wrong machine.
CREATE UNIQUE INDEX IF NOT EXISTS connectors_keep_uploads_one
  ON connectors (tenant_id) WHERE keep_uploads;

COMMENT ON COLUMN connectors.keep_uploads IS
  'Admin switch: patient documents, IPD declaration uploads and radiology report images move to this computer. One per hospital. Default off.';

CREATE TABLE IF NOT EXISTS local_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Which computer it went (or is going) to. Kept if the computer is removed,
  -- as NULL, so the record still says the file left the cloud.
  connector_id  uuid REFERENCES connectors(id) ON DELETE SET NULL,
  bucket        text NOT NULL,
  -- The same storage path the record (patient_documents.file_path,
  -- radiology_orders.image_url) already holds, so no other table changes.
  path          text NOT NULL,
  kind          text NOT NULL,
  -- waiting: in the cloud, not yet on the computer (opens from the cloud)
  -- on_computer: on the computer, cloud copy deleted
  -- failed: the computer could not take it; still in the cloud, retried
  status        text NOT NULL DEFAULT 'waiting',
  size_bytes    bigint,
  sha256        text,
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  moved_at      timestamptz,
  cloud_deleted_at timestamptz,
  CONSTRAINT local_files_bucket_check CHECK (bucket = ANY (ARRAY['documents','radiology'])),
  CONSTRAINT local_files_kind_check CHECK (kind = ANY (ARRAY['patient_document','ipd_declaration','radiology_image'])),
  CONSTRAINT local_files_status_check CHECK (status = ANY (ARRAY['waiting','on_computer','failed'])),
  CONSTRAINT local_files_path_key UNIQUE (bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_local_files_connector_status ON local_files (connector_id, status);
CREATE INDEX IF NOT EXISTS idx_local_files_tenant ON local_files (tenant_id);

ALTER TABLE local_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON local_files FROM anon, authenticated;
