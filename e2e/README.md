# Uyirly end-to-end suite

Clicks through the live app in a real Chrome, as hospital staff would —
front desk, doctor, nurse, lab, pharmacy, accounts, HR, admin. Nothing is
written to the database by the suite itself; every record comes from the
screens. Built from the browser test run of 12 Nov 2026.

It only runs against a **test hospital** (`demo.uyirly.com` by default). It
refuses any host or tenant containing `karur`, and any other non-demo host
unless you name it in `E2E_ALLOW_HOST`.

## Set up once

1. `npm install` (brings `playwright-core`; the suite drives your installed Google Chrome — no browser download).
   Checks on printed PDFs read their text with Python's `pypdf` (`pip3 install pypdf`).
2. Copy `e2e/.env.e2e.example` to `e2e/.env.e2e`, or run
   `npm run e2e:accounts` — it creates (or resets) the 8 test staff accounts
   on the demo hospital with fresh passwords and writes them into
   `e2e/.env.e2e`. It reads the service key from the app's `.env.local` at run
   time and never copies it. `e2e/.env.e2e` is git-ignored.

## Run

```bash
npm run e2e                                  # every flow (≈ 2 hours)
npm run e2e -- front-desk opd                # only these flows, new run
npm run e2e -- --list                        # flow names
npm run e2e -- --run run-202611121530 icu    # continue a run (reuses its patients)
npm run e2e -- --run run-202611121530 --from discharge
npm run e2e:report                           # rebuild the latest report
npm run e2e:typecheck
```

To check changes before they are deployed, run the app locally and point the
suite at it — still the demo hospital, on the live database:

```bash
npx next build && npx next start -p 3000
E2E_BASE_URL=http://demo.localhost:3000 npm run e2e -- front-desk opd
```

Each run writes `e2e/results/<run>/`: `checks.json`, `ctx.json` (patients,
admissions and URLs the flows passed along), `shots/`, `prints/` (every PDF
the run printed) and `report.html`. Results are git-ignored.

A full run starts with `cleanup`: test patients an earlier, unfinished run
left admitted are discharged as absconded, so their beds are free again. Only
the suite's own "E2E … R<tag>" patients from other runs are touched.

Flows run in order because later ones use what earlier ones made:
front-desk registers the patients, OPD admits Lakshmi, emergency admits the
unknown ICU patient, and so on. Run a single later flow with `--run` pointing
at a run that already has those patients.

## Reading the report

- **pass / fail** — what the screen did against what a hospital needs.
- Checks tagged **BUG-0xx** guard a bug from `known-bugs.json` (found 12 Nov
  2026). They fail while the bug is there and pass once it is fixed; the
  report lists each known bug as *still open*, *fixed in this run* or *not
  checked*.
- A failure with no bug tag is **new** — look at it first.
- **blocked** — the flow could not go on (an earlier step failed); the detail
  says why.

## Every run leaves test data on the demo hospital

New patients (named `E2E … R<tag>`), visits, admissions, bills, a blood unit,
an insurance claim, a temp nurse account (deactivated), a roster entry and a
leave request. That is intended — it is the test hospital. The roles grant
the HR flow switches on is switched off again.

## Layout

```
e2e/
  run.ts               runner (picks flows, makes the run folder, builds the report)
  flows/00-…18-*.ts    one file per area (00 = clean-up of earlier runs)
  lib/env.ts           settings from .env.e2e, safety guard
  lib/browser.ts       Chrome, sign-in, screenshots, saving printouts
  lib/ui.ts            finding fields by label, Uyirly's select boxes, cards
  lib/actions.ts       register, book, pay, admit, order, give a dose
  lib/people.ts        the patients a run registers
  lib/run.ts           checks and the data flows share
  lib/report.ts        report.html
  setup/accounts.ts    create / reset the test staff accounts
  known-bugs.json      the 69 bugs from 12 Nov 2026
```
