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
