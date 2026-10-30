# Uyirly — pre-production audit

Started 30 Oct 2026. Living document: each phase appends.

## Scope corrections to the brief

Three things in the brief are not true of this codebase, and the audit is run
against the real state rather than the stated one:

| Brief says | Actually |
|---|---|
| Next.js 15 App Router | **Next.js 16.2.7** (`package.json`) |
| "Real hospitals are about to go live" | **`karur` is already live** — a paying customer with real patients. `newtest` also holds real PHI. |
| "SQL against a dev/branch DB only — never production" | **No dev or branch database exists.** |

**How the no-production rule is honoured:** every database statement in this
audit is read-only introspection — `SELECT` against `pg_catalog`,
`information_schema`, `pg_policies` and `storage.buckets`. No `INSERT`,
`UPDATE`, `DELETE`, `ALTER` or migration is issued by the audit. Where a
finding can only be proven by writing, it is marked **UNVERIFIED** with the
reason, rather than silently skipped or tested against live patient data.

Two probes earlier on 30 Oct did execute writes, inside `DO` blocks that
raised at the end so every statement rolled back; they are recorded in the
findings below and were run before this brief was given.

---

# PHASE 0 — Inventory

## 0.1 Application surface

| | Count |
|---|---|
| Pages (`page.tsx`) | **125** |
| — of which hospital-facing (`(dashboard)`) | **57** across **26 modules** |
| — marketing, tools, guides, portal, platform-admin | 68 |
| Route handlers (`route.ts`) | **31** |
| — under `/api` | 9 |
| — print/PDF routes under `/print` | 12 (no layout guard — see F-07) |
| Layouts | 2 |
| React components (`.tsx`) | 436 |
| Server-action files | 68 |
| **Exported server actions** | **701** |
| Lines of TypeScript | 117,358 |
| Middleware | `src/proxy.ts` (there is no `src/middleware.ts`) |
| Cron | 1 — `/api/cron/daily-billing`, `0 1 * * *` (`vercel.json`) |
| Webhooks | 1 — `/api/webhooks/razorpay` |
| Migrations | 238 |

## 0.2 Database surface

| | Count |
|---|---|
| Tables (`public`) | **252** |
| — partitioned parents | 6 |
| — partition children | 467 |
| Views / materialized views | 1 / 5 |
| Functions | 254 (**35 `SECURITY DEFINER`**) |
| Triggers (non-internal) | 60 |
| RLS policies | **202** |
| Indexes | 1,030 |
| Storage buckets | 4 (**2 public**) |
| **Tables with RLS disabled** | **0** ✅ |

### Storage buckets

| Bucket | Public | Limit | MIME allow-list | Objects | Verdict |
|---|---|---|---|---|---|
| `documents` | **no** | — | — | 1 | ✅ PHI private, no policies → service-role only |
| `radiology` | **no** | — | — | 2 | ✅ PHI private, no policies → service-role only |
| `tenant-logos` | yes | 2 MB | png/jpeg/webp | 4 | ⚠️ **F-02** — write policies unscoped |
| `connector-downloads` | yes | 250 MB | none | 8 | ✅ intentional (installer binaries) |

## 0.3 Module matrix

Every row must end this audit marked PASS / FAIL / PARTIAL / UNVERIFIED.
Status is **UNVERIFIED** for all functional rows until Phase 2 runs.

| Module | Pages | Components | Likely action file(s) |
|---|---|---|---|
| **account** | 1 | 1 | `accounts` (9) |
| **accounts** | 1 | 3 | `accounts` (9) |
| **appointments** | 1 | 3 | `appointments` (10) |
| **audit** | 1 | 1 | `audit` (2) |
| **billing** | 10 | 11 | `admissionBilling` (14), `billing` (17) |
| **blood** | 1 | 11 | `blood` (25) |
| **dashboard** | 1 | 8 | `dashboard` (4) |
| **emergency** | 3 | 7 | `emergency` (15) |
| **getting-started** | 1 | 1 | — |
| **hr** | 1 | 0 | `cashRegister` (6), `hr` (12) |
| **insurance** | 4 | 7 | `insurance` (60) |
| **inventory** | 1 | 6 | `inventory` (16) |
| **ipd** | 2 | 11 | `ipd` (10), `ipdConfig` (8), `ipdDeclaration` (6), `ipdTreatment` (20) |
| **lab** | 1 | 7 | `doctorAvailability` (2), `lab` (22), `labour` (6) |
| **notifications** | 1 | 1 | `notifications` (6), `ot` (19) |
| **opd** | 2 | 12 | `opd` (12) |
| **ot** | 2 | 5 | `noteTemplates` (7), `notifications` (6), `ot` (19) |
| **patients** | 2 | 11 | `patients` (6) |
| **pcpndt** | 6 | 6 | `pcpndt` (31) |
| **pharmacy** | 2 | 8 | `pharmacy` (28), `pharmacySale` (9) |
| **radiology** | 1 | 6 | `radiology` (16) |
| **referrals** | 1 | 1 | `referrals` (1) |
| **scheduling** | 1 | 6 | `scheduling` (23) |
| **settings** | 8 | 17 | `tenantSettings` (2) |
| **staff** | 1 | 3 | — |
| **wards** | 1 | 6 | `wards` (19) |
---

