# Staff Scheduling & Nurse Rostering — Requirements & Design Spec

**Status:** Draft for review (not yet built)
**Author:** Engineering
**Date:** 2026-07-14
**Scope:** Nurse rostering, leave management, coverage rules, and patient-to-nurse assignment for IPD.

---

## 1. Problem Statement

Today, IPD nurse assignment (`NursingPanel.tsx`) presents a native `<select>` listing **every nurse** in the tenant, per shift. This breaks down the moment a hospital has more than ~20 nurses:

- No search — you scroll a 100+ item dropdown.
- No awareness of **who is actually rostered** to work that shift today.
- No awareness of **who is on leave**.
- No awareness of a nurse's **current patient load** — you can silently overload one nurse.
- Shifts are hardcoded to `morning` / `night`, contradicting the rest of the system.

But the assignment picker is only the *visible tip*. The real question the user raised is the hard one:

> "Who schedules the roster every day? At 1000 nurses how does that happen? Any automated way? How are shifts decided? What happens when a nurse takes leave?"

Patient-to-nurse assignment **sits on top of a roster**. Without a roster + leave + coverage foundation, the picker can only ever be a prettier dropdown. This spec designs the whole stack.

---

## 2. Domain Primer — How Nurse Rostering Actually Works

### 2.1 Who builds the roster (and it isn't "daily, centrally")

Nobody rosters 1000 nurses from one desk. In a real hospital it is **decentralized by ward/unit**:

- Each ward/unit has a **charge nurse / nurse manager (ward in-charge)** who rosters **only their unit** — typically 20–40 nurses.
- 1000 nurses ≈ **25–40 units**, so ~30 managers each own ~30 nurses. Every roster problem is therefore small and local.
- Rosters are published **weekly or monthly, 2–4 weeks ahead** — not daily.
- The **daily** activity is *attendance + gap-filling*: who actually showed up, and who backfills a no-show.

**Design implication:** rostering is scoped **per ward**, owned by a **ward in-charge** role we don't have yet. We must not build a single global roster editor.

### 2.2 How shifts are decided

Two independent inputs:

1. **Shift *types*** — hospital-defined windows. e.g. Morning 07:00–14:00, Evening 14:00–21:00, Night 21:00–07:00. Some run 2 × 12h, some 3 × 8h. **Configurable per tenant.**
2. **Shift *headcount*** — driven by **census × nurse:patient ratio**:

   `required_nurses(ward, shift) = ceil(occupied_beds / ratio)`

   Indian norms (INC / NABH) as sensible defaults:

   | Ward type | Day ratio | Night ratio |
   |---|---|---|
   | General ward | 1:6 | 1:8–10 |
   | HDU / step-down | 1:3 | 1:4 |
   | ICU / critical | 1:1 | 1:1 |
   | Post-op / recovery | 1:3 | 1:4 |

   Example: a 30-bed general ward with 24 occupied beds at 1:6 day → **4 nurses** that shift. A 10-bed ICU at 1:1 → **10 nurses**.

**Design implication:** ratios live per **ward** (with a tenant default), and coverage requirement is computed from **live bed census**.

### 2.3 The automation ladder (user chose: patterns **and** coverage)

| Level | Technique | Effort | Notes |
|---|---|---|---|
| 0 | **Manual grid** | — | Baseline; always available |
| 1 | **Copy-forward** | Low | Clone last week as the starting draft — covers ~80% of edits |
| 2 | **Cyclic patterns** | Medium | Each nurse follows a rotation template (e.g. `7×M → 2 off → 7×E → 2 off → 7×N → 3 off`); system stamps it across N weeks |
| 3 | **Coverage auto-fill** | Medium | Compute required headcount per ward/shift from census × ratio, then auto-assign available (not-on-leave) nurses to hit the number |
| 4 | Full constraint optimization (ILP) | High | **Out of scope** — overkill for ≤200-bed hospitals |

The chosen approach is **patterns as the base + coverage as the check/fill**: stamp a cyclic pattern to draft the roster, then the coverage engine flags under-staffed shifts and offers to auto-fill from the available pool.

### 2.4 Leave handling — the two cases

