-- The connector, the device library, and the raw message store.
--
-- Everything here is testable without an analyzer: a recorded ASTM message
-- replayed into the ingest endpoint exercises the whole path. That is
-- deliberate — the first real machine is weeks away and the parts that can be
-- proved now should be proved now.
--
-- ── Three rules this schema exists to enforce ──────────────────────────────
--
-- 1. Raw before parsed. The message is stored before anything tries to
--    understand it, so a parser bug loses a debugging trail, not a patient's
--    result. It is also what lets us build support for an instrument we have
--    never seen, remotely, from its own traffic.
--
-- 2. Idempotent by construction. Analyzers retransmit freely — on a timeout, on
--    a reconnect, when a technician presses send again. A duplicate must be a
--    no-op, not a second result.
--
-- 3. Tenant is explicit. The ingest route runs as the service role, where
--    current_tenant_id() is NULL and RLS does not apply. The tenant comes from
--    the connector's token and is written onto every row. This is the trap that
--    produced the daily-billing rule and bit again in get_next_po_no.

-- ── The connector: one per laboratory PC ────────────────────────────────────

CREATE TABLE IF NOT EXISTS connectors (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  machine_name  text,                 -- what the lab PC calls itself
  -- Claimed once, at install, then cleared. Short enough to read down a phone.
  pairing_code  text,
  -- SHA-256 of the bearer token. The token itself is shown once and never
  -- stored — there is nothing to leak from a database dump.
  token_hash    text,
  lan_ip        text,                 -- where to point the analyzer
  listen_port   int NOT NULL DEFAULT 5150,
  version       text,
  status        text NOT NULL DEFAULT 'pending',
  last_seen_at  timestamptz,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connectors_status_check CHECK (status = ANY (ARRAY['pending','online','offline','revoked']))
);