# PHASE 1 — Security

Sweeps are exhaustive and mechanical: one question answered for every object,
rather than files read by eye. Findings are evidenced from the live catalog.

## 1.1 Multi-tenancy and RLS — swept, clean

All 252 tables and 202 policies:

| Check | Result |
|---|---|
| Tables with RLS disabled | **0** ✅ |
| Policies that query their own table (recursion, `42P17`) | **0** ✅ |
| Tenant-scoped tables whose policy omits a tenant check | **0 real** — 4 flagged, all deliberate |
| `WITH CHECK` weaker than `USING` (privilege escalation) | **0** ✅ |

The four tenant-check flags are correct by design: `uhid_counter` and
`appointment_token_counter` are `USING (false)` — total lockouts, service-role
only; `subscriptions` is `is_platform_admin()`; `device_push_tokens` is
`profile_id = auth.uid()`.

**Note on method.** An earlier pass flagged 19 policies for "UPDATE/ALL with
`USING` but no `WITH CHECK`". That test was wrong and the flags were withdrawn:
Postgres reuses the `USING` expression as the write check when `WITH CHECK` is
omitted, so their absence is not a defect. The dangerous shape is a `WITH CHECK`
that *exists* and is *weaker* than `USING`. Re-run on that basis, exactly one
policy in the database differs between the two — `profiles_tenant_self_update`,
where the check is deliberately **stronger**.

## 1.2 Confirmed findings

### F-01 — CRITICAL — anyone on the internet could delete a hospital — **FIXED**

`public.purge_tenant_data(uuid)` deletes every row in every table carrying a
`tenant_id` for the tenant given, then marks the tenant purged. `SECURITY
DEFINER` (RLS off), **no authorization check of its own**, **no pinned
`search_path`**, and **`anon` held `EXECUTE`**.

PostgREST publishes `public` functions as RPC, and the anon key ships in every
page of the site. A `POST /rest/v1/rpc/purge_tenant_data` with a tenant UUID
would have destroyed that hospital — patients, bills, lab results,
prescriptions, admissions. A tenant's own staff know their tenant id.

**Root cause** — `supabase/migrations/0067_platform_admin_infra.sql:203`:

```sql
-- Only service role should call this (SECURITY DEFINER already enforces it server-side)
REVOKE ALL ON FUNCTION purge_tenant_data(UUID) FROM PUBLIC;
```

The parenthetical is false. `SECURITY DEFINER` decides what a function **runs
as**, not **who may call it**. `0102` and `0103` then replaced the function with
no `REVOKE`, and the default grant returned.

**Fixed** in `0237`. Verified after: `anon false, authenticated false,
service_role true, search_path=public`. Only caller is
`src/app/actions/platform.ts:401` via `service.rpc()` — unaffected.

### F-02 — HIGH — any stranger can replace or delete any hospital's logo — **OPEN**

`storage.objects` policies for the `tenant-logos` bucket, roles `{public}`
(which includes `anon`):

| Policy | Cmd | Expression |
|---|---|---|
| `tenant_logo_admin_write` | INSERT | `WITH CHECK (bucket_id = 'tenant-logos')` |
| `tenant_logo_admin_update` | UPDATE | `USING (bucket_id = 'tenant-logos')` |
| `tenant_logo_admin_delete` | DELETE | `USING (bucket_id = 'tenant-logos')` |

Despite the names, none checks a tenant and none checks a role. Any
unauthenticated caller can overwrite or delete **any** hospital's logo, which
appears on every bill, prescription and report that hospital prints, and can
upload arbitrary images into a public bucket on Uyirly infrastructure.

Contained by the bucket's own limits: 2 MB and `{image/png,image/jpeg,image/webp}`
only — so defacement and hosting abuse, not malware distribution. No PHI.

**Why the fix is cheap:** `src/app/actions/tenantProfile.ts:147` uploads through
the **service client**, so Uyirly's own code never relies on these policies.
Paths are `{tenant_id}/logo.{ext}` (`tenantProfile.ts:143`), so scoping to
`(storage.foldername(name))[1] = current_tenant_id()::text` plus an admin check
would tighten them without changing application behaviour. **Effort: S.**

### F-03 — HIGH — 25 `SECURITY DEFINER` functions callable by `anon` — **FIXED**

Postgres grants `EXECUTE` to `PUBLIC` by default; PostgREST publishes `public`
as RPC. 27 of 35 definer functions were reachable with the anon key.

Most were harmless **by accident** — they open by asking `current_tenant_id()`,
a stranger has no answer, the work fails. Two did not ask at all:

- `transfer_bed(admission, old_bed, new_bed)` — moves a patient to another bed in
  any hospital, given three UUIDs. No tenant check.
- `get_next_uhid_for(tenant)` — burns a hospital's patient numbers, leaks its
  document prefix. No tenant check.

**Fixed** in `0238`, written as a loop over what is actually granted rather than
a list of names, so a function added later without a `REVOKE` is caught next
run. `current_tenant_id()` deliberately keeps its grant — it is called inside
RLS policies, and a policy whose function the caller cannot execute **raises**
rather than returning no rows.

