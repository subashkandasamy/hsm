# Uyirly HMS — Consolidated Database Baseline

A **from-scratch bootstrap** of the entire Uyirly database, consolidated from
migrations `0001`–`0068` into a small ordered set of files. Use this to stand up
a **fresh database on your own server** (self-hosted Supabase or a Supabase
project) for tenant hosting, instead of replaying 68 incremental migrations.

The old numbered migrations in `../migrations/` are **left untouched** — this is
an additive, parallel artifact for verification and fresh installs.

> **Source of truth:** `01_schema.sql` is a direct `pg_dump --schema-only` of the
> live production database (project `gvkenyljjmsttucyicps`), so it reflects the
> *actual current schema* — not the sum of migrations, which had drifted (see
> "Findings"). Everything is verified against the live catalog (see "Verification").

## Files — apply in order

| # | File | What it does |
|---|------|--------------|
| 0 | `00_prerequisites.sql` | Extensions (pgcrypto, btree_gist, pg_trgm, pg_cron) + `auth` schema notes |
| 1 | `01_schema.sql` | 102 tables (5 partitioned + 175 partitions), 5 matviews, 14 functions, 294 indexes, 307 constraints, 102 RLS-enabled tables, 99 policies |
| 2 | `02_partition_bootstrap.sql` | Rolling partition window around *today* + `pg_cron` jobs |
| 3 | `03_seed_master_data.sql` | Global master catalogs: 278 drugs, 201 brands, 864 lab tests, 746 radiology studies |

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 00_prerequisites.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 01_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 02_partition_bootstrap.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 03_seed_master_data.sql
```

## Prerequisites for a fresh server

1. **PostgreSQL 15+** (production is 17.6).
2. **Extensions**: `pgcrypto`, `btree_gist`, `pg_trgm`, and (for automatic
   partitioning) `pg_cron`. `pg_cron` must be in `shared_preload_libraries`.
3. **`auth` schema** — the schema references `auth.users`, `auth.uid()`,
   `auth.role()`:
   - **Self-hosted Supabase / a Supabase project** → provided by GoTrue; nothing to do.
   - **Plain PostgreSQL** → uncomment the auth stub in `00_prerequisites.sql`.
4. **Storage buckets** (create in Supabase Storage — not part of the SQL schema):
   - `documents` — private
   - `tenant-logos` — public
   - `radiology` — private *(referenced by code; missing in current prod — see Findings)*

## Verification (3-way)

| Check | Result |
|-------|--------|
| **SQL ↔ live DB** | Exact — `01_schema.sql` is the live `pg_dump`. Object counts match live: tables 102, matviews 5, functions 14, policies 99, indexes 294, constraints 307, RLS 102. |
| **Code ↔ live DB** | All **78** distinct tables the app queries (`.from('…')`) exist in the live schema. The lone apparent miss (`radiology`) is a **storage bucket**, not a table. |
| **SQL ↔ migrations** | Live schema reflects migrations through **0068**; the Supabase migration-history table only recorded through **0063** (0064–0068 were applied out-of-band). The baseline captures the true 0068 state. |

## Findings surfaced during consolidation

- **Migration-history drift**: `supabase_migrations.schema_migrations` stops at
  `0063`, but the live schema includes `0064`–`0068` (applied via raw SQL). The
  live DB — not the migration history — is authoritative; this baseline uses it.
- **Missing `radiology` storage bucket**: code uploads radiology images to a
  `radiology` bucket that does not exist in prod. Uploads fail gracefully
  ("Report saved without image"). Create the bucket to enable image storage.
- **Counter tables, not sequences**: UHID / bill-no / PO-no / appointment-token
  use dedicated counter tables with `SELECT … FOR UPDATE` RPCs (`get_next_*`),
  not Postgres sequences — captured in `01_schema.sql`.

## Regenerating this baseline

```bash
PGDUMP=/usr/local/Cellar/postgresql@17/*/bin/pg_dump
PGPASSWORD='<db-password>' "$PGDUMP" \
  "postgresql://postgres.gvkenyljjmsttucyicps@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
  --schema=public --schema-only --no-owner --no-privileges --no-comments \
  -f 01_schema.sql
# then re-guard: CREATE SCHEMA public;  ->  CREATE SCHEMA IF NOT EXISTS public;
# and strip \restrict / \unrestrict lines.
```