CREATE UNIQUE INDEX IF NOT EXISTS connectors_pairing_key
  ON connectors (pairing_code) WHERE pairing_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS connectors_token_key
  ON connectors (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connectors_tenant ON connectors (tenant_id);

-- ── The device library: global, and the thing that makes setup zero-touch ──
--
-- Keyed on the identity string an instrument announces about itself — ASTM's
-- header record carries NAME^VENDOR^VERSION, HL7's MSH-3 the sending
-- application. Recognise that and we already know what its codes mean, so the
-- second hospital with a BC-5130 configures nothing at all.

CREATE TABLE IF NOT EXISTS device_library (
  id            uuid PRIMARY KEY,
  fingerprint   text NOT NULL,
  manufacturer  text NOT NULL,
  model         text NOT NULL,
  protocol      text NOT NULL,        -- astm | hl7
  framing       text,                 -- framed | raw
  default_port  int,
  notes         text,
  verified_at   timestamptz,          -- null = built from traffic, not yet confirmed against a real machine
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_library_fingerprint_key UNIQUE (fingerprint),
  CONSTRAINT device_library_protocol_check CHECK (protocol = ANY (ARRAY['astm','hl7']))
);

CREATE TABLE IF NOT EXISTS device_library_codes (
  id                uuid PRIMARY KEY,
  device_library_id uuid NOT NULL REFERENCES device_library(id) ON DELETE CASCADE,
  analyzer_code     text NOT NULL,    -- what the machine calls it: HGB, WBC-N
  analyte_id        uuid NOT NULL REFERENCES lab_analytes(id),
  unit_ucum         text,
  decimals          int,
  factor            numeric,          -- when the machine reports in another unit
  CONSTRAINT device_library_codes_key UNIQUE (device_library_id, analyzer_code)
);

-- ── An analyzer, as one hospital has it ────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_analyzers (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id      uuid REFERENCES connectors(id) ON DELETE SET NULL,
  device_library_id uuid REFERENCES device_library(id),   -- null until recognised
  fingerprint       text,
  manufacturer      text,
  model             text,
  serial_no         text,
  protocol          text,
  framing           text,
  transport         text,             -- tcp | serial | file
  direction         text NOT NULL DEFAULT 'unidirectional',
  -- discovered → seen, not yet mapped.  quarantine → mapped, results held for
  -- eyeballing.  live → results flow.  paused → switched off by the hospital.
  status            text NOT NULL DEFAULT 'discovered',
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_message_at   timestamptz,
  CONSTRAINT lab_analyzers_status_check CHECK (status = ANY (ARRAY['discovered','quarantine','live','paused'])),
  CONSTRAINT lab_analyzers_fingerprint_key UNIQUE (tenant_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_lab_analyzers_tenant ON lab_analyzers (tenant_id, status);

-- What this hospital's machine calls each measurement. Seeded from the library
-- when recognised; a hospital can correct any row, and a correction wins.
CREATE TABLE IF NOT EXISTS analyzer_mappings (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analyzer_id    uuid NOT NULL REFERENCES lab_analyzers(id) ON DELETE CASCADE,
  analyzer_code  text NOT NULL,
  analyte_id     uuid REFERENCES lab_analytes(id),   -- null = seen but unmapped
  unit_ucum      text,
  decimals       int,
  factor         numeric,
  source         text NOT NULL DEFAULT 'library',
  enabled        boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analyzer_mappings_key UNIQUE (analyzer_id, analyzer_code),
  CONSTRAINT analyzer_mappings_source_check CHECK (source = ANY (ARRAY['library','confirmed','manual']))
);

CREATE INDEX IF NOT EXISTS idx_analyzer_mappings_unmapped
  ON analyzer_mappings (tenant_id, analyzer_id) WHERE analyte_id IS NULL;

-- ── Raw messages ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analyzer_messages (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id     uuid REFERENCES connectors(id) ON DELETE SET NULL,
  analyzer_id      uuid REFERENCES lab_analyzers(id) ON DELETE SET NULL,
  sample_barcode   text,
  raw_message      text NOT NULL,
  parsed_json      jsonb,
  -- received → stored, not yet parsed.  parsed → understood.  matched → written
  -- to a patient.  unmatched → no order for that barcode, a human must resolve.
  -- failed → the parser could not understand it, and the raw text is still here.
  status           text NOT NULL DEFAULT 'received',
  error            text,
  idempotency_key  text NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analyzer_messages_status_check CHECK (status = ANY (ARRAY['received','parsed','matched','unmatched','failed','ignored'])),
  -- Keyed on the connector, not the analyzer: at the moment a message arrives
  -- we may not know which instrument sent it.
  CONSTRAINT analyzer_messages_idem_key UNIQUE (connector_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_analyzer_messages_open
  ON analyzer_messages (tenant_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyzer_messages_barcode
  ON analyzer_messages (tenant_id, sample_barcode) WHERE sample_barcode IS NOT NULL;

-- ── Row level security ──────────────────────────────────────────────────────
--
-- The ingest route writes as the service role and bypasses all of this; these
-- policies are what stops one hospital reading another's from the app.

ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_analyzers ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyzer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyzer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_library_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connectors_tenant_all ON connectors;
CREATE POLICY connectors_tenant_all ON connectors FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS lab_analyzers_tenant_all ON lab_analyzers;
CREATE POLICY lab_analyzers_tenant_all ON lab_analyzers FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS analyzer_mappings_tenant_all ON analyzer_mappings;
CREATE POLICY analyzer_mappings_tenant_all ON analyzer_mappings FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS analyzer_messages_tenant_all ON analyzer_messages;
CREATE POLICY analyzer_messages_tenant_all ON analyzer_messages FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- The library is shared knowledge, like lab_tests_master: everyone reads it.
DROP POLICY IF EXISTS device_library_read ON device_library;
CREATE POLICY device_library_read ON device_library FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');
DROP POLICY IF EXISTS device_library_codes_read ON device_library_codes;
CREATE POLICY device_library_codes_read ON device_library_codes FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');