Verified after: anon reaches 1 function (the carve-out); a signed-in admin still
resolves tenant, passes the admin check, and reads patients and bills; `anon`
calling `transfer_bed` is `DENIED (42501)`.

**Residual:** the two function bodies still check no tenant. Revoking `EXECUTE`
closed the hole; adding internal checks is untested behaviour change. **OPEN, Low.**

### F-04 — CRITICAL (historic) — staff writes broken on every tenant — **FIXED**

Three of four policies on `profiles` queried `profiles` from inside a policy on
`profiles` → `42P17 infinite recursion`. Add, edit, deactivate and reactivate
staff failed for every tenant since `0010`. Hidden because signup and the demo
seed both write through the service role.

**Fixed** in `0234` via `is_tenant_admin()` (`SECURITY DEFINER`).

### F-05 — HIGH — a nurse could make herself an admin — **FIXED**

`profiles_tenant_self_update` let you edit your own row (correct) while
`WITH CHECK` verified only `tenant_id` — never `role`. Not reachable through the
UI (`requirePermission('hr:manage')`), but the anon key plus a valid staff login
reaches PostgREST directly, and RLS is the backstop for exactly that request.

**Fixed** in `0235`. Verified: `nurse promotes herself → BLOCKED (42501)`;
`nurse edits own phone → 1 row`; `admin sets a colleague's role → 1 row`;
`admin touches another tenant → 0 rows`.

### F-06 — MEDIUM — device push tokens readable by anyone — **FIXED**

`getTokensForProfile(profileId)` was exported from a `'use server'` file, where
every export is a callable endpoint. Service client, no session, no tenant
check. `device_push_tokens` has a correct policy (`profile_id = auth.uid()`);
the service client switched it off.

**Fixed** by moving it to `src/lib/pushSend.ts` — removing the endpoint rather
than guarding it. Only caller was server-side.

### F-07 — MEDIUM — Razorpay webhook failed open — **FIXED**

`process.env.RAZORPAY_WEBHOOK_SECRET ?? ''` — an empty key signs nothing, so a
missing setting made signature checking a formality. Compare used `!==` rather
than a constant-time compare.

**Fixed**: 503 when unconfigured (as `/api/cron/daily-billing` already did), and
`timingSafeEqual`. Safe in either state — if the secret were unset, genuine
webhooks were already failing, since Razorpay signs with the real secret.

### F-08 — MEDIUM — clinical files readable by any role in the tenant — **OPEN**

`getDocumentUrl` (`src/app/actions/documents.ts:86`) and
`getRadiologyImageUrl` (`src/app/actions/radiology.ts:233`) authorize correctly
on **tenancy** — they read the row through the user's client so RLS applies,
then use the service client only to mint the signed URL. Cross-tenant access is
impossible.

Neither checks a **permission**. Any authenticated user in the hospital —
accountant, pharmacist, receptionist — can fetch a patient's uploaded document
or scan image given the id. There is no `emr:document:read` permission; only
`upload` and `delete` exist.

**Deliberately not fixed.** `getRadiologyImageUrl` also feeds
`/print/radiology/[orderId]/pdf`, and `radiology:read` excludes receptionist,
pharmacist and accountant. Gating it blind would break a counter workflow at a
live hospital. **Blocked on one question to the hospital: who prints radiology
reports and who opens patient documents?** **Effort: S once answered.**

### F-09 — LOW — `patients_tenant_update` queries `profiles` — **OPEN**

Not recursion today, because the `profiles` SELECT policy is clean. It becomes
mutual recursion the day a `profiles` policy references `patients`. Same shape
as F-04. Converting to `is_tenant_admin()` / `current_profile_role()` would make
it consistent with the rest. **Effort: S.**

### F-10 — LOW — reference tables readable by `anon` — **OPEN, likely intentional**

`drug_master`, `drug_brands`, `icd_codes`, `immunization_schedule` all have
`USING (true)` with no authentication check. Public reference data, no PHI — but
anyone with the public key can download the drug catalogue. **Confirm intent.**

### F-11 — LOW — public endpoint with no rate limit — **OPEN**

`/api/tools/drug-search` is unauthenticated and runs 4 database queries per
request. A cost amplifier rather than a security hole. It does correctly strip
`,()*%` before interpolating into a PostgREST `.or()` filter, which is the
injection that call is actually vulnerable to.

## 1.3 Swept and clean

**API routes (8 under `/api`).** All five device routes hash the bearer token
with SHA-256 and look it up (no timing leak), reject revoked connectors with
403, and — critically — **derive the tenant from the connector row, never from
the request**. A connector cannot claim another hospital.

`/api/device/pair` is deliberately unauthenticated (the connector has no token
yet) and is carefully built: identical error for a wrong and a spent code, so no
enumeration oracle; expiry enforced; atomic claim via
`.eq('pairing_code', code)` on the update, so two machines cannot race. The code
is 8 characters from a 25-letter alphabet (~37 bits) with a 60-minute TTL —
brute-forcing inside the window needs ~2×10⁷ requests/second. Not feasible.

`/api/cron/daily-billing` fails closed when `CRON_SECRET` is unset.

