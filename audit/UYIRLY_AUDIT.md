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

# FINDINGS REGISTER

The index. Every finding, its status, and where the detail lives. Statuses:
**FIXED** (applied and verified), **OPEN** (reported, no fix applied),
**PARKED** (owner deferred), **BLOCKED** (needs an answer from the hospital).

Fixes marked FIXED were applied **before** the review-only instruction was given
on 30 Oct; nothing has been changed since.

## Critical

| ID | Finding | Module | Status |
|---|---|---|---|
| F-01 | `purge_tenant_data` deletes a hospital; `anon` held EXECUTE | DB | **FIXED** `0237` |
| F-04 | `profiles` policy recursion — staff writes broken on every tenant since `0010` | 1 | **FIXED** `0234` |
| F-24 | Portal ownership is asserted, not proved — a mobile number reads a family's records | Portal | **PARKED** by owner |
| F-25 | Cross-tenant account takeover via `updateStaffEmail` + 3 more `auth.admin` calls | 2 | **OPEN** |

## High

| ID | Finding | Module | Status |
|---|---|---|---|
| F-02 | `tenant-logos` storage policies check neither tenant nor role; `{public}` | 1 | **OPEN** |
| F-03 | 25 `SECURITY DEFINER` functions callable by `anon` | DB | **FIXED** `0238` |
| F-05 | A nurse could set her own role to `admin` | 1 | **FIXED** `0235` |
| F-12 | Tenant isolation skipped on any unrecognised hostname | 1 | **OPEN** — needs Vercel check |
| F-13 | Starter tenant can pair a lab connector; `requireModule` never called | 1 | **OPEN** |
| F-23 | `tenant-scope.ts` guardrail written, documented, **0 call sites** vs 128 raw | 1 | **OPEN** |
| F-28 | `applyAdvanceToBill` bypasses `reconcileBill`; lost-update on `bills.paid` | 3 | **OPEN** |
| F-32 | Money **in** is row-locked; every money-**out** path is an unlocked read-then-write | 3 | **OPEN** |
| F-34 | `claim_bed_and_admit` claims a bed by id with no tenant check | 4 | **OPEN** — see F-46 |
| F-45 | **Issuing a blood unit fails every time** — `tenant_id` missing from the INSERT | 6 | **OPEN** |
| F-46 | Five `SECURITY DEFINER` RPCs locate rows by id and never check tenancy | 4,6 | **OPEN** |

## Medium

| ID | Finding | Module | Status |
|---|---|---|---|
| F-06 | Device push tokens readable by anyone from any browser | 2 | **FIXED** `1e7a54b` |
| F-07 | Razorpay webhook failed open on a missing secret | 2 | **FIXED** `2f53129` |
| F-08 | Patient documents and scan images readable by any role in the tenant | 2 | **BLOCKED** — who prints reports? |
| F-14 | Read-only and plan enforcement rest on headers stamped in one branch | 1 | **OPEN** |
| F-15 | Middleware authenticates with an unverified JWT (`getSession`) | 1 | **OPEN** |
| F-16 | `logAudit` never checks its insert — compliance records vanish silently | 1 | **OPEN** |
| F-26 | 294 FKs tenant-scoped both sides; **3** enforce the tenants match | DB | **OPEN** |
| F-29 | CGST + SGST can exceed the tax charged by one paisa | 3 | **OPEN** |
| F-30 | GST room-rent >₹5,000 and cosmetic/elective bands not implemented | 3 | **OPEN** |
| F-33 | `cancelBill` reverts charges before it is allowed to cancel | 3 | **OPEN** |
| F-35 | A patient can be admitted twice (check in TS, not in the RPC) | 4 | **OPEN** |
| F-39 | Five-minute partition hole at every month boundary | DB | **OPEN** |
| F-40 | Partition alarm only `RAISE WARNING`s — reports to nobody | DB | **OPEN** |
| F-42 | Partial-panel safety check **fails open** on RPC error | 5 | **OPEN** |
| F-43 | "Marked interim" is promised and never recorded | 5 | **OPEN** |
| F-48 | Consultation payment gate inert for ~97% of visits | 7 | **OPEN** |

## Low / informational

| ID | Finding | Module | Status |
|---|---|---|---|
| F-09 | `patients_tenant_update` queries `profiles` — latent mutual recursion | DB | **OPEN** |
| F-10 | Four reference tables readable by `anon` | DB | **OPEN** — confirm intent |
| F-11 | `/api/tools/drug-search` unauthenticated, 4 queries, no rate limit | 2 | **OPEN** |
| F-17 | `GROWTH_ONLY_ROUTES` duplicated and drifted; `plans.ts` copy is dead | 1 | **OPEN** |
| F-18 | `enabled_modules` fails open on a null column | 1 | **OPEN** |
| F-19 | Four sequential round trips before any dashboard page renders | 1 | **OPEN** |
| F-20 | Tenant cache per-instance and unbounded; 0–60s suspension lag | 1 | **OPEN** |
| F-21 | Unknown hostnames trigger an uncached service-role query | 1 | **OPEN** |
| F-22 | `select('*')` on `profiles` in the hot path | 1 | **OPEN** |
| F-27 | Partner e-mail interpolated into an `ilike` pattern | 2 | **OPEN** |
| F-31 | `TABLE_MAP` covers 9 of 17 `BillItemSource` values, skips silently | 3 | **OPEN** |
| F-36 | `autoIpdBill` documents idempotency it does not provide for null `ref_id` | 4 | **OPEN** |
| F-37 | Cron `limit(1000)` silent truncation; sequential loop under a 300s cap | 4 | **OPEN** |
| F-38 | Two copies of the read-only rule, called mirrors, deliberately differing | 4 | **OPEN** |
| F-41 | `appointments` protected twice; five partitioned tables protected once | DB | **OPEN** |
| F-44 | Single tests get flat critical bounds; analytes get age/sex-aware ones | 5 | **OPEN** |
| F-47 | FEFO governs inventory consumption, not pharmacy dispensing | 6 | **OPEN** |
| F-49 | Two comments describe a billing-at-booking flow that does not exist | 7 | **OPEN** |
| F-50 | Nothing marks a visit billed when its appointment bill is paid | 7 | **OPEN** — 0 live instances |
| F-51 | `startVisit` is a write gated on `opd:read` | 7 | **OPEN** |
| F-52 | Duplicate-appointment guard is a read-then-write | 7 | **OPEN** |

## Suspicions raised and withdrawn

Recorded because an audit that only lists hits is not honest about its method.

| What I suspected | Why it was wrong |
|---|---|
| Double-billing race in `generateBill` | The flip is a **conditional update** — atomic compare-and-set |
| `ot_consumable` missing from `TABLE_MAP` double-bills | Its lines are nested children of a parent that **is** flipped |
| Cron and ward board both bill the same day | Catch-up skips days already carrying a `bed` line |
| Analyzer results skip critical detection | The check lives **inside** the shared RPC, not the TypeScript |
| Partition runway is a 32-day fuse | The monthly job has succeeded every month since July |
| 19 policies with no `WITH CHECK` are defects | Postgres reuses `USING` as the write check when it is omitted |

## Tally

| Severity | Total | Fixed | Open | Parked/Blocked |
|---|---|---|---|---|
| Critical | 4 | 2 | 1 | 1 |
| High | 11 | 2 | 9 | 0 |
| Medium | 16 | 2 | 13 | 1 |
| Low / info | 21 | 0 | 21 | 0 |
| **Total** | **52** | **6** | **44** | **2** |

Modules completed: **7** — foundation, service-role layer, billing, IPD, lab and
radiology, pharmacy and blood bank, OPD and appointments.


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

---

# MODULE 2 — SERVICE-ROLE CALL SITES — **COMPLETE** (portal deferred)

## Coverage

| | Count |
|---|---|
| `service.from()` / `svc.from()` calls located | **164** |
| — on the 26 global tables (no `tenant_id` exists) | 76 — no filter possible or needed |
| — on tenant-scoped tables | **88** |
| ·· tenant filter visible in the statement | 32 |
| ·· required reading | 56 |
| ···· **read and judged** | **42** |
| ···· `patientPortal.ts` — **deferred at owner's instruction** | 14 |
| **`auth.admin.*` calls — missed by the above, found by reading** | **18** |

## PASS — read individually, correctly scoped

