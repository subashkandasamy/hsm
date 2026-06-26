# Uyirly — Scaling Notes (Phase 10.7)

## Current architecture

Single Supabase project (single Postgres cluster) with row-level security
(RLS) enforcing tenant isolation via `tenant_id` on every table and the
`current_tenant_id()` helper function.

## How far this scales

| Metric | Safe range on single cluster |
|--------|------------------------------|
| Tenants | Up to ~500 (tested mental model) |
| Rows per high-volume table | Up to ~500M with partitioning |
| Concurrent connections | Up to ~500 (Supabase Pro) |
| Read throughput | Vertical scale + read replica add-on |

## When to consider sharding

Shard when **either** of these is hit:
1. A single tenant's data exceeds ~50M rows in any fact table (visit, appointment, bill_items), **or**
2. Total platform has >500 active tenants generating >1 000 write TPS sustained.

## Sharding strategy (for future reference)

### Option A — Supabase per-tenant projects

Each tenant (or tenant group) gets its own Supabase project.
- Full isolation: separate Postgres, separate auth, separate storage bucket.
- No RLS complexity at all.
- Trade-off: separate migrations pipeline, higher base cost, harder cross-tenant analytics.
- Implementation: route subdomain → Supabase project URL at the proxy layer
  (`src/proxy.ts`). The `tenants` table on a "control plane" DB maps
  `slug → project_url + anon_key`.

### Option B — Postgres schema-per-tenant

Each tenant gets a Postgres schema (`citygeneral`, `apollocare`, …).
- `search_path = <tenant_slug>` per connection instead of RLS.
- Partitioning still applies within each schema.
- Trade-off: schema proliferation, harder to manage migrations.

### Option C — Horizontal sharding (Citus / pg_partman hash sharding)

Distribute rows across multiple Postgres nodes by hashing `tenant_id`.
- Eliminates hot-node problem when one tenant is unusually large.
- Requires Citus extension or Aurora Postgres with sharding.
- Trade-off: complex cross-shard joins; no managed Supabase equivalent yet.

## What is already shard-ready in the codebase

- **Every table has `tenant_id`** — no cross-tenant joins in the data model.
- **`current_tenant_id()` is the single isolation point** — switching to
  `search_path` or a per-project URL only requires changing this function
  and the proxy routing logic.
- **`getReadClient()`** (`src/lib/supabase/read-replica.ts`) — already
  abstracted so a future shard-aware router can be dropped in without
  touching query code.
- **UUIDv7 IDs** — time-ordered, globally unique without a central sequence.
  Safe to merge rows from multiple shards without ID collisions.
- **Materialized views are per-tenant** — each view filters by `tenant_id`,
  so they can be moved per-shard without changing the refresh logic.

## Migration path from single-DB to multi-project

1. Add `project_url` and `anon_key` columns to the `tenants` table on the
   control-plane DB.
2. Update `resolveTenant()` in `src/proxy.ts` to return `project_url`.
3. Update `src/lib/supabase/server.ts` and `read-replica.ts` to accept the
   per-tenant URL from request headers (already injected by the proxy).
4. Run the full migration suite on each new tenant project before onboarding.
5. Backfill existing tenants by dumping their `tenant_id = X` rows and
   restoring into the new project.

## Monitoring checkpoints before sharding

- `SELECT * FROM v_replication_lag` — replica lag > 5s is a signal to scale read tier.
- `SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20` — top slow queries.
- `SELECT count(*), tenant_id FROM visits GROUP BY 2 ORDER BY 1 DESC LIMIT 10` — largest tenants by volume.
- Watch for partition scan warnings from `alert_missing_next_partition()` (daily pg_cron job).