**Service-role usage.** 106 `createServiceClient()` call sites across 20 action
files were enumerated and the 19 with no guard of any kind triaged. 16 are
legitimately public (login, signup, partner and patient auth, password reset) or
guarded by a pattern the detector did not recognise (`auth.getUser()`,
`requirePlatformAdmin()`). The dominant pattern in this codebase is **correct**:
authorize with the user client so RLS applies, then use the service client only
for the privileged side-effect.

## 1.4 Not yet covered in Phase 1

- Subdomain middleware: cross-tenant subdomain access, spoofed `Host`, suspended
  and unknown tenant handling — **UNVERIFIED**
- Per-role server-side enforcement across all 26 modules — **UNVERIFIED**
  (the matrix exists; the per-action check does not)
- Secrets in git history; `NEXT_PUBLIC_` audit — **UNVERIFIED**
- Session handling, password reset and OTP rate limits — **partially known**:
  there is **no OTP anywhere**; the patient portal is email + password with a
  30-day session
- Razorpay idempotency and server-side amount verification — **UNVERIFIED**
- `notify()` message bodies, consent, send logs — **partially known**: consent is
  checked and a fallback chain exists; **the SMS provider is a stub that returns
  success without sending**, so "sent" in the UI can be false
- CSP / HSTS / X-Frame-Options, CSRF, upload type and size checks — **UNVERIFIED**
- Audit-log immutability from tenant users — **UNVERIFIED**
- PHI in logs, URLs, analytics, client storage — **UNVERIFIED**

---

# MODULE 1 — FOUNDATION (the request spine) — **COMPLETE**

Method changed at the reviewer's instruction: **no sweeps, pure code review.** Every
file below was opened and read line by line. No fixes applied — findings only.

**Why this module first:** every one of the 57 hospital pages and all 701 server
actions pass through these files. A defect here is a defect everywhere.

## Files reviewed — 11 of 11

| # | File | Lines | Read | Findings |
|---|---|---|---|---|
| 1 | `src/proxy.ts` | 418 | ✅ | F-12, F-14, F-15, F-20, F-21 |
| 2 | `src/lib/server-utils.ts` | 65 | ✅ | F-14 |
| 3 | `src/app/(dashboard)/layout.tsx` | 107 | ✅ | F-12, F-18, F-19, F-22 |
| 4 | `src/lib/supabase/server.ts` | 29 | ✅ | clean |
| 5 | `src/lib/supabase/client.ts` | 10 | ✅ | clean |
| 6 | `src/lib/supabase/service.ts` | 9 | ✅ | clean |
| 7 | `src/lib/supabase/cached-user.ts` | 15 | ✅ | clean — uses `getUser()` |
| 8 | `src/lib/supabase/read-replica.ts` | 19 | ✅ | note R-3 |
| 9 | `src/lib/supabase/tenant-scope.ts` | 63 | ✅ | **F-23** |
| 10 | `src/lib/audit.ts` | 33 | ✅ | F-16, F-19 |
| 11 | `src/lib/plans.ts` + `rbac.ts` guards | 35 + 141 | ✅ | F-13, F-17 |

---

## F-23 — HIGH — the cross-tenant safety helper is written, documented, and never used

`src/lib/supabase/tenant-scope.ts:6-13` states the hazard in its own words:

> The service-role client **BYPASSES** Row-Level Security. Any query it runs
> against a tenant-owned table therefore **MUST** filter by `tenant_id` in code —
> a forgotten filter is a silent cross-tenant data leak… Prefer these helpers
> over a bare `service.from(table)`.

Four helpers exist: `selectForTenant`, `insertForTenant`, `updateForTenant`,
`deleteForTenant`.

**Call sites outside the file itself: 0.**
**Raw `service.from(...)` / `svc.from(...)` calls in `src/app/actions`: 128.**

So the guardrail was built, the danger was correctly identified in writing, and
every one of the 128 service-role queries does it by hand instead. Each is an
independent opportunity to omit `.eq('tenant_id', …)`, and each omission is a
silent cross-tenant leak with RLS switched off and nothing to catch it.

**This finding determines the next module of the audit:** reading all 128 call
sites for a missing tenant filter is now the highest-value work remaining.
**Impact: potential cross-tenant PHI disclosure. Effort to adopt helpers: M.**

## F-12 — HIGH — tenant isolation is skipped on any unrecognised hostname

The guard exists and is correct — `src/app/(dashboard)/layout.tsx:51-54`:

```ts
const currentTenantId = hdrs.get('x-tenant-id')
if (currentTenantId && profile.tenant_id !== currentTenantId) {
  redirect('/login?wrongtenant=1')
}
```

Its comment claims `x-tenant-id` *"is absent only on bare-localhost dev"*
(`layout.tsx:50`). **That is not true.** Reading `proxy.ts`, the header is
stamped only at line 327, inside the tenant-subdomain branch. It is absent on:

| Branch | `proxy.ts` | Headers stamped? |
|---|---|---|
| apex / `www` | 139-157, returns at 156 | **no** |
| `app.{rootDomain}` | 160-167 | **no** |
| bare localhost | falls to 371 | **no** (acknowledged) |
| **any other hostname** | **falls to 371-411** | **no** |