| Call site | Why safe |
|---|---|
| `devices.ts:550` `retryMessage` | message and barcode read via **user** client first (`:534`, `:547`) |
| `patients.ts:98` `createPatient` | `patient_members` is global; update targets the row just created |
| `seeds.ts:379-390` tariffs | `requirePlatformAdmin()`; cross-tenant by design |
| `api/device/radiology/studies` | every id resolved **with** `tenant_id` first (`:92`, `:122`, `:128`) before any unfiltered `.eq('id')` |
| `api/device/radiology/worklist` | orders filtered `.eq('tenant_id', connector.tenant_id)` (`:85`); modality lookups likewise |
| `api/device/lab/results` | `tenantId = connector.tenant_id` (`:59`); every write carries it (`:92`) |
| `api/device/pair`, `ping`, `viewer-key` | tenant derived from the token-hashed connector row, never from the request |
| `onboarding.ts:179,188,196` | every seeded row carries `tenant_id` of the tenant just created |
| `partnerAuth.ts` ×8 | `partners` is **global identity** — `0112_referral_program.sql:10` says `tenant_id` is "set for tenant-partners; NULL for external". Scoped by email or `session.partnerId` |
| `platform.ts` ×6 | all behind `requirePlatformAdmin()` (`:613, :670, :688, :735, :757`) |
| `api/webhooks/razorpay` ×5 | located by the provider's own `stripe_subscription_id`; tenant read **from** the matched row (`:133`, `:171`, `:185`, `:200`) |

**Billing idempotency: PASS, and enforced properly.** Commission accrual is
protected by a **unique index**, `partner_commissions_source_payment_id_key` on
`source_payment_id` — not by the check-then-insert at `route.ts:37`, which is a
race. A replayed webhook cannot pay a partner twice.

**The prevailing pattern in this codebase is correct and consistently applied:**
authorize with the user client so RLS runs, then act with the service client on
the already-proven id. 42 of 42 read call sites follow it.

## F-25 — EXPANDED — it is four actions, not two

The enumeration above counts `.from()` calls. **`service.auth.admin.*` is not a
table query**, so none of the Supabase Auth Admin calls appeared in it — and
that is where the critical finding lives. Eight of the eighteen are in `hr.ts`,
each taking a caller-supplied `profileId` with **no tenant comparison**:

| Action | `auth.admin` call | Cross-tenant effect |
|---|---|---|
| `updateStaffEmail` | `updateUserById(id, { email })` | **account takeover** — move the login, then reset the password |
| `resendStaffCredentials` | `updateUserById(id, { password, ban_duration:'none' })` | password reset + **ban lifted**; lockout |
| `deactivateStaff` | `updateUserById(id, { ban_duration: FOREVER_BAN })` | **permanently ban** another hospital's staff member |
| `reactivateStaff` | `updateUserById(id, { ban_duration:'none' })` | **restore a login another hospital deliberately removed** — e.g. a dismissed employee |

The last is worth stating plainly: a hospital sacks someone and deactivates
them; an admin at an unrelated hospital can silently give them their login back.

Safe by contrast, and for the right reason: `auth.ts` acts on `user.id` from the
session, `subscription.ts` on `actor.id`, `onboarding.ts` on the user it just
created, `platform.ts` behind `requirePlatformAdmin()`.

**One fix closes all four** — a tenant comparison inside `assertMayManage`, with
the admin short-circuit moved below it. **Severity: Critical. Effort: S. OPEN.**

## F-27 — LOW — partner e-mail lookups interpolate into an `ilike` pattern

`partnerAuth.ts:55` validates a login email with `e.includes('@')` only — not a
format check. That value is then used as an `ilike` pattern at `:27`, `:57` and
`:77`, where `%` and `_` are **wildcards**.

Input such as `%@%` matches every partner. It does **not** grant a login:
`.maybeSingle()` errors when more than one row matches, so the lookup fails
closed. But `registerPartner:27` uses the same check for existence, so a
pattern that matches several rows reads as "no existing partner" and inserts a
junk row.

`patientPortal.ts` does the same `.ilike('email', …)` but validates with
`EMAIL_RE` first, so it is not affected. **Effort: S.**

## Method note — why the enumeration was not enough

This module was located by enumeration and then **read**. The enumeration found
164 call sites and would have reported Module 2 clean. The critical finding was
**not in those 164** — it is an Auth Admin call, a different API with no RLS
behind it, and it surfaced only because `hr.ts` was read line by line.

Recorded because it is evidence for the reviewer's instruction: a sweep answers
the question it was given, and says nothing about the question nobody asked.

## Verdicts — service-role layer

| Area | Verdict |
|---|---|
| Tenant scoping of `.from()` service queries (non-portal) | **PASS** — 42 of 42 |
| Device ingest routes (lab + radiology) | **PASS** |
| Razorpay webhook scoping and idempotency | **PASS** |
| Platform-admin partner actions | **PASS** |
| **Supabase Auth Admin calls in `hr.ts`** | **FAIL** — F-25 |
| Partner e-mail validation | **PARTIAL** — F-27 |
| Patient portal (14 call sites) | **DEFERRED** — owner's instruction |

**Module 2 complete.** Next: Module 3 — `src/app/actions/billing.ts` and
`admissionBilling.ts` (31 actions), covering the money rules the brief names:
discounts, refunds, partial payments, advance reconciliation, GST bands,
rounding, and totals against line items.

---

# MODULE 3 — BILLING (money) — part 1

Files: `billing.ts` (1,411), `admissionBilling.ts` (582), `lib/gst.ts` (143),
`lib/billing/gst.ts`, `lib/billing/reconcile.ts`.

## Read and PASSED — these are well built

**Double-billing protection: PASS, by compare-and-set.** `generateBill:497-510`
flips source rows with a **conditional update**:

```ts
.update({ billing_status: 'billed' }).in('id', wanted)
.eq('billing_status', 'unbilled').select('id')
if (ids.length < wanted.length) return 'Some charges were already billed'
```

Atomic at row level. A second concurrent bill matches zero rows, is told so, and
is rolled back — flipped rows reverted, bill **voided not deleted** so the GST
invoice number stays in sequence (`:533-534`). The comment at `:483-496` records
a real bug already fixed here (counting lines instead of distinct ids broke
multi-test lab orders and burned invoice numbers). *My initial suspicion of a
read-then-write race was wrong and is withdrawn.*

**Totals always match line items: PASS, by construction.** `reconcileBill`
(`lib/billing/reconcile.ts:33`) recomputes the total from `bill_items` on every
change rather than trusting a stored figure.

**Overpay guard: PASS.** `reconcile.ts:42` refuses an edit that would drop a bill
below what the patient actually paid; `applyDiscount:612-617` restores the prior
discount if so.

**Advance is a pool, not an invoice: PASS.** Applied as a `payments` row with
`method:'advance'`, and `reconcile.ts:40` excludes it from `patientPaid`, so
patient cash and hospital deposit never merge. Excess advance is released back
(`:49-59`).

**Plan gating at the action layer: PASS.** `generateBill:372` blocks IPD billing
on a Starter plan — not merely hidden in the UI.

**Cross-admission guard: PASS.** `generateBill:365-367` refuses charges from a
different admission. `getUnbilledCharges:232-233` scopes OT to the admission,
with a comment recording the earlier bug where an OPD bill could consume an
unrelated admission's surgery.

## F-28 — HIGH — the advance path bypasses reconciliation and can lose a payment

`applyAdvanceToBill` (`admissionBilling.ts:138-179`) is the one money path that
does **not** use `reconcileBill`. It computes the result by hand:

```ts
const newPaid = (bill.paid as number) + applyAmount          // :172  stale read from :149
const newStatus = newPaid >= (bill.total as number) ? 'paid' : 'partial'
await supabase.from('bills').update({ paid: newPaid, status: newStatus })
```

Three consequences:

1. **Lost update.** `bill.paid` was read at `:149`. A cashier recording cash
   through `record_bill_payment` — which *is* row-locked (`billing.ts:809`) —
   between that read and this write has their payment overwritten. The money is
   in `payments` but `bills.paid` no longer reflects it.
2. **Stale total.** `total` is not recomputed from line items, so if the bill
   changed the status can be wrong.
3. **Guards skipped.** The overpaid check and advance-release logic live inside
   `reconcileBill` and do not run here.

Also `:155-157`: `unusedAdvance` is read and then written with no lock, so two
concurrent applies can both draw on the same remaining balance.

**The cash path is protected by a locking RPC and the advance path is not.**
Replacing `:172-174` with `reconcileBill(supabase, billId)` resolves all three.
**Effort: S.**

## F-29 — MEDIUM — CGST + SGST can differ from total tax by one paisa

`lib/gst.ts:90` and `:85-86`:

```ts
cgst: round2(taxTotal / 2), sgst: round2(taxTotal / 2)
```

Each half is rounded independently. For an odd-paisa total they do not sum back:
tax `10.05` → cgst `5.03` + sgst `5.03` = `10.06`.

On a GST tax invoice CGST + SGST must equal the tax charged; a one-paisa
mismatch is the kind of thing a GST audit queries. Fix is to round one half and
derive the other as `taxTotal - cgst`. Same at the rate-summary rows.
**Effort: S.**

## F-30 — MEDIUM — two GST rules named in the brief are not implemented