1. **Planned leave** (annual/casual, requested ahead): nurse submits a `leave_request` → in-charge approves → roster **generator excludes** them on those dates → coverage check surfaces a **gap** → in-charge fills it (another nurse / overtime / float pool).
2. **Same-day sick / no-show** (the hard, high-value case): nurse marked `absent` at attendance → today's shift shows a **hole in coverage** → a **"find replacement"** action surfaces **available nurses** (off-duty-but-present, on-call, float pool) ranked by load/proximity → 1-tap backfill.

**Design implication:** we need a real `leave_requests` table (request → approve → feed generator). `staff_attendance.status = 'leave'` already exists but is an *attendance outcome*, not a *request/approval workflow*.

---

## 3. What Exists vs. What's Missing

### 3.1 Existing tables (verified against `supabase/baseline/01_schema.sql`)

| Table | Columns | Role in this module |
|---|---|---|
| `duty_roster` | `id, profile_id, date, shift(morning\|evening\|night), ward_id, tenant_id` | **The roster.** Missing: status, unique constraint, source (manual/pattern/auto), created_by |
| `staff_attendance` | `id, profile_id, date, status(present\|absent\|leave\|half_day), shift, check_in, check_out, tenant_id` | Daily actuals; drives same-day gap detection |
| `admission_nurse_assignments` | `id, tenant_id, admission_id, nurse_id, shift(**morning\|night only**), assigned_date, charge_snapshot` | Patient→nurse assignment; **shift CHECK inconsistent with roster** |
| `wards` | `id, name, ward_type, room_type, daily_rate, …` | Needs nurse:patient ratio columns |
| `beds` | `id, ward_id, status(available\|occupied\|maintenance)` | Census source for coverage |
| `admissions` | `id, patient_id, ward_id, bed_id, status, …` | Live census + who needs nursing |
| `profiles` / `staff_profiles` | role enum: `admin,doctor,nurse,receptionist,lab_tech,pharmacist,accountant`; `staff_profiles.designation` free text | No **ward in-charge** concept |

### 3.2 Missing pieces

1. **Shift definitions** — configurable shift types per tenant (name, start, end, crosses-midnight).
2. **Ward coverage rules** — nurse:patient ratio per ward per shift.
3. **Ward in-charge assignment** — which nurse manages which ward's roster.
4. **Leave management** — `leave_requests` (+ optional `leave_balances`).
5. **Roster metadata** — status/lifecycle (draft → published), source, unique guard, created_by.
6. **Rotation patterns** — reusable cyclic templates + nurse↔pattern binding.
7. **A real assignment picker** — roster-aware, searchable, load-aware.

### 3.3 Data inconsistency to fix (pre-work)

`admission_nurse_assignments.shift` allows only `morning|night`, while `duty_roster`/`staff_attendance` allow `morning|evening|night`. Once shift types become **configurable**, all three should reference the shift-definitions set (or at minimum share the 3-value CHECK). This must be reconciled in Phase 1's migration, with a data backfill plan for existing rows.

---

## 4. Proposed Architecture — the "Staff Scheduling" module

Six layers, bottom-up. Each is independently useful; the picker (top) works even if only the manual roster (middle) exists.

```
┌─────────────────────────────────────────────────────────┐
│ 6. Patient → Nurse Assignment picker (IPD)              │  ← the original ask
│    searchable · roster-aware · load + capacity chips     │
├─────────────────────────────────────────────────────────┤
│ 5. Daily Attendance + same-day gap "find replacement"   │
├─────────────────────────────────────────────────────────┤
│ 4. Roster Builder (grid)                                 │
│    manual · copy-forward · pattern-stamp · coverage-fill │
├─────────────────────────────────────────────────────────┤
│ 3. Leave Management (request → approve → exclude)        │
├─────────────────────────────────────────────────────────┤
│ 2. Coverage Rules (ward × shift × nurse:patient ratio)  │
├─────────────────────────────────────────────────────────┤
│ 1. Shift Definitions (configurable per tenant)          │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Schema Design (new tables)

All tables: `tenant_id uuid NOT NULL`, RLS enabled with the standard `tenant_id = current_tenant_id()` policy, and a matching partial index on `tenant_id`. Follows the existing project RLS pattern.

### 5.1 `shift_definitions` — configurable shift types (Layer 1)

```sql
CREATE TABLE shift_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,              -- 'morning','evening','night' (stable key)
  label         text NOT NULL,              -- 'Morning (7a–2p)'
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,  -- night 21:00→07:00
  sort_order    int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