The final branch accepts any host that is not the apex, not `*.rootDomain`, not
`*.localhost` and not bare localhost. It checks the session and lets the request
through — with **no tenant header, no suspension check, no read-only
computation and no plan gating**.

Because the guard is `if (currentTenantId && …)`, a null header means the
isolation check does not run at all.

**UNVERIFIED — the one thing I cannot check from here:** whether such a hostname
is reachable in production. Vercel issues `*.vercel.app` URLs for every project
unless Deployment Protection is enabled, and nothing in the repo references one.
**To verify:** open the Vercel deployment URL while signed in. If the dashboard
renders, this finding is live.

## F-13 — HIGH — plan gating is bypassable for the lab/radiology connector

`src/lib/plans.ts:14-22` exports `GROWTH_ONLY_ROUTES` including
`/settings/devices`, with this justification:

> `/settings/devices` is here because it configures the analyzer and scanner
> connectors… **Without it a Starter tenant could pair a connector it has no
> module to use.**

**That export is never imported.** `grep` for `GROWTH_ONLY_ROUTES` returns only
`plans.ts:18` (the declaration) and `proxy.ts:307` — which declares its **own
local constant of the same name with a different list**:

| Route | `plans.ts` | `proxy.ts` (the one that enforces) |
|---|---|---|
| `/settings/devices` | gated | **not gated** |
| `/staff` | gated | not gated (deliberate — comment at 312) |
| `/settings/ipd-billing` | not listed | gated |

So the protection the comment describes does not exist. And the actions behind
that page confirm it: `src/app/actions/devices.ts` gates every mutation on
`requirePermission(actor.role, 'lab:manage')` — a **role** check — at lines 171,
209, 234, 262, 339, 390. **`requireModule('lab')` is never called anywhere in
that file.**

A Starter-plan admin can therefore reach `/settings/devices`, create a
connector, pair it, and ingest lab results for a module they have not paid for.
The ingest route is also exempt from middleware entirely (`proxy.ts:113-117`),
so there is no plan check on that path either.

**Impact: revenue/entitlement bypass. Effort: S** — one `requireModule('lab')`
per mutation, plus reconciling the two route lists into one.

## F-14 — MEDIUM — read-only and plan enforcement rest on headers stamped in one branch only

`server-utils.ts:11-16` and `:19-22` decide read-only purely from
`x-tenant-readonly`. `:25-32` decides module access from `x-tenant-plan` /
`x-tenant-status`, and opens with an explicit fail-open:

```ts
if (!h.get('x-tenant-id')) return true   // "No tenant headers — don't block."
```

Combined with F-12, on any hostname that misses the subdomain branch:
`requireWriteAccess()` does not throw (header absent ≠ `'1'`), and `hasModule()`
returns **true for every module**. A lapsed or Starter tenant reaching the app by
such a host has neither restriction.

The headers themselves cannot be forged on the subdomain branch — `proxy.ts:327-332`
uses `.set()` on a copy of the incoming headers, overwriting any client value.
**The weakness is absence, not forgery.**

## F-15 — MEDIUM — middleware authenticates with an unverified JWT

`proxy.ts:283` uses `supabase.auth.getSession()`, with the comment *"validates
JWT locally — zero network round-trip."* `getSession()` decodes the cookie; it
does not verify it against the auth server. Supabase's guidance is to use
`getUser()` in server code.

**Mitigated, not exploitable for data:** `getCachedUser()`
(`cached-user.ts:13`) uses `getUser()`, and PostgREST verifies the JWT on every
query. So a forged cookie passes the middleware redirect and then fails at the
layout and the database.

**Residual:** the middleware gate is advisory. Any future code that trusts
middleware having "already authenticated" would be wrong.

## F-16 — MEDIUM — audit writes fail silently

`src/lib/audit.ts:24-32`:

```ts
await supabase.from('audit_logs').insert({ … })   // result never inspected
```

No error check. An RLS rejection, constraint violation or outage loses the
record with no signal — in the table that exists to prove who did what. Two
earlier returns (`:10` no actor, `:22` no tenant) also drop the entry silently.

**Positive, verified against the live catalog:** `audit_logs` carries **only**
`audit_logs_tenant_admin_read` (SELECT) and `audit_logs_tenant_insert` (INSERT).
There is **no UPDATE and no DELETE policy**, so a tenant user cannot alter or
erase history. Audit immutability from tenant users: **PASS**.

## F-17 — LOW — two plan-route lists, drifted; one is dead code

See F-13. `plans.ts:18` is unreferenced. Same defect class as the role-enum
drift that reached a hospital earlier today: a list duplicated with no mechanism
tying the copies together.

## F-18 — LOW — module gating fails open on a null column

`layout.tsx:79-81`: when `tenants.enabled_modules` is not an array, the fallback
enables **every** module. A tenant row with `NULL` there gets everything.

## F-19 — PERFORMANCE — four sequential round trips before any page renders

Per dashboard page load, in `layout.tsx`:

| Line | Call | Note |
|---|---|---|
| 18 | `getCachedUser()` → `auth.getUser()` | network call to Supabase Auth |
| 22 | `profiles.select('*')` | `select *` — F-22 |
| 73 | `tenants.select('enabled_modules')` | **service-role, uncached, every load** |
| 83 | `isMessagingEnabled()` | `platform_settings` — request-cached only |