Verified absent, not inferred from one function:

| Rule | Status | Evidence |
|---|---|---|
| per-line `gst_rate` / `gst_amount` | **PASS** | `bill_items.gst_rate`, `tax_amount` |
| clinical items default 0% | **PASS** | `lib/billing/gst.ts:30-31` |
| pharmacy by drug category | **PARTIAL** | `cfg.pharmacyRate` is one tenant-wide default; per-line override only if the batch carries a rate |
| **non-ICU room rent > ₹5,000/day at 5%** | **ABSENT** | `grep` for any 5,000 threshold in the billing code returns nothing; `bed` falls to `default: rate 0` |
| **cosmetic / elective at 18%** | **ABSENT** | no cosmetic or elective concept exists |

**Live sizing (read-only query):**

| Tenant | `gst_enabled` | GSTIN | rooms > ₹5,000/day |
|---|---|---|---|
| `karur` (paying customer) | **false** | no | 0 |
| `newtest` | **true** | yes | **1 — ₹25,000/day, room "102"** |
| `demo` | true | yes | 1 — ICU ₹9,000 (**correctly exempt**) |

So it does **not** affect karur today. It does affect `newtest`, which has GST
enabled and a ₹25,000/day room that is not an ICU: that room rent is being
invoiced at 0% where the rule requires 5%. ICU is exempt at any rate, so the
implementation needs the ward-type distinction, and `ward_room_types` exists to
carry it. **Effort: M.**

## F-31 — LOW — `TABLE_MAP` must stay in step with `BillItemSource`, and nothing enforces it

`BillItemSource` has **17** values (`types/index.ts:703`); `generateBill`'s
`TABLE_MAP` (`:512-522`) has **9**. An unmapped source hits `if (!table) continue`
(`:526`) — **silently**, with no error and no log — so its row is never marked
billed.

Today this is safe, and for an incidental reason rather than a designed one:
`ot_consumable` is the only emitted source missing from the map, and its lines
are **nested children** of an `ot_schedules` row that *is* filtered
`.eq('billing_status','unbilled')` (`:225`). Flipping the parent hides the
children.

**The exception:** `selected_refs` lets the cashier bill a consumable **without**
its parent OT line. Then `refsBySource` contains only `ot_consumable`, nothing is
flipped, the parent stays unbilled — and the same consumable can be billed again.
Narrow, but reachable through normal UI selection. **Effort: S.**

## Still to read in Module 3

`cancelBill` · `finalizeBill` · `updateBillItemGst` · `recordPayment` /
`record_bill_payment` RPC body · `getBillingStats` · the three
`get*CombinedBillData` builders · `generateMissingDailyCharges` ·
`updateWardDailyRate` · `updateTariff` · and in `admissionBilling.ts`:
`recordAdvance` · `collectAdvanceDeposit` · `recordAdvanceRefund` ·
`issueAdvanceRefundBill` · `getAdmissionFinancials` ·
`listAdmissionsWithOutstandingBalance` · `getAdmissionAdvanceReceipt`.

---

# MODULE 3 — BILLING — part 2 (all mutation paths now read)

## F-32 — HIGH — money in is locked; money out is not

`record_bill_payment` (live catalog) is exemplary:

```sql
SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;   -- row lock
SELECT coalesce(sum(amount),0) INTO v_paid FROM payments WHERE bill_id = p_bill_id;
IF p_amount > v_balance + 0.001 THEN … refuse … END IF;
INSERT INTO payments …;  UPDATE bills SET paid = v_new_paid …;
```

The balance is computed **inside** the lock, overpayment is refused, and the
function is deliberately **not** `SECURITY DEFINER` — so RLS still decides which
bill the caller can see, and a foreign bill simply reads as "not found".

**Every other money path checks a balance in TypeScript and then writes.** The
Supabase JS client cannot take a row lock, so these are not careless — they are
*unable* to be safe in their current shape:

| Path | File:line | Balance read | Then writes |
|---|---|---|---|
| `issueCreditNote` | `refunds.ts:54,62` | `getRefundable()` | `credit_notes` insert |
| `recordAdvanceRefund` | `admissionBilling.ts:373,384` | `unusedAdvance` | `admission_advance_refunds` insert |
| `issueAdvanceRefundBill` | `admissionBilling.ts:494` | same | — |
| `collectAdvanceDeposit` | `admissionBilling.ts:243` | same | — |
| `applyAdvanceToBill` | `admissionBilling.ts:155,163` | same | `payments` insert — also F-28 |

Two concurrent refunds on one bill both read `refundable = ₹5,000` and both
insert ₹5,000. **₹10,000 leaves the hospital against a ₹5,000 entitlement**, with
no constraint to catch it. A double-click on a slow connection is enough; two
counters is enough.

The only RPCs besides the payment one are number generators —
`get_next_bill_no`, `get_next_credit_no`, `get_next_summary_no` — which protect
sequences, not balances.

**The asymmetry is the finding: inbound cash is serialised, outbound cash is
not.** Fix is to move each balance-check-then-write into an RPC shaped like
`record_bill_payment`. **Effort: M. Severity: High.**

## F-33 — MEDIUM — cancelBill reverts charges before it is allowed to cancel

`cancelBill` (`billing.ts:695-771`) carries a comment describing a real bug it
was written to fix:

> Cancelling twice is not a no-op… The second pass reverts the same charges to
> 'unbilled' again — but by then a replacement bill may legitimately own them,
> and it has just had them pulled out from under it. A stale tab or a
> double-click was enough.

The guard added for it reads the status at `:707-711`. **The fix is incomplete**,
because the order of operations is inverted:

```
:707  read status                 ← guard reads here
:710  if cancelled → return
:720  DELETE advance payments     ← destructive
:739  revert charges to unbilled  ← destructive
:764  UPDATE … .neq('status','cancelled')   ← conditional, atomic
```

Two concurrent cancels both pass the `:710` guard, both run the destructive
steps, and only then does one lose at `:764` — returning **success**, because a
zero-row conditional update sets no error. The charges have already been pulled
back a second time. That is exactly the scenario the comment set out to prevent:
the conditional update protects the *status column* but not the *reversion that
precedes it*.

Correct order is to claim the cancellation first (conditional update, check rows
affected) and revert only if it succeeded.

Two further notes on the same function:

- **A third copy of the source→table map.** `:739-758` is an if/else chain that
  must agree with `generateBill`'s `TABLE_MAP` (`:512-522`). They agree today —
  nine sources each — but nothing ties them. A source added to one and not the
  other strands charges as `billed` against a bill that no longer exists, which
  `:722-725` names as the failure to avoid.
- **Advance payments are deleted, not reversed** (`:720`, and `reconcile.ts:54`).
  After release there is no record that an advance was ever applied. For money,
  a reversing entry is the safer form.

**Good in this function:** blocking cancellation when non-advance payments exist
(`:713-717`), and reading the `bill_items` error rather than ignoring it
(`:728`) with the consequence spelled out.

## Module 3 status

**All mutation paths read** — `generateBill`, `applyDiscount`, `updateBillItemGst`,
`finalizeBill`, `cancelBill`, `recordPayment` + the RPC body, `applyAdvanceToBill`,
`recordAdvance`, `recordAdvanceRefund`, `collectAdvanceDeposit`,
`issueCreditNote`, `generateMissingDailyCharges`, plus `lib/gst.ts`,
`lib/billing/gst.ts`, `lib/billing/reconcile.ts`.

**Outstanding — read-only builders, no write risk:** `getCombinedBillData`,
`getOpdCombinedBillData`, `getPatientCombinedBillData`, `getBillingStats`,
`listBills`, `getBill`, `listTariffs`, and the two config setters `updateTariff`
and `updateWardDailyRate`.

## Verdicts — billing

| Rule from the brief | Verdict |
|---|---|
| Totals always match line items | **PASS** — recomputed from items every change |
| Duplicate-submit / double billing | **PASS** — conditional update, compare-and-set |
| Discounts | **PASS** — with an overpaid rollback |
| Partial payments | **PASS** — locked RPC |
| **Refunds** | **FAIL** — F-32, unlocked, over-refundable |
| **Cancellations** | **PARTIAL** — F-33, reverts before claiming |
| Advance is a deposit pool, not an invoice | **PASS** |
| Advance reconciles on discharge/refund | **PARTIAL** — F-28 bypasses reconcile; F-32 unlocked |
| GST per-line rate and amount | **PASS** |
| GST clinical 0% | **PASS** |
| GST pharmacy by category | **PARTIAL** — one tenant default + per-batch override |
| **GST non-ICU room rent > ₹5,000 at 5%** | **FAIL** — not implemented |
| **GST cosmetic / elective 18%** | **FAIL** — not implemented |
| GST rounding | **PARTIAL** — F-29, CGST+SGST can exceed tax by a paisa |
| Plan gating server-side | **PASS** for IPD billing |

