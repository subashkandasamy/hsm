# Uyirly HMS — Security & Isolation Audit

_Audit of multi-tenant isolation (all tables) + application-layer code review._
_Method: live catalog inspection (`pg_policies`, `pg_class`) + RLS simulation + source review. Not a formal pentest._

## Executive summary

**Tenant isolation is fundamentally sound.** All 77 base tables (plus 175 partitions
that inherit their parent's RLS) are correctly scoped. RLS was verified *empirically*
(impersonating a tenant user under RLS returned only that tenant's rows), not just by
reading policies. **No cross-tenant data leak exists.**

The one real defect found — a cross-tenant **access** gap (shared session cookie across
subdomains) — has been **fixed**. Remaining items are hardening / hygiene, not active leaks.

---

## Part 1 — Table-by-table isolation audit (all 77 base tables)

| Category | Count | Verdict | Tables |
|---|---|---|---|
| **Tenant-scoped** (`tenant_id = current_tenant_id()`, RLS on) | 64 | ✅ Correct | admission_advance_refunds, admission_advances, admission_nurse_assignments, admissions, advance_deposit_requests, appointments\*, audit_logs\*, auth_otp_codes, beds, bill_items\*, bills, blood_donors, blood_issues, blood_requests, blood_units, dental_recalls, dental_treatments, departments, dispenses, drug_batches, drugs, duty_roster, emergency_cases, insurance_claims, insurance_policies, inventory_items, ipd_admin_schedule, ipd_billing_config, ipd_custom_charges, ipd_medication_orders, ipd_pharmacy_requests, ipd_progress_notes, lab_order_items\*, lab_orders, lab_tests_catalog, notification_templates, notifications, ot_consumables, ot_rooms, ot_schedules, patient_allergies, patient_dental_chart, patient_documents, patients, payments, pharmacy_sale_items, pharmacy_sales, po_items, prescriptions, procedure_tariffs, profiles, purchase_orders, radiology_catalog, radiology_orders, staff_attendance, staff_profiles, stock_movements, subscriptions, suppliers, tariffs, tenant_profiles, visits\*, ward_room_types, wards |
| **Counter tables** (RLS deny-all; mutated only via `SECURITY DEFINER` RPCs `get_next_*`) | 4 | ✅ Correct | appointment_token_counter, uhid_counter, bill_no_seq, po_no_seq |
| **Per-user** (`profile_id = auth.uid()`) | 1 | ✅ Correct | device_push_tokens |
| **Global master catalogs** (read-only reference; `SELECT` = authenticated, writes denied to tenant users) | 4 | ✅ Correct | drug_master, drug_brands, lab_tests_master, radiology_master |
| **Parent-scoped junction** (via `ot_schedule_id → ot_schedules.tenant_id`) | 1 | ✅ Correct | ot_team_members |
| **Platform-admin only** (`EXISTS(platform_admins WHERE id = auth.uid())`) | 2 | ✅ Correct | platform_admins, platform_admin_audit |
| **Tenant registry** (`id = current_tenant_id()` OR platform admin) | 1 | ✅ Correct | tenants |

\* = range-partitioned parent; its 175 monthly child partitions inherit the parent's RLS.

**Key mechanism:** `current_tenant_id()` — a `STABLE SECURITY DEFINER` function returning
`SELECT tenant_id FROM profiles WHERE id = auth.uid()`. Every tenant policy compares
`tenant_id` to this. `tenant_profiles` uses an equivalent inline subquery.

**Empirical proof:** under RLS, `SET ROLE authenticated` + a tenant accountant's JWT `sub`
→ `SELECT count(*), count(DISTINCT tenant_id) FROM bills` returned **1 tenant only**.

### Result: 0 RLS gaps across the whole schema.

---

## Part 2 — Application code review

### 2.1 RLS-bypass discipline (service-role clients)

Two mechanisms bypass RLS and therefore **must** filter `tenant_id` manually:

- `createServiceClient()` — used in ~10 action files.
- `getReadClient()` — service-role read client; used **only** in `dashboard.ts`.

Review result — **all reviewed usages are correctly tenant-scoped**:

| File | Usage | Scoping |
|---|---|---|
| `dashboard.ts` | matviews + CSV export | `.eq('tenant_id', actor.tenant_id)` on every query ✅ |
| `subscription.ts`, `tenantProfile.ts`, `tenantSettings.ts` | tenant billing/settings | filtered by `actor.tenant_id` ✅ |
| `pushTokens.ts` | device tokens | filtered by `profile_id` ✅ |
| `hr.ts`, `documents.ts` | staff/docs **reads** | use the **RLS client** (`createClient()`), not the service client ✅ |
| `onboarding.ts` | signup | writes are scoped to the newly-created `tenantId` ✅ |
| `platform.ts`, `seeds.ts` | platform admin | intentionally cross-tenant, gated by `requirePlatformAdmin()` ✅ |

> ⚠️ **Latent risk (not a current bug):** this safety depends on developers remembering to
> add `.eq('tenant_id', …)` on every service-client query. Materialized views
> (`mv_*_by_tenant`) have **no RLS at all**. A future unscoped service-client query would
> leak silently. **Recommendation:** a thin wrapper (e.g. `tenantScoped(service, table, tenantId)`)
> or a lint rule that flags service-client reads of tenant tables without a tenant filter.

### 2.2 Role-based access control (RBAC)

- `PERMISSION_MATRIX: Record<Role, Permission[]>` — 7 roles (admin, doctor, nurse,
  receptionist, lab_tech, pharmacist, accountant), granular permissions, **no over-grants**
  (e.g. doctor lacks `billing:manage`, `hr:manage`, `settings:write`).
- `requirePermission()` gates clinical/billing/HR actions; `requireWriteAccess()` enforces
  read-only mode (trial/lapsed).
- Files with no `requirePermission` are legitimately exempt: `auth`/`onboarding`/`tenantLookup`
  (pre-auth/public), `platform`/`seeds` (guarded by `requirePlatformAdmin`).

> ⚠️ **Defense-in-depth gap:** RBAC is enforced at the **app layer**. RLS enforces *tenant*
> isolation but generally **not role** (exceptions: `appointments`/`visits` policies embed
> role checks). If a code path skipped `requirePermission()`, any authenticated tenant user
> could perform any action *within their own tenant* at the DB level. **Recommendation:**
> add role predicates to RLS on the most sensitive tables (`bills`, `payments`).

### 2.3 Auth / tenant access (fixed this session)

- **Cross-tenant subdomain access** — sessions are shared across `*.uyirly.com`; the
  dashboard layout fetched the profile by `user.id` only and never checked it against the
  subdomain. A user could open another tenant's subdomain (RLS still protected the other
  tenant's data). **Fixed:** layout now redirects to `/login?wrongtenant=1` when
  `profile.tenant_id ≠ x-tenant-id`; login clears the stale session.
- Login flow hardened: full-page redirect after auth (prevents the "stuck spinner"), and
  wrong-tenant / apex-login handling.

### 2.4 Other findings

| Finding | Severity | Notes |
|---|---|---|
| **Migration-history drift** — `schema_migrations` stops at `0063`; live schema is at `0068` (0064–0068 applied via raw SQL) | Medium | Reconcile by recording 0064–0068 as applied |
| **Missing `radiology` storage bucket** — code uploads radiology images there; bucket absent in prod (upload fails, degrades gracefully) | Low | Create bucket (private) |
| **Raw-SQL migrations don't reload the PostgREST schema cache** — caused the "column not in schema cache" tenant-creation error | Low | Mitigated via `NOTIFY pgrst, 'reload schema'`; apply future DDL via a path that reloads |
| **`Stripe` referenced in pricing FAQ** — app uses Razorpay | Low | Copy fix |

### 2.5 Positives observed

- Zod validation on inputs (signup/login).
- Parameterized queries throughout (Supabase client) — no SQL injection surface.
- Consistent `current_tenant_id()` RLS pattern; counter tables via `SECURITY DEFINER` RPCs
  (`claim_bed_and_admit`, `dispense_drug`, `issue_blood_unit`, `get_next_*`) avoid race conditions.
- Audit logging (`audit_logs`, `platform_admin_audit`).

---

## Prioritized recommendations — resolution

| # | Item | Status |
|---|---|---|
| 1 | **(Medium, preventive)** Tenant-scope helper so service-client queries can't omit `tenant_id` | ✅ **Done** — `src/lib/supabase/tenant-scope.ts` (`selectForTenant` / `insertForTenant` / `updateForTenant` / `deleteForTenant`). Use for any service-client query on a tenant table. |
| 2 | **(Medium, hygiene)** Reconcile migration history (record 0064–0068) | ✅ **Done** — `supabase_migrations.schema_migrations` now has 0001–0068. |
| 3 | **(Low)** Create `radiology` storage bucket | ✅ **Done** — private bucket created. |
| 4 | **(Low, defense-in-depth)** Role predicates in RLS for `bills`/`payments` | ⛔ **Deliberately not applied** — see below. |
| 5 | **(Low)** Fix `Stripe → Razorpay` copy in pricing FAQ | ✅ **Done**. |

### Why #4 was not applied (intentional)

Billing rows are legitimately created and read by **many** roles, not just admin/accountant:
pharmacist (POS sales), nurse/admin (IPD auto-billing), lab_tech / doctor (lab & radiology
order billing), receptionist (OPD). Adding a role predicate to `bills`/`payments` RLS would
have to allow almost every role — providing negligible security value while risking breakage
of these automated multi-role billing flows. The correct boundary stays: **tenant isolation
in RLS + per-action `requirePermission()` in the app layer.** Revisit only if billing access
is ever consolidated to a small, fixed set of roles.

_No critical, unaddressed issues remain. The previously-reported "accountant sees all bills"
was a cross-tenant **access** gap (now fixed), not a data leak — RLS always isolated the data._