`enabled_modules` and `messaging_enabled` change almost never yet are fetched on
every navigation. `logAudit` (`audit.ts:16-20`) adds a **fifth** round trip on
every audited action, re-reading `profiles.tenant_id` that `getActorProfile()`
already holds in a request-scoped cache.

## F-20 — PERFORMANCE/CORRECTNESS — the tenant cache is per-instance and unbounded

`proxy.ts:16-17, 23-53`. A module-level `Map` with a 60-second TTL and **no
eviction**. Consequences:

- On serverless each instance keeps its own copy, so suspending a tenant takes
  effect between 0 and 60 seconds later, **per instance** — unpredictable.
- Entries are never removed. At many tenants on a long-lived instance this grows
  without bound. (Unknown slugs are *not* cached — `:38` returns before the
  `set` — so an attacker cannot inflate it.)

## F-21 — PERFORMANCE — unknown hostnames trigger an uncached service-role query

`proxy.ts:27-38`. Every request for a slug that does not exist performs a
service-role `tenants` lookup and caches nothing. With wildcard DNS, an
unauthenticated caller can force one database round trip per request by varying
the subdomain. Amplifier, not a breach.

## F-22 — INFO — `select('*')` in the hot path

`layout.tsx:24` pulls every column of `profiles` on every dashboard render when
six are used.

## R-3 — INFO — read-replica helper is configured but inert

`read-replica.ts:12-15` falls back to the primary when the replica env vars are
unset. Correct behaviour; recorded so nobody assumes reads are being offloaded.

---

## Verdicts — foundation

| Area | Verdict |
|---|---|
| Tenant isolation on correct hostnames | **PASS** — `layout.tsx:52` |
| Tenant isolation on other hostnames | **FAIL** — F-12 |
| Actor tenant derived from DB, not headers | **PASS** — `server-utils.ts:54-57` |
| Audit-log immutability from tenant users | **PASS** |
| Audit-write reliability | **FAIL** — F-16 |
| Plan gating (routes) | **PARTIAL** — F-13, F-17 |
| Plan gating (actions) | **FAIL** for devices — F-13 |
| Read-only enforcement | **PARTIAL** — F-14 |
| Service-role tenant scoping discipline | **FAIL** — F-23 |
| Session verification (layout, DB) | **PASS** |
| Session verification (middleware) | **PARTIAL** — F-15 |

**Module 1: 11 of 11 files read. Complete.**

**Next module: the 128 raw service-role queries** — chosen because F-23 proves
the guardrail against cross-tenant leakage is unused, making those call sites
the largest unexamined risk in the product.

---

# MODULE 2 — SERVICE-ROLE CALL SITES — *in progress*

164 service-role `.from()` calls located. 76 are on the 26 global tables that
carry no `tenant_id` (drug master, ICD codes, platform tables, portal identity)
and need no filter. 88 are on tenant-scoped tables and are being read one by one.

**Clean so far** — these use the correct pattern, *authorize with the user client
so RLS applies, then act with the service client on the already-proven id*:

| Call site | Why it is safe |
|---|---|
| `devices.ts:550` `retryMessage` | message and barcode both read through the **user** client first (`:534`, `:547`) |
| `patients.ts:98` `createPatient` | `patient_members` is global; the `patients` update is on the row just created in this tenant |
| `seeds.ts:379-390` tariffs | `requirePlatformAdmin()`; cross-tenant by design |

---

# 🔴 F-24 — CRITICAL — any person can read any patient's full medical history across every hospital

**Verified by reading. Not exploited — no patient data was accessed.**

The patient portal uses a **custom session**, not Supabase auth, so RLS protects
none of it. Every authorization decision is made in code. Two of them accept
identifiers the user simply types, with no verification of any kind.

## Path A — claim a stranger by Aadhaar number

**Step 1.** `addFamilyMember` (`src/app/actions/patientPortal.ts:201-228`). Any
signed-in portal user supplies a name and a 12-digit Aadhaar. The checks are:

```ts
if (aadhaar.length !== 12) return …                       // :209  format only
const conflict = await aadhaarOwnedElsewhere(svc, aadhaar, session.accountId)
if (conflict) return …                                     // :213  only if ALREADY claimed
```

**Nothing verifies the Aadhaar belongs to the user.** No OTP to the
Aadhaar-linked mobile, no document, no match against the patient's registered
details. It is a typed number.

**Step 2.** `linkPatientRecords` is called immediately (`:227`), and at
`:37-43` runs:

```ts
.from('patients').select('id').is('patient_member_id', null).eq('aadhaar_no', aadhaar)
…
.update({ patient_member_id: m.id, patient_account_id: accountId }).in('id', ids)
```

**No tenant filter** — cross-hospital by design. Every *unlinked* patient row in
**every hospital on the platform** matching that Aadhaar is reassigned to the
caller's account.

**Step 3.** `ownsPatient` (`:293-308`) now returns the patient, because
`patient_account_id === session.accountId` (`:300`).

**Result:** `getPatientHospitalRecords`, `getPortalLabReport`,
`getPortalRadiologyReport`, `getPortalScanImageUrl`, appointments and queue
status all open — that person's complete medical history, at every hospital on
Uyirly.