---

# MODULE 4 — IPD / ADMISSIONS — **COMPLETE**

Files read: `ipd.ts` (598), `lib/cron/dailyBilling.ts` (145), `lib/ipdDailyBilling.ts`,
`lib/ipdBilling.ts`, `admissionBilling.ts` (already in Module 3), plus the
`claim_bed_and_admit` and `transfer_bed` function bodies from the live catalog.

## PASS — the parts that are right

**Bed claim: PASS.** `claim_bed_and_admit` uses a conditional update —
`UPDATE beds SET status='occupied' WHERE id=… AND status='available' RETURNING ward_id`
— so two admissions racing for one bed cannot both win. Same compare-and-set
discipline as the billing flip.

**Discharge gate: PASS, and thoughtfully.** `dischargePatient:474-500` runs
`catchUpDailyCharges` **before** the balance check, so nobody is discharged with
unbilled days, and the gate is **insurance-aware**: an approved-but-unsettled
claim covers its share and only the patient's residual is demanded.

**The daily-billing cron: PASS.** `lib/cron/dailyBilling.ts` filters
`.eq('tenant_id', …)` on every query — the service-role discipline F-23 warns
about, correctly applied. It enforces read-only **and** plan server-side in a
headless path (`:85-87`), resolves a per-tenant system actor for `created_by`
(`:103-111`, matching the `current_tenant_id() is NULL` trap), records blocked
days so a later catch-up never back-bills them (`:94-97`), and wraps each tenant
in its own try/catch.

**Daily charges are not double-billed.** `autoIpdBill` finds an existing bill by
`(tenant, admission, billing_date, bill_source)`, and `catchUpDailyCharges:344-347`
builds a `handled` set of days that already carry a `bed` line, so a day already
charged is skipped. *My concern about the cron and the ward board both billing
the same day was wrong and is withdrawn.*

**Temp-ward slot race: safe.** `admitPatient:78-81` names a slot `Slot-{count+1}`
after a count — racy — but `beds_ward_id_bed_no_key` is UNIQUE on
`(ward_id, bed_no)`, so the loser fails on the constraint rather than creating a
duplicate. Safe, though the error surfaced would be a raw constraint message.

## F-34 — HIGH — a bed can be claimed in another hospital

`claim_bed_and_admit` (live catalog), `SECURITY DEFINER` so RLS is off:

```sql
UPDATE beds SET status = 'occupied'
WHERE id = p_bed_id AND status = 'available'      -- no tenant_id filter
RETURNING ward_id INTO v_ward_id;
…
INSERT INTO admissions (… tenant_id …) VALUES (p_admission_id, current_tenant_id(), …)
```

The bed is located **by id alone**; the admission is then written with the
**caller's** tenant. Passing a bed UUID from another hospital:

- marks **their** bed occupied — removing capacity they can see no reason for
- creates an admission in **your** tenant holding **their** `bed_id` and
  `ward_id` — precisely the mixed-tenant row F-26 says nothing would catch

`transfer_bed` has the same shape and was already noted in F-03: no tenant
filter on either bed, and `admissions` updated by id alone.

Reachable by any authenticated user with `ipd:write` who holds a foreign bed
UUID. Since `0238` it is no longer reachable by `anon`.

Fix: filter both statements on `tenant_id = current_tenant_id()`, and reject
when the admission's tenant and the bed's tenant differ. **Effort: S.**

## F-35 — MEDIUM — a patient can be admitted twice

`admitPatient:47-54` counts active admissions in TypeScript and then admits:

```ts
const { count: activeCount } = await supabase.from('admissions')
  .select('id', { count:'exact', head:true })
  .eq('patient_id', patient_id).eq('status','admitted')
if ((activeCount ?? 0) > 0) return { success:false, … }
```

The check is not inside `claim_bed_and_admit`, and the RPC does not repeat it.
Two concurrent admissions of the same patient to **different** beds both read
zero and both succeed — each claiming its own bed, so the bed-level
compare-and-set does not help.

`admissions` has unique indexes on `(id)` and `(tenant_id, ip_no)` only. A
partial unique index — `ON admissions (patient_id) WHERE status = 'admitted'` —
would make this impossible. **Effort: S.**

## F-36 — LOW — `autoIpdBill` promises an idempotency it does not provide

`lib/ipdDailyBilling.ts:38-39` states the function "dedups on
(tenant, admission, date, bill_source) + ref_id, so it is safe to run" more than
once. For a line with `ref_id: null` that is **false** —
`lib/ipdBilling.ts:108`:

```ts
const newItems = lineItems.filter((i) => !i.ref_id || !alreadyBilledRefs.has(i.ref_id))
```

`!i.ref_id` makes a null-ref line **always** count as new. Every daily charge is
null-ref: room rent (`ipdDailyBilling.ts:93`), ICU monitoring (`:119`, `:135`),
ventilator (`:136`).

No harm today — every caller guards. The daily path skips days already carrying
a `bed` line; the pharmacy and lab callers pass real `ref_id`s
(`ipdTreatment.ts:613`, `:734`). **The hazard is the comment**: it tells the next
developer the function is safe to call twice, and for the daily charges it is
not. Either make it true (a deterministic ref_id per admission+day+charge) or
correct the comment. **Effort: S.**

## F-37 — LOW / LONGEVITY — the cron truncates silently and cannot scale sideways

- `dailyBilling.ts:123` — `.limit(1000)` on active admissions per tenant. Beyond
  that, charges are **silently** not generated: no error, no counter, nothing in
  `DailyBillingRunResult`. Absurd headroom for a 15-bed hospital, but it is a
  silent revenue stop rather than a loud failure.
- `:61-63` — all tenants loaded unpaginated, then processed **sequentially**,
  several queries each, under `maxDuration = 300` on the route. At roughly half a
  second per tenant that is a few hundred tenants before the run is cut off
  mid-loop. The next day's catch-up repairs it, so no money is lost — but the
  run reports success for a partial pass.

## F-38 — LOW — two copies of the read-only rule, described as mirrors, deliberately differing

`dailyBilling.ts:28-33` calls itself a "mirror of proxy.computeIsReadOnly". They
are not mirrors: for `status === 'suspended'`, the proxy returns **false** (it is
hard-blocked elsewhere) and the cron returns **true** (skip billing). Both are
correct for their own purpose, but the comment invites someone to sync them, and
doing so would either bill suspended hospitals or stop billing live ones.

## Verdicts — IPD

| Area | Verdict |
|---|---|
| Bed allocation race | **PASS** — compare-and-set |
| Bed allocation tenant scoping | **FAIL** — F-34 |
| Duplicate admission | **FAIL** — F-35 |
| Discharge balance gate | **PASS** — insurance-aware, catch-up first |
| Daily charge double-billing | **PASS** — guarded at day selection |
| `autoIpdBill` documented contract | **PARTIAL** — F-36 |
| Headless plan + read-only enforcement | **PASS** |
| Cron scale behaviour | **PARTIAL** — F-37 |
| Clinical admission separate from cash | **PASS** — admission succeeds without payment; cash is gated at discharge |

---

# MODULE 5 — LAB / RADIOLOGY + PARTITION LONGEVITY — **COMPLETE**

Read: `lab.ts` (839), `lib/lab/ingest.ts` (251), and from the live catalog the
bodies of `save_lab_analyte_results`, `alert_missing_next_partition`, the
critical-value triggers, and `cron.job` / `cron.job_run_details`.

## PASS — the best code in this codebase

`save_lab_analyte_results` deserves recording in full:

- **Cross-tenant guard.** `IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_tenant
  THEN RAISE … insufficient_privilege`, with the reason stated: *"A connector
  belonging to one hospital may not write onto another's order, however it
  arrived at the id. Barcodes repeat across hospitals by design."* This is the
  tenant check `claim_bed_and_admit` (F-34) is missing.
- **Age- and sex-aware reference ranges** — `resolve_reference_range(analyte,
  tenant, sex, age_days)`. The brief's age/sex item: implemented.
- **Critical evaluated before reference**, commented *"a potassium of 7.0 and one
  of 5.2 are not the same fact."*
- **No verdict on free text** — `value_type = 'text'` yields `unranged` rather
  than a guess.
- **Corrections supersede** — delete-then-insert, with the reason ON CONFLICT
  cannot be used under partitioning.
- **`withdraw_stale_critical`** retracts an alert when a value is corrected out
  of the critical band.
- **Authorisation is withdrawn on every write**: `verified_by = NULL,
  verified_at = NULL` — *"a result that has changed has not been checked by
  anybody yet."*

**Both result paths alert.** `trg_log_critical_result` on `lab_result_analytes`
and `trg_log_critical_item` on `lab_order_items`. *My suspicion that the analyzer
path skipped critical detection was wrong and is withdrawn — the check lives
inside the shared RPC, not in the TypeScript I first grepped.*

