-- ============================================================================
-- Uyirly HMS — Consolidated Baseline  ·  FILE 00: PREREQUISITES
-- ============================================================================
-- Run FIRST, before 01_schema.sql.
--
-- This baseline reproduces the exact live production schema (Supabase project
-- gvkenyljjmsttucyicps) as of the dump date, consolidated from migrations
-- 0001–0068. Apply the files IN ORDER:
--
--   00_prerequisites.sql        <- extensions + auth dependency (this file)
--   01_schema.sql               <- tables, matviews, functions, indexes, RLS
--   02_partition_bootstrap.sql  <- current-window partitions + monthly cron
--   03_seed_master_data.sql     <- global drug/lab/radiology catalogs
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- On Supabase these live in the `extensions` schema; on a plain server `public`
-- is fine. gen_random_uuid() (pgcrypto) is used for nearly every primary key.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;    -- exclusion constraints (OT overlap)
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- trigram / text_pattern indexes

-- pg_cron drives automatic monthly partition creation (see 02_...).
-- It must be enabled at the server level (shared_preload_libraries) and is not
-- available on every host. If unavailable, skip it — you can instead run
-- create_next_month_partitions() from an external scheduler (cron/systemd).
-- On Supabase: enable it from Dashboard → Database → Extensions.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH DEPENDENCY  (IMPORTANT)
-- The schema depends on Supabase's `auth` schema:
--   • profiles.id  REFERENCES auth.users(id) ON DELETE CASCADE
--   • RLS policies call auth.uid() and auth.role()
--
-- • Self-hosted Supabase  → the `auth` schema is provided by GoTrue. Nothing to do.
-- • Plain PostgreSQL      → uncomment the minimal stub below so the FKs and
--   policy expressions resolve. Replace with real auth wiring for production.
-- ─────────────────────────────────────────────────────────────────────────────
-- CREATE SCHEMA IF NOT EXISTS auth;
--
-- CREATE TABLE IF NOT EXISTS auth.users (
--   id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   email text UNIQUE
-- );
--
-- -- Returns the current user id from the JWT claims (set per request/session).
-- CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
--   LANGUAGE sql STABLE AS $$
--     SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
--   $$;
--
-- -- Returns the current role from the JWT claims (defaults to 'authenticated').
-- CREATE OR REPLACE FUNCTION auth.role() RETURNS text
--   LANGUAGE sql STABLE AS $$
--     SELECT coalesce(
--       nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
--       'authenticated')
--   $$;