## Path B — simpler: register with the victim's phone number

`ownsPatient:301` grants ownership by a **second** route:

```ts
const phoneMatch = normalizePhone(data.phone as string) === session.phone
if (!linked && !phoneMatch) return null
```

A patient is owned if the portal account's phone equals the phone on the
hospital record. And `registerPatient` (`:71-108`) validates the phone for
**format and uniqueness only** (`:81`, `:90`) — there is **no OTP anywhere in
the product** (confirmed: `grep -i otp` across `src/` returns nothing but
unrelated matches; the portal is email + password).

So registering an account with someone else's mobile number grants their records
directly, with no family-member step at all.

## Why this is worse than F-01

| | F-01 purge | **F-24** |
|---|---|---|
| Needs | a tenant UUID | **an Aadhaar or a phone number** |
| Obtainable | not published | **routinely photocopied; widely breached** |
| Effect | destroys data | **reads PHI, silently** |
| Detectable | obvious | **leaves no trace a hospital would see** |

It is also a **land grab: first claimer wins.** `aadhaarOwnedElsewhere` only
protects an Aadhaar some account has *already* taken. The portal shipped
recently, so almost every patient in the database is unclaimed — and therefore
unprotected.

## Reproduction — run on `demo` only, never on `karur`

1. Note an existing demo patient's `aadhaar_no` and `phone`.
2. Register a fresh portal account at `my.uyirly.com` with **your own** email and
   that patient's **phone number**.
3. Observe their records appear — Path B, no further step.
4. Or register normally, then *Add family member* with that patient's Aadhaar —
   Path A.

## Recommended direction — **not applied, review only**

The hole is that ownership is asserted rather than proved. Options, strongest
first:

1. **Verify the phone with an OTP at registration**, and verify the Aadhaar-linked
   mobile before `addFamilyMember` links anything. This is the real fix and it
   needs the SMS provider, which is currently a stub that reports success without
   sending (see Module 4 backlog).
2. **Stop auto-claiming.** Make `linkPatientRecords` create a *pending* link that
   the hospital, or the patient at the counter, confirms. Removes the land grab.
3. **Drop the `phoneMatch` branch** at `:301`. It is the weakest of the two and
   has no compensating control.
4. Interim, cheap: require **phone *and* Aadhaar *and* date of birth** to match
   the hospital record before any link. Raises the bar without new infrastructure.

**Effort: M. Severity: Critical. Status: OPEN — no fix applied, per instruction.**

## F-24 — REVISED after a design decision from the product owner

**Decision recorded (30 Oct 2026):** Aadhaar is dropped. **Mobile number is the
family connection** — all patients registered with the same mobile may see each
other's records.

That removes Path A. It does **not** remove the finding; it concentrates it.

### The finding, restated

With mobile as the sole family link, **the mobile number is the credential for a
family's medical records.** The whole portal now rests on one question: *is the
mobile number verified?*

It is not. `registerPatient` (`patientPortal.ts:71-108`) checks the phone for
**format and uniqueness only** (`:81`, `:90`). There is **no OTP anywhere in the
product.** So anyone who knows a mobile number can register with it and read
that family's records across every hospital.

Before the decision this was one of two paths. Now it is the **only** path, and
it is unverified. **OTP stops being a feature and becomes the security model.**
It is also blocked: the SMS sender is a stub that returns success without
sending (`src/lib/notify/index.ts:90-94`).

**Severity: Critical. Status: OPEN.**

### Three structural consequences of "same mobile = family"

These are properties of the design, not bugs, and each needs a deliberate answer.

**1. Recycled numbers — a certainty over years, not a risk.**
Indian operators reissue disconnected mobile numbers after roughly 90 days. The
new holder registers on the portal and inherits the previous family's medical
history. Asked to consider "long run of the application for many years": this
event has probability 1 at sufficient time and patient count. Mitigation is
re-verification on a cadence, or binding the link to something the number alone
does not prove.

**2. Placeholder numbers — forced by the schema.**
`patients.phone` is `NOT NULL` (live catalog) and `PatientFields:54-57` demands a
valid Indian mobile. **There is no "no phone" option.** An elderly rural patient
without a mobile leaves the front desk no choice but to type someone else's — a
relative's, the receptionist's, or the hospital's own. Under this design every
patient who received that placeholder becomes one family with shared records.

Current data is too small to show it (29 patients, one phone shared by two, none
spanning hospitals) but the mechanism is structural and will appear at volume.
**Recommended: add an explicit "no mobile" state that excludes the record from
portal linking**, rather than forcing staff to invent a number.

**3. There is no way to revoke a wrong link.**
`ownsPatient:301` computes `phoneMatch` **live** on every request. It is not a
stored row. So there is no record of who gained access, no audit entry, and
nothing to delete. `removeFamilyMember` only removes `patient_members` rows — it
cannot undo a phone match. Correcting a mistake requires editing the phone number
on the patient record itself.

### What dropping Aadhaar touches — not applied, for planning only