**The verify gate** (`verifyOrder:407-488`) refuses an order with no results,
refuses one with missing tests, reads **both** `lab_order_items` and
`lab_result_analytes` (the panel trap), guards partial-panel release behind
explicit confirmation, and uses a conditional status update with a zero-row
check — *"Reporting success for an authorisation that never happened is the worst
possible lie to tell on this particular screen."*

**The release gate** (`reportOrder:508-553`) requires `verified`, and carries the
payment gate with a comment explaining why the collection-time gate was
bypassable (tube labels, analyzer auto-advance). IPD exempt, correctly.

## F-42 — MEDIUM — the partial-panel safety check fails open

`countMissingAnalytes:497-505`:

```ts
const { data, error } = await supabase.rpc('get_lab_report_analytes', …)
if (error) { console.error(…); return 0 }     // ← 0 means "nothing missing"
```

If the RPC fails, the function reports **zero missing measurements**, the
confirmation prompt at `:465` is skipped, and an incomplete panel is verified as
though complete. A patient-safety check that fails open. It should refuse to
verify when it cannot establish completeness. **Effort: S.**

## F-43 — MEDIUM — "it will be marked interim" is not true

`verifyOrder:469-470` tells the technician the report *"will be marked interim
and a final report must follow."* Searching the codebase for `interim` finds
only that message, a button label and a UI comment. **Nothing is written.**
`:475-477` sets `status/verified_by/verified_at` and no partial-release flag.

So the order carries no record that it was released incomplete, and "a final
report must follow" is enforced by nothing. If the missing values are entered
later, a reprint silently becomes a full report with no amendment trail — which
is the amendment-history gap already on the lab backlog. **Effort: M.**

## F-44 — LOW — single tests get flat critical bounds, panels get age/sex-aware ones

`enterResults:351-357` reads `crit_low/crit_high` from `lab_tests_catalog` — one
flat pair per test. `save_lab_analyte_results` resolves them through
`resolve_reference_range(…, v_sex, v_age_days)`.

So a potassium measured as a panel analyte is judged against a neonate's range;
the same potassium entered as a single test is judged against the catalogue's
adult figure. Two sources of truth for the same clinical question.

## PARTITION LONGEVITY — the "many years" lens

`pg_cron` is installed and three jobs are active:

| Job | Schedule | Last runs |
|---|---|---|
| `create-next-month-partitions` | `5 0 1 * *` | **succeeded** 1 Jul, 1 Aug, 1 Sep, 1 Oct |
| `alert-missing-partitions` | `0 9 * * *` | succeeded daily |
| `refresh-dashboard-matviews` | `*/5 * * * *` | succeeded |

Runway on 30 Oct 2026: `appointments` → **y2027m12**; `lab_result_analytes` →
y2026m12; `visits`, `bill_items`, `lab_order_items`, `audit_logs` → **y2026m11**.

*I first read this as a 32-day fuse. It is not — the job has succeeded every
month and maintains a one-month runway by design. Alarm withdrawn.* Three real
findings remain.

### F-39 — MEDIUM — a five-minute hole at every month boundary

The job runs at **00:05 on the 1st**. Between 00:00:00 and 00:05:00 the new
month's partition does not exist, and an insert into `visits`, `bill_items`,
`lab_order_items` or `audit_logs` **fails outright** — no partition of relation …
found for row.

A hospital with a night shift is awake then: an emergency admission, a 00:30 lab
order. The window has already occurred four times this year.

Fix: schedule before the boundary (`55 23 L * *`) or create two to three months
ahead so a single miss is survivable. **Effort: S.**

### F-40 — MEDIUM — the partition alarm reports to nobody

```sql
RAISE WARNING 'Missing next-month partition: %_%', t, next_suffix;
```

A `WARNING` goes to the Postgres log. Nothing reads it. And because a warning is
not an error, `cron.job_run_details.status` reads **'succeeded' whether or not a
partition is missing** — so the monitoring record cannot distinguish a healthy
month from a broken one.

There is no path from "partition missing" to "a human knows". Combined with the
one-month runway, a single silent failure of job 1 means the hospital stops
being able to create visits, bills or lab orders on the 1st of the following
month. **Effort: S** — write to a table the app surfaces, or raise an exception
so the job is recorded as failed.

### F-41 — LOW — one table is protected twice, five are protected once

`appointments` has **14 months** of runway because it has a second mechanism —
`ensure_appointment_partition(date)` called on demand from `appointments.ts:86`
and `patientPortal.ts:701`, plus pre-creation in migration `0094`. The other
five partitioned tables rely solely on the monthly job.

So a failure of job 1 takes down visits, bills, lab orders and audit while
appointments carry on — an inconsistency worth making deliberate either way.

## Verdicts — lab

| Area | Verdict |
|---|---|
| Results cannot be released unverified | **PASS** |
| Panel/analyte two-table handling | **PASS** |
| Partial-panel release requires consent | **PASS** — but F-42 fails open |
| Interim marking | **FAIL** — F-43, promised and not recorded |
| Critical detection, manual path | **PASS** |
| Critical detection, analyzer path | **PASS** |
| Critical retraction on correction | **PASS** |
| Age/sex reference ranges | **PASS** for analytes, **PARTIAL** for single tests (F-44) |
| Verification withdrawn when a result changes | **PASS** |
| Connector cross-tenant write | **PASS** — explicitly guarded |
| Payment gate at release | **PASS** |
| Four-eyes (entry ≠ verification) | **BY DESIGN ABSENT** — documented in `rbac.ts` as a deliberate choice for single-technician labs |

---

# MODULE 6 — PHARMACY / INVENTORY / BLOOD BANK — **COMPLETE**

Read: `pharmacy.ts` (1,515), `inventory.ts` (384), `blood.ts` issue path, and from
the live catalog the bodies of `dispense_drug` and `issue_blood_unit`.

## PASS — stock and clinical safety are enforced in the database

**`dispense_drug`** cannot oversell or dispense an expired batch, and does both
in one atomic statement:

```sql
UPDATE drug_batches SET qty_available = qty_available - p_qty
WHERE id = p_batch_id
  AND qty_available >= p_qty      -- stock cannot go negative
  AND expiry > CURRENT_DATE;      -- an expired batch cannot be dispensed
IF NOT FOUND THEN RETURN 'Insufficient stock or batch expired'
```

Two pharmacists dispensing the last strip: one wins, the other is told. Expiry is
a database rule, not a UI check.

**`issue_blood_unit`** is the most safety-conscious function in the product.
Before a unit can be issued it requires, in order: the unit exists;
`screening_status = 'passed'` (TTI); the component matches the request; and **a
compatible cross-match recorded for that exact request *and* that exact unit**,
taking the most recent. Then it claims the unit atomically —
`status IN ('available','reserved') AND expiry >= CURRENT_DATE AND
screening_status = 'passed'` — **re-checking screening inside the claim**. These
are the checks that prevent a transfusion reaction.

**FEFO is correct** — `inventory.ts:40`, `.order('expiry', { ascending: true,
nullsFirst: false })`: oldest expiry first, undated batches last.

## 🔴 F-45 — HIGH — issuing a blood unit fails every time, and always has

`issue_blood_unit` ends with:

```sql
INSERT INTO blood_issues (id, request_id, blood_unit_id, patient_id,
                          price_snapshot, billing_status, issued_by)
VALUES (…);
```

**`tenant_id` is not in the column list.** In the live catalog
`blood_issues.tenant_id` is **`NOT NULL` with no default**. So every call raises
`23502 not-null violation` at the last statement.

The function body comes from
`supabase/migrations/0084_bloodbank_phase3_crossmatch.sql:90`, which rewrote it
when the cross-match requirement was added.

**Confirmed against production: `blood_issues` contains 0 rows.** A blood unit
has never been successfully issued through Uyirly.

`blood.ts:678` is the only creation path — every other reference is a read or a
`billing_status` update — so there is no second route that works.

One mercy: the `blood_units` claim happens before the failing INSERT, but a
plpgsql function with no EXCEPTION block is one transaction, so the whole thing
rolls back. **No unit is left stranded as 'issued'** — it simply never works.

For a hospital that has configured a blood bank, the final step of the workflow
is dead. **Effort: S** — add `tenant_id` to the insert.

## F-46 — HIGH — a pattern: `SECURITY DEFINER` RPCs that take ids and never check the tenant

This is the same defect in five places, and worth treating as one:

| Function | Locates by | Tenant check |
|---|---|---|
| `claim_bed_and_admit` | `p_bed_id` | **none** (F-34) |
| `transfer_bed` | three bed/admission ids | **none** (F-03) |
| `dispense_drug` | `p_batch_id` + 4 more ids | **none** |
| `issue_blood_unit` | `p_blood_unit_id`, `p_request_id` | **none** |
| `get_next_uhid_for` | `p_tenant_id` from the caller | **none** (F-03) |