```
Seeded on tenant creation with the current 3 defaults so nothing breaks. `duty_roster.shift`, `staff_attendance.shift`, `admission_nurse_assignments.shift` reference `code`.

### 5.2 `ward_coverage_rules` — nurse:patient ratios (Layer 2)

```sql
CREATE TABLE ward_coverage_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ward_id       uuid NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  shift_code    text NOT NULL,             -- FK-by-value to shift_definitions.code
  patient_ratio numeric NOT NULL DEFAULT 6,-- 1 nurse : N patients
  min_nurses    int NOT NULL DEFAULT 1,    -- floor regardless of census
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ward_id, shift_code)
);
```
Alternative considered: put ratio directly on `wards`. Rejected — ratios differ by shift (day vs night), so a per-ward-per-shift row is correct. A tenant-level default fills wards with no explicit rule.

**Required headcount:**
`required = max(min_nurses, ceil(occupied_beds_in_ward / patient_ratio))`
`occupied_beds` from `admissions WHERE ward_id = ? AND status = 'admitted'` (or `beds.status='occupied'`).

#### One nurse, many patients — the capacity model

The ratio's `N` (the "6" in 1:6) **is the number of patients one nurse can hold**. A nurse is never 1:1 — they always cover multiple patients up to their capacity:

- `capacity_per_nurse = patient_ratio` for that ward/shift.
- `total_capacity = nurses_present × capacity_per_nurse`.

**Worked example — 10 patients, 3 nurses present, ward ratio 1:6:**
capacity = 3 × 6 = 18 ≥ 10 → **covered**, ~3–4 patients each, no warning. `required = ceil(10/6) = 2`, so 3 present is comfortable.

**Understaffed example — 10 patients, 2 nurses, HDU ratio 1:3:**
capacity = 2 × 3 = 6 < 10 → **coverage gap**; `required = ceil(10/3) = 4`, have 2. Shown red as "need 4, have 2"; each nurse goes over capacity (5 each).

**Assignment is never blocked.** A short-staffed shift produces a *warning*, not a hard stop — you cannot refuse to nurse an admitted patient. The system's job is to make the overload **visible** (red chip + coverage banner) so the in-charge pulls in help (another nurse / float pool / overtime), not to prevent the assignment.

### 5.3 `ward_incharges` — who rosters which ward (decentralization)

```sql
CREATE TABLE ward_incharges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ward_id     uuid NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ward_id, profile_id)
);
```
A nurse listed here can edit/publish that ward's roster. `admin` role bypasses (can edit any). This gives the per-ward ownership the 1000-nurse model requires without adding a new global role.

### 5.4 `leave_requests` — leave workflow (Layer 3)

```sql
CREATE TABLE leave_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type   text NOT NULL,   -- 'annual','casual','sick','unpaid','maternity'
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  reason       text,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by  uuid REFERENCES profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX ON leave_requests (tenant_id, profile_id, start_date, end_date);
```
Optional companion `leave_balances (profile_id, year, leave_type, entitled, used)` — deferred to a later phase; not needed for roster correctness.

The roster generator treats a nurse as **unavailable** on any date where an `approved` leave overlaps. Same-day sick handled via `staff_attendance.status='absent'` + the replacement flow.

### 5.5 `roster_patterns` + `roster_pattern_members` — cyclic templates (Layer 4)

```sql
CREATE TABLE roster_patterns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,               -- 'Standard 3-shift rotation'
  cycle_days  int  NOT NULL,               -- length of one cycle, e.g. 28
  -- day_plan[i] = shift_code for cycle day i, or NULL/'off'
  day_plan    text[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roster_pattern_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pattern_id   uuid NOT NULL REFERENCES roster_patterns(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ward_id      uuid REFERENCES wards(id) ON DELETE SET NULL,
  anchor_date  date NOT NULL,   -- day 0 of the cycle for this nurse (staggers teams)
  offset_days  int  NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, pattern_id, profile_id)
);
```
Stamping: for target date `d`, `cycle_index = ((d - anchor_date) + offset_days) mod cycle_days`; shift = `day_plan[cycle_index]`. Staggering `anchor_date`/`offset` across nurses spreads coverage so not everyone is off the same day.

### 5.6 `duty_roster` — additive changes (Layer 4)

```sql
ALTER TABLE duty_roster
  ADD COLUMN status     text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','published')),
  ADD COLUMN source     text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','copy_forward','pattern','auto_fill')),
  ADD COLUMN created_by uuid REFERENCES profiles(id);