| File / object | Current dependency |
|---|---|
| `patientPortal.ts:84` | registration **requires** a 12-digit Aadhaar |
| `patientPortal.ts:201-228` | `addFamilyMember` is entirely Aadhaar-keyed |
| `patientPortal.ts:28-46` | `linkPatientRecords` matches on `aadhaar_no` |
| `patientPortal.ts:50-62` | `aadhaarOwnedElsewhere` |
| `patients.aadhaar_no` | nullable text column, retained for records |

Switching the link to phone means `linkPatientRecords` keys on `patients.phone`
and `addFamilyMember` either goes away or becomes a naming exercise within one
phone group. **Effort: M.**

---

# 🔴 F-25 — CRITICAL — cross-tenant account takeover via staff email change

**Verified by reading. Not exploited.** Patient portal work paused at the
owner's instruction; this was found continuing Module 2 on `hr.ts`.

## The path

`updateStaffEmail` (`src/app/actions/hr.ts:234-248`):

```ts
export async function updateStaffEmail(profileId: string, newEmail: string) {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'hr:manage')      // :237  admin or hr
  const may = await assertMayManage(actor.role, profileId)
  if (!may.ok) return { success: false, error: may.error }
  …
  const service = createServiceClient()                  // :242  RLS OFF
  const { error } = await service.auth.admin
    .updateUserById(profileId, { email: trimmed })       // :243  NO TENANT CHECK
```

**`profileId` is never checked against the actor's tenant.** And
`assertMayManage` (`:43-53`) does not check tenancy either — for an admin it
returns immediately:

```ts
if (actorRole === 'admin') return { ok: true }           // :46
const { data } = await service.from('profiles')
  .select('role').eq('id', targetProfileId).maybeSingle() // :48  also no tenant filter
```

So **any hospital admin can change the login email of any staff member at any
other hospital on the platform**, given that person's profile UUID. A password
reset to the attacker's address then completes a full account takeover —
including that hospital's patient records.

An `hr` user can do the same to any **non-admin** account anywhere, because the
only thing `assertMayManage` blocks is an admin target.

## Same shape, second action

`resendStaffCredentials` (`:294-…`) repeats it:

- `:305` `service.auth.admin.getUserById(profileId)` — reads another tenant's
  login email
- `:312-315` `service.auth.admin.updateUserById(profileId, { password, ban_duration: 'none' })`
  — **resets that user's password and lifts any ban**

The follow-up `profiles` update at `:319` uses the *user* client, so RLS makes it
return zero rows and the action reports failure — **after** the password has
already been changed. Net effect cross-tenant: victim locked out, ban cleared,
attacker sees an error. Denial of service rather than takeover; `updateStaffEmail`
is the clean takeover path because nothing after it fails.

## Honest note on provenance

`assertMayManage` is **mine, written earlier today** (commit `86b0f93`) to stop an
HR user reaching an administrator's account. It does that correctly.

It does **not** check tenancy — and `updateStaffEmail` never checked tenancy
before I touched it either. So the hole predates the change, but my guard sits
directly above the vulnerable call and *looks* like an authorization check,
which makes the gap harder to notice, not easier. That is a fair criticism of
the change.

## Why RLS does not save this

Everywhere else in this codebase the pattern is *authorize with the user client
so RLS applies, then act with the service client on the proven id* — and it is
applied consistently and correctly (see Module 2 passes). These two functions
break it: they act through `service.auth.admin.*`, which is the Supabase **Auth
Admin API**, not a table query. No policy exists there to fall back on.

## Prerequisite

A profile UUID belonging to another tenant. Not guessable, but UUIDs travel — in
URLs, exports, API responses, support screenshots and shared demos.

## Recommended direction — **not applied, review only**

Make `assertMayManage` compare tenants, which fixes both call sites at once:

```ts
const { data } = await service.from('profiles')
  .select('role, tenant_id').eq('id', targetProfileId).maybeSingle()
if (!data || data.tenant_id !== actorTenantId) return { ok: false, error: 'Not found' }
```

It needs the actor's `tenant_id` passed in (callers already hold `actor`), and
the admin short-circuit at `:46` must move **below** the tenant check rather than
above it. Return a not-found style message so the function cannot be used as an
oracle for "is this UUID an admin".

**Severity: Critical. Effort: S. Status: OPEN.**

---

# F-26 — MEDIUM — tenant consistency is not enforced between related rows

294 foreign keys have a tenant-scoped table on both sides. **3** are composite
keys that include `tenant_id` and therefore enforce that parent and child belong
to the same hospital.

In the other 291 relationships the database will accept a child row in tenant A
referencing a parent row in tenant B. Nothing detects it.

No active breach: an honest path cannot obtain a foreign tenant's id, because
reads go through RLS. The exposure is the 128 service-role writes, where a
mistaken id is accepted silently.

Where it would surface: `api/device/radiology/worklist/route.ts:84-97` joins
`patients` through `radiology_orders`. The orders are correctly filtered by
`tenant_id` (`:85`), but the join inherits whatever `patient_id` those rows hold
— so a single mismatched row would put another hospital's patient name on a
connector's worklist, with every query in the request looking correct.

Relevant to the "many years, large data" lens: this is the class of defect that
produces unexplainable mixed data long after the write that caused it, with no
constraint to catch it at the time. **Effort to add composite FKs: L.**