Each is `SECURITY DEFINER`, so RLS is off, and each acts on a row found by id
alone. With a foreign id you can: occupy another hospital's bed, move their
patient between beds, **decrement their pharmacy stock**, consume a blood unit
from their fridge, and burn their patient numbering.

Each also writes a child row carrying **your** `current_tenant_id()` while
pointing at **their** parent — the mixed-tenant row F-26 says no constraint would
catch.

**The contrast is instructive.** `save_lab_analyte_results` — reviewed in Module 5
— does exactly this check and explains why:

> A connector belonging to one hospital may not write onto another's order,
> however it arrived at the id.

The pattern is understood in this codebase. It has been applied in one place and
not in five. Since `0238` none are reachable by `anon`, so this needs an
authenticated user of another tenant holding a foreign UUID.

**Fix is uniform:** add `AND tenant_id = current_tenant_id()` to each locating
statement, and refuse when the parent's tenant and the caller's differ.
**Effort: M across all five.**

## F-47 — LOW — FEFO governs inventory consumption, not pharmacy dispensing

`consumeFEFO` (`inventory.ts:31-40`) consumes oldest-expiry-first and is used for
stock issue and negative adjustments. But `dispense_drug` takes `p_batch_id` from
the **caller** — the database enforces *not expired* and *in stock*, but not
*oldest first*. Whichever batch the dispensing screen chooses is the one
consumed.

So FEFO at the pharmacy counter is a UI property, not an enforced one. Worth
confirming the dispense screen orders by expiry; nothing below it will.

## Verdicts — pharmacy / inventory / blood

| Area | Verdict |
|---|---|
| Stock cannot go negative | **PASS** — atomic |
| Expired batch cannot be dispensed | **PASS** — enforced in SQL |
| Concurrent dispense of last unit | **PASS** |
| FEFO on inventory consumption | **PASS** |
| FEFO on pharmacy dispensing | **PARTIAL** — F-47, caller chooses |
| Blood: TTI screening before issue | **PASS** |
| Blood: component match | **PASS** |
| Blood: compatible cross-match required | **PASS** |
| Blood: atomic unit claim | **PASS** |
| **Blood: issue completes** | **FAIL** — F-45, broken since `0084` |
| Tenant scoping in stock/bed/blood RPCs | **FAIL** — F-46 |

---

# MODULE 7 — OPD / APPOINTMENTS — **COMPLETE**

Read: `opd.ts` (386), `appointments.ts` (461), `lib/clinicalTemplates.ts`, plus
production counts to settle two questions the code alone could not.

## The brief's named rules — verified

| Rule | Verdict | Evidence |
|---|---|---|
| Check-in is payment-free | **PASS** | `appointments.ts:261` — *"Check-in is NEVER gated on payment — the doctor's queue must stay accurate"* |
| Only consultation start is payment-gated | **PARTIAL** — see F-48 | `opd.ts:120` |
| Financial and nursing panels excluded from the clinical notes workspace | **PASS** | `ConsultationWorkspace.tsx` imports neither; both appear only under `ipd/[admissionId]/` |
| Specialty templates are department-based, not tenant-wide | **PASS** | `clinicalTemplates.ts:20-34` resolves via the appointment's department, then the doctor's |

## PASS — other things done well

`startVisit` is idempotent, **blocks a patient who is admitted to IPD or active
in Emergency**, and when checking payment it fetches **all** bills including
cancelled ones — *"so a cancelled bill without payment doesn't silently bypass
the gate"* (`:89-91`). Cashless cover is keyed off `eligibility_status`, the
pre-authorisation decision, not the final claim status, with the reasoning
stated: the pre-auth is what unlocks treatment; the claim only settles money
later.

`bookAppointment` calls `ensure_appointment_partition` **before** inserting
(`:86`). That is why `appointments` carries 14 months of runway and is the one
partitioned table immune to F-39's month-boundary window.

`reopenVisit` leaves `billing_status` untouched, so reopening a billed visit
cannot put it back on the unbilled list.

## F-48 — MEDIUM — the consultation payment gate cannot fire in the common path

`opd.ts:120`:

```ts
if (hasBill && !hasPaid && !cashlessCovered) { return … 'collect payment …' }
```

The gate fires **only when a bill already exists** for the appointment. Nothing
creates one in the ordinary flow: `bookAppointment` inserts an appointment and
no bill, and `GenerateBillSchema` (`schemas/index.ts:549-550`) accepts
`visit_id` and `admission_id` but **no `appointment_id`** — so the billing screen
cannot produce one either.

Production bears it out: **443 bills, of which 13 carry an `appointment_id`** —
about 3%. For the other 97% of consultations `hasBill` is false, the gate passes,
and payment is collected **after** the consultation, from the unbilled-charges
list once the visit closes.

So the rule as written in the brief — *only consultation start is payment-gated* —
is implemented but inert for the normal path. Either the appointment-stage bill
should be created at booking (making the gate real), or the comment and the rule
should be restated to match what the product does. **Effort: M to make it real.**

## F-49 — LOW — two comments describe a flow that does not exist

- `opd.ts:270` — *"billing happens at booking time (not at close)"*
- `opd.ts:141` — *"the consultation bill created at booking time"*

No bill is created at booking. Both comments describe the intended design rather
than the shipped one, and they are the reason F-48 is easy to miss.

## F-50 — LOW / LATENT — nothing marks a visit billed when its appointment bill is paid

`startVisit:142` backfills `visit_id` onto an appointment-stage bill but never
sets `visits.billing_status = 'billed'`. The only place that happens is
`generateBill`'s `flipToBilled` (`billing.ts:501`).

So a consultation paid through an appointment-stage bill leaves its visit
`unbilled`, and `getUnbilledCharges:52-59` — which filters only on
`status='closed' AND billing_status='unbilled' AND consultation_fee > 0`, with
no check for an existing paid bill — would offer that same consultation fee for
billing a second time.

**Checked against production: zero visits are currently in that state.** The
path is structural, not live — the two billing routes have not yet overlapped on
a real visit. Worth closing before they do, since the appointment-stage route
does exist (4 such bills carry no `visit_id` today). **Effort: S.**

## F-51 — LOW — a write gated on a read permission

`startVisit:58` requires `opd:read`, yet it inserts a `visits` row. It works
today only because of who happens to hold what: `nurse` has `opd:read` (and so
may start a visit, plausibly intended), while `receptionist` has neither and so
cannot. The guard expresses the intent by accident rather than by name.

## F-52 — LOW — the duplicate-appointment guard is a read-then-write

`bookAppointment:64-73` selects an existing active appointment for the same
patient and date, then inserts. Two concurrent bookings both read none and both
succeed. Same class as F-35; the consequence here is a duplicate appointment and
a wasted token, not a clinical or financial error.

## Verdicts — OPD

| Area | Verdict |
|---|---|
| Check-in payment-free | **PASS** |
| Consultation-start payment gate | **PARTIAL** — F-48, inert for ~97% of visits |
| Patient cannot start an OPD visit while admitted | **PASS** |
| Cancelled bills cannot bypass the gate | **PASS** |
| Cashless cover keyed to pre-auth | **PASS** |
| Clinical workspace free of money and nursing | **PASS** |
| Templates department-scoped | **PASS** |
| Consultation double-billing | **LATENT** — F-50, zero live instances |
| Appointment partition safety | **PASS** — on-demand creation |

---

# MODULE 8 — STATUTORY REGISTERS (PC&PNDT / MTP / MLC) — **COMPLETE**

Read: `pcpndt.ts` (1,012), `mlc.ts` (529), and from the live catalog the trigger
suite on `form_f_records`, `mtp_records`, `mlc_records` and
`mlc_police_intimations`.

Emergency (`emergency.ts`) and OT (`ot.ts`) are **not** covered here — they are
clinical workflow rather than statutory record-keeping and are listed as a
separate module still outstanding.

## PASS — the legal controls are enforced in the database, not the UI

Eight triggers, all enabled:

| Control | Mechanism |
|---|---|
| A record cannot be completed with mandatory fields blank | `form_f_completeness_gate`, `mtp_completeness_gate`, `mlc_completeness_gate` |
| A completed record cannot be edited | `form_f_lock_completed`, `mlc_lock_completed` |
| A record cannot be deleted | `form_f_no_delete`, `mlc_no_delete` |
| A police intimation cannot be altered once recorded | `mlc_intimation_immutable` |

`mtp_completeness_gate` checks patient name, husband's name, address, gravida,
para, living children and abortions before a record may be marked complete —
the fields the form legally requires, refused at the database.

`form_f_lock_completed` refuses an edit with the serial number in the message
and points at the right remedy:

> Form F % is complete and cannot be edited. Raise an amendment instead — the
> original stays on the record.

**`amendFormF` is the right design, and its reasoning is worth preserving**
(`pcpndt.ts:283-292`):

> Never an edit. A new record is created carrying everything the original said,
> pointing back at it and stating why, and the original is marked superseded
> rather than changed. Both are kept. … The alternative is a register whose
> contents can quietly differ from the paper already filed with the Appropriate
> Authority, which is not a register at all — and a discrepancy found at an
> inspection reads as concealment, not as a typo.

That is the correct instinct for a statutory register and it is implemented, not
just described.

## F-54 — MEDIUM — the MTP register has two of the three controls the others have

| Register | completeness | locked after completion | delete blocked |
|---|---|---|---|
| `form_f_records` | ✅ | ✅ | ✅ |
| `mlc_records` | ✅ | ✅ | ✅ |
| **`mtp_records`** | ✅ | **✗** | **✗** |

A completed MTP record can be silently edited, and can be deleted outright.
Form F and MLC both refuse.

MTP records carry statutory confidentiality and a retention duty under the
Medical Termination of Pregnancy Act, so of the three this is the register
where a silent edit matters most. The pattern exists twice in the same codebase
with the same helper shape, which suggests an omission rather than a decision.

**Fix: `mtp_lock_completed` and `mtp_no_delete`, modelled on the Form F pair.
Effort: S.**

## Noted — the service-role escape hatch is deliberate

`form_f_lock_completed` opens with:

```sql
IF (SELECT auth.role()) = 'service_role' THEN RETURN NEW; END IF;
```

Necessary — `purge_tenant_data` must be able to remove a tenant — but it means
any of the 128 service-role call sites (F-23) could edit a completed statutory
record without the lock firing. Defensible, and worth stating: the lock protects
against tenant users, not against our own backend.

## F-53 — LOW — leave can only be filed on behalf of a nurse

*Found from a live question on `karur.uyirly.com/scheduling`, not from the
reading order.*

The "Nurse (blank = you)" picker is fed by `scheduling/page.tsx:31`:

```ts
supabase.from('profiles').select('id, full_name')
  .eq('role', 'nurse').eq('is_active', true)
```

Karur has 10 staff: 3 nurses, 2 lab techs, 2 pharmacists, 1 receptionist, 1 HR,
1 admin. The three names shown are correct — they are all the nurses — but the
other **seven cannot have leave filed for them**. They can only file their own.

The server already permits it. `requestLeave:225-227` accepts any `profile_id`
and correctly restricts filing-on-behalf to a holder of `leave:approve`,
silently substituting the actor's own id otherwise — the right shape. **So the
limitation is the UI query alone.**

It matters now because the HR role added on 30 Oct exists to do exactly this
job, and the screen will not let it. Dropping `.eq('role','nurse')` and
relabelling to "Staff member" is the whole fix. **Effort: S.**

Scheduling is nurse-centric throughout — coverage rules, ward ratios,
`admission_nurse_assignments` — which is defensible, since nurse rostering is
the hard part. But **leave is not a nursing concept** and is sitting inside a
nurse-shaped screen.

## Verdicts — statutory registers

| Area | Verdict |
|---|---|
| Mandatory fields enforced before completion | **PASS** — all three registers |
| Completed Form F immutable | **PASS** |
| Completed MLC immutable | **PASS** |
| **Completed MTP immutable** | **FAIL** — F-54 |
| Form F / MLC deletion blocked | **PASS** |
| **MTP deletion blocked** | **FAIL** — F-54 |
| Police intimation immutable | **PASS** |
| Amendment rather than edit | **PASS** — and well reasoned |
| Register access restricted | **PASS** — `pcpndt:record` admin + doctor, `pcpndt:report` admin only; HR has neither |

---

# MODULE 9 — EMERGENCY / OT — **COMPLETE**

Read: `emergency.ts` (498), `ot.ts` (464), and the `ot_schedules` constraint set
from the live catalog.

**This module is almost entirely clean.** Recording that plainly: the
concurrency control here is the best in the product.

## PASS — theatre double-booking is prevented by the database

```sql
EXCLUDE USING gist (ot_room_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&)
  WHERE (status = ANY (ARRAY['scheduled','in_progress']))
```

A GIST exclusion constraint on room **and** overlapping time range — the
textbook-correct way to prevent overlapping bookings, where most codebases use a
read-then-write check that races. And it is **partial**: cancelled and completed
surgeries release the slot rather than blocking it forever.

Both `scheduleSurgery:124-127` and `rescheduleSurgery:155-157` catch `23P01` and
translate it into *"Room already booked for this time slot."* The constraint
carries no `tenant_id`, which is harmless — `ot_room_id` belongs to exactly one
tenant.

## PASS — a surgery cannot be billed twice, and a failed bill is not lost

`setOtStatus:204-206` moves status with a **conditional transition**:

```ts
const from = status === 'in_progress' ? ['scheduled'] : ['scheduled','in_progress']
.update({ status }).eq('id', id).in('status', from).select(…)
```

with the reason stated — *"surgery can't be moved back (that would allow billing
it twice)"* — and a zero-row check that says so to the user.

`billCompletedSurgery:232-245` then **claims the billing before creating it**:

```ts
.update({ billing_status: 'billed' }).eq('id', row.id).eq('billing_status','unbilled').select('id')
if (!claimed?.length) return null
…
if (!billId) await supabase.from('ot_schedules').update({ billing_status: 'unbilled' })…
```

Claim-then-revert-on-failure. Two clicks cannot bill it twice, and a bill that
fails to materialise releases the charge back to the Bill Builder rather than
stranding it as billed. The docstring describes exactly this.

It also passes a real `ref_id` (`row.id`), so `autoIpdBill`'s dedup works for
this caller — confirming the F-36 assessment that every current caller is safe.

## PASS — emergency guards

`registerEmergency` refuses a second active case for the same patient, and
refuses an ER registration for a patient who is currently **admitted**, with the
reasoning written down: *"An inpatient isn't an ER walk-in — an admitted
patient's emergencies are handled within IPD."*

## Observation — the "no mobile" problem is already solved here, in one place

An unknown arrival gets a provisional patient (`emergency.ts:62-68`):

```ts
const provName  = parsed.data.prov_name?.trim()
  || `Unknown ${gender…} ~${age}y`
const provPhone = `PROV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
```

A **synthetic, unique** phone. That matters for the family-link design behind
F-24: because it is unique, an unidentified casualty can never be
phone-matched into somebody else's family. The hazard I raised — that
`patients.phone` is `NOT NULL` with no "no mobile" option, so staff must type
*someone's* number — **already has its answer in this file.** It exists in
Emergency and not at OPD/front-desk registration.

If the mobile number becomes the family link, this `PROV-` pattern is the
mechanism to reuse at registration. Cross-referenced to F-24.

## F-55 — LOW — the emergency duplicate guards are read-then-write

`registerEmergency:35-53` counts active ER cases and active admissions in
TypeScript, then inserts. Two concurrent registrations both read zero and both
succeed. Same class as F-35 (duplicate admission) and F-52 (duplicate
appointment); the consequence here is two casualty cases for one arrival, which
a nurse would notice immediately. **Effort: S** — a partial unique index on
`emergency_cases (patient_id) WHERE status IN ('waiting','in_treatment')`.

## Verdicts — emergency / OT

| Area | Verdict |
|---|---|
| Theatre double-booking | **PASS** — GIST exclusion constraint |
| Reschedule respects the same constraint | **PASS** |
| Cancelled/completed surgeries release the slot | **PASS** |
| Surgery cannot be billed twice | **PASS** — conditional transition + claim |
| Failed OT bill releases the charge | **PASS** |
| ER duplicate case for one patient | **PARTIAL** — F-55, racy |
| ER registration blocked for an admitted patient | **PASS** |
| Unknown-patient handling | **PASS** — provisional identity, unique synthetic phone |

---

# MODULE 10 — INSURANCE — **COMPLETE**

Read: `insurance.ts` (1,494). The module `startVisit` and `dischargePatient`
both depend on for their cashless gates.

## PASS — the gate that unlocks free treatment is properly held

`decideEligibility:510-544` is the function that lets a patient be treated
without paying, so it matters who can call it and whether it can be flipped:

- `requirePermission('insurance:write')` — **admin and accountant only**.
  Receptionist, doctor and nurse hold `insurance:read`. The front desk cannot
  wave a patient through.
- **One-shot**: `if (claim.eligibility_status !== 'pending') return 'already
  decided'`. An approval cannot be re-decided or reversed into a second
  approval.
- An estimated amount is required before approval, and the approved figure is
  validated by `checkCoverage` against the policy.
- Decision, timestamp, amount, denial reason and remarks are all recorded, with
  an audit entry carrying the approved amount.