-- prevent double-booking a nurse in the same shift/day
CREATE UNIQUE INDEX ux_duty_roster_nurse_shift_day
  ON duty_roster (tenant_id, profile_id, date, shift);
```
Existing rows default to `published/manual` — backward compatible.

---

## 6. Roster Generation Engine (patterns + coverage)

A server action `generateRoster({ wardId, startDate, endDate, patternId? })`:

1. **Seed** — if `patternId`: stamp the pattern per member across the range. Else if a prior week exists: **copy-forward** it. Else: empty draft.
2. **Exclude unavailable** — drop any assignment where an `approved` leave overlaps that date.
3. **Coverage pass** — for each (ward, date, shift): compute `required` from census × ratio; count assigned; if short, **auto-fill** from the *available pool* (nurses not on leave, not already assigned that day, belonging to the ward or a float pool), ranked by fewest shifts that week (fairness).
4. **Flag gaps** — any shift still under `required` is marked and shown red; the in-charge fills manually.
5. **Save as `draft`** — nothing goes live until the in-charge **publishes**.

Everything is deterministic and explainable (no black-box solver): each cell shows *why* a nurse is there (`pattern` / `copy` / `auto` / `manual`).

---

## 7. The Assignment Picker (Layer 6 — the original ask)

Replaces the native `<select>` in `NursingPanel.tsx`. For a given admission + date:

- **Roster-aware default list**: nurses **rostered to this ward + shift today** (from `duty_roster`), present in `staff_attendance`, and **not on leave** — usually 3–8 people, not 100.
- **Search box**: type-ahead by name across all nurses (escape hatch when you must pick someone off-roster).
- **Load chip per nurse**: `assigned patients / capacity` from `admission_nurse_assignments` for that shift/date. Over-capacity → warning color (user confirmed: show load + warn over capacity).
- **Coverage banner**: "This shift needs 5 nurses, 4 rostered" when short.
- Off-roster picks are allowed but visually flagged ("not rostered today").

Uses configurable shift codes, not hardcoded `morning|night`.

---

## 8. Phased Delivery Plan

| Phase | Deliverable | Schema? | Value |
|---|---|---|---|
| **0** | Assignment picker: searchable + roster-aware + load/capacity chips (reads existing `duty_roster`/`staff_attendance`) | No | Immediate relief for the 100-nurse struggle; works with today's manual rosters |
| **1** | `shift_definitions` (+ seed & reconcile the shift CHECK inconsistency) · weekly **roster grid** (manual + copy-forward) · `leave_requests` · `ward_incharges` · `duty_roster` status/source/unique | Yes | Real rostering foundation + leave workflow |
| **2** | `ward_coverage_rules` · coverage computation from census · **auto-fill** · gap flags · draft→publish lifecycle | Yes | The "automated way" (coverage) |
| **3** | `roster_patterns` cyclic templates · fairness in auto-fill · same-day **"find replacement"** flow · optional `leave_balances` | Yes | Patterns + resilience/polish |

Each phase ships independently and leaves the app in a working state.

---

## 9. Open Decisions (to confirm before Phase 1)

1. **Ward in-charge vs. admin-only** — do we introduce the `ward_incharges` delegation now, or keep roster editing admin-only until a tenant actually has many wards? (Recommend: table now, UI toggle later.)
2. **Shift model** — do target hospitals run 3×8h, 2×12h, or a mix? Affects default `shift_definitions` seed.
3. **Leave approval authority** — ward in-charge, admin, or both?
4. **Float pool** — model as a special ward, or a boolean on `staff_profiles`? (Recommend: a nullable `home_ward_id` + `is_float` on `staff_profiles`.)
5. **Backfill for same-day sick** — is OT/agency staffing in scope, or only internal reassignment for now?

---

## 10. Non-Goals

- Payroll / shift-differential pay calculation.
- Full ILP/constraint-solver optimization.
- Biometric attendance hardware integration (attendance stays manual/API).
- Doctor/OT rostering (this module is nursing-first; the schema generalizes later).