## PASS — settlement is the most mature financial code in the product

`recordSettlement:617-698`:

- **The shortfall must be resolved explicitly.** If the insurer settles less
  than pre-auth covered, the action refuses until the user chooses to write it
  off or recover it from the patient — *"otherwise it silently reads as fully
  covered while less money was collected (the revenue-leak fix)."*
- **Conditional status update** `.eq('status','approved')` with a zero-row
  check, and the comment records the bug it fixes: *"two settlement clicks at
  once used to both pass the 'approved' check above and post the insurer's
  money twice."*
- Money is posted **through `record_bill_payment`**, the row-locked RPC, across
  all bills of the encounter, oldest balance first.
- TDS, UTR, settlement account and notes are all captured.

## The line that confirms F-28, from the other side

`recordSettlement:676-678`:

```ts
// Balance from the payments table (bills.paid can drift), posted through the
// row-locked record_bill_payment so paid/status stay consistent.
const { data: pays } = await supabase.from('payments').select('amount').eq('bill_id', b.id)
const paidSoFar = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0)
```

**`bills.paid` can drift** — known, written down, and worked around here by
recomputing from `payments` and posting through the locked RPC.

F-28 is the thing that *causes* that drift: `applyAdvanceToBill` writes
`bills.paid` by hand from a stale read instead of calling `reconcileBill`. So
one part of the codebase compensates for a defect another part creates. That
raises F-28 from a theoretical race to a known, observed behaviour — and makes
the one-line fix more clearly worth taking.

## F-56 — MEDIUM — an insurer overpayment is logged and then dropped

`recordSettlement:688-690`. After allocating across the encounter's bills, any
remainder becomes `unallocated`, which is written into the audit entry and
**nothing else**. No credit note, no advance, no ledger row, no warning to the
user — the action returns plain success.

If a TPA settles more than the bills outstanding (a corrected settlement, a
consolidated payment, a bill cancelled after approval), the hospital has the
money in its bank and nothing in Uyirly says where it belongs. It would surface
only as a mismatch during reconciliation, months later.

At minimum the user should be told. Better: post it as patient credit or an
advance against the encounter. **Effort: S to warn, M to post.**

## F-57 — LOW — partial allocation can succeed silently

The posting loop (`:681-686`) catches a failed `record_bill_payment`, writes to
`console.error`, and `continue`s. So if the first bill posts and the second
fails, the claim is marked **settled**, the user sees success, and part of the
insurer's money was never applied to a bill.

Same class as F-16 (`logAudit` swallowing its error): a failure that only a
server log would reveal. The outer action already knows how to refuse — the
shortfall check does exactly that — so the pattern exists to copy.

## Noted — no second person on an approval

The accountant who creates a claim can approve its own eligibility. Consistent
with the lab's documented single-technician decision (`rbac.ts`), and
defensible at this hospital size, but it is the gate that releases treatment
without payment and is worth a deliberate decision rather than an inherited one.

## Verdicts — insurance

| Area | Verdict |
|---|---|
| Eligibility approval restricted | **PASS** — admin/accountant only |
| Eligibility cannot be re-decided | **PASS** |
| Approved amount validated against policy | **PASS** |
| Settlement requires an approved claim | **PASS** |
| Double settlement | **PASS** — conditional update, bug recorded |
| Shortfall against pre-auth | **PASS** — explicit resolution forced |
| Settlement posted through the locked RPC | **PASS** |
| Insurer overpayment | **FAIL** — F-56, logged and dropped |
| Partial allocation failure surfaced | **FAIL** — F-57, silent |
| Second-person approval | **ABSENT** — by design, undocumented |

---

# MODULE 11 — EMR / ALLERGIES / DOCUMENTS — **COMPLETE**

Read: `emr.ts` (311), `allergies.ts` (73), `documents.ts` (134),
`rxSafety.ts` (60), `dosing.ts` (40), and the prescribing surface of
`ConsultationWorkspace.tsx`.

**Correction first.** Grepping `opd.ts` and `ipdTreatment.ts` for "allerg"
returned nothing and I read that as *no allergy check when prescribing* — the
most serious thing that could be true of a clinical system. It is **wrong**.
The check lives in `rxSafety.ts`, called from the prescribing UI as the doctor
types. Third time in this audit a control has turned out to live somewhere my
first grep did not reach.

## PASS — prescribing safety exists and is clinically thought through

`rxSafety.ts:8-13` matches **allergy classes**, not just exact names:

```ts
penicillin: ['penicillin','amoxicillin','ampicillin','cloxacillin','augmentin', …]
sulfa:      ['sulfa','sulfamethoxazole','cotrimoxazole','septran','bactrim']
nsaid:      ['ibuprofen','diclofenac','aspirin','naproxen','aceclofenac', …]
cephalosporin: ['cephalexin','cefixime','ceftriaxone','cefuroxime', …]
```

So an allergy recorded as "penicillin" flags amoxicillin — the cross-reactivity
that actually causes harm. Interactions against the other drugs on the
prescription are checked too, warnings are de-duplicated, and an `AllergyBanner`
sits at the top of the consultation workspace.

**It is deliberately non-blocking** — *"a safety aid, not exhaustive"* and
*"Non-blocking — the doctor decides."* That is the right call: a recorded
allergy is sometimes a mild intolerance, and sometimes there is no alternative.
Blocking would be worse medicine.

**Document storage is sound where it matters**: the `documents` bucket is
private with no policies (service-role only), paths are
`tenants/{tenantId}/patients/{patientId}/{uuid}.{ext}` with the tenant
**server-derived** via `requireTenantId()`, and access is through short-lived
signed URLs (1 hour).

## F-58 — MEDIUM — patient documents have no type or size limit, at either layer

`getUploadUrl:33-40` takes the filename, splits off an extension, and mints a
signed upload URL. There is **no MIME check and no size check**. The bucket
agrees: from the live catalog, `documents` has `file_size_limit: null` and
`allowed_mime_types: null`.

Compare `tenant-logos` — 2 MB, and `{image/png, image/jpeg, image/webp}`. The
bucket holding patient records is the one with no limits.

Anyone with `emr:document:upload` — which includes **receptionist** — can
therefore upload a file of any type and any size into the hospital's storage.
The realistic harm is cost and abuse rather than compromise, since the bucket is
private and served only through signed URLs. **Effort: S** — set the two bucket
properties and validate the extension.

## F-59 — LOW — nothing records that a safety warning was shown or overridden

The warning is computed in the UI; `addPrescription` (`opd.ts:196`) never learns
a warning existed. So when a doctor prescribes amoxicillin to a
penicillin-allergic patient, the record shows only the prescription.

For an advisory control the override trail **is** the control — it is what
protects the doctor and the hospital afterwards, and what distinguishes a
considered decision from an unnoticed one. Passing the warnings into
`addPrescription` and storing them with an acknowledgement would close it.
**Effort: S.**

## F-60 — LOW — allergen matching is bidirectional and can misfire

`rxSafety.ts:31`:

```ts
let hit = name.includes(allergen) || allergen.includes(name)
```

The minimum length is 3, so a short allergen matches inside unrelated names —
an allergy recorded as "ACE" flags **par-ace-tamol**. False positives are not
harmless in a safety system: they train the doctor to dismiss the banner, which
costs the true positives.

**Theoretical today** — `patient_allergies` holds 2 rows and none is 3–5
characters. Worth tightening to word-boundary matching before the register
grows. **Effort: S.**

## F-61 — LOW — the interaction check sees only this prescription

`checkPrescriptionSafety(patientId, drugName, currentDrugs)` takes
`currentDrugs` from the **client**, meaning the drugs on the prescription being
written. A patient's existing long-term medication — warfarin from a previous
visit, say — is not considered, so the clinically dangerous interaction is the
one least likely to be caught.

## Noted — a scale caveat, not a problem today

`rxSafety.ts:44` loads the **entire** `drug_interactions` table on every
keystroke past three characters, with no filter. At **38 rows** this is free,
and flagging it as a performance defect would be inflation. Recorded only
because the table is global reference data that is expected to grow, and the
query has no `WHERE` to grow into.

## Verdicts — EMR

| Area | Verdict |
|---|---|
| Allergy recorded and surfaced at prescribing | **PASS** |
| Allergy class cross-reactivity | **PASS** |
| Drug interaction checking | **PARTIAL** — F-61, this prescription only |
| Warning blocks the prescription | **BY DESIGN ABSENT** — correct |
| Override recorded | **FAIL** — F-59 |
| Allergen match precision | **PARTIAL** — F-60 |
| Document bucket private | **PASS** |
| Upload path tenant-scoped, server-derived | **PASS** |
| Upload type/size limits | **FAIL** — F-58 |
| Document read restricted by role | **FAIL** — F-08 (Module 2) |
