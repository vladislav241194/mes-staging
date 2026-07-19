# Timesheet React migration QA

Date: 2026-07-19
Status: production-integrated read island plus local-only attendance and schedule commands; disabled by default

## Vertical scenario

`Open Timesheet -> inspect the personnel calendar -> inspect attendance totals.`

The typed adapter consumes the completed `getTimesheetModel()` result. Legacy
remains authoritative for PostgreSQL hydration plus period and view selection.
React owns local-gated save/remove editors for one selected attendance day and
one employee's permanent schedule. React does not read global state or call an
API; the host delegates to the unchanged System Domains owner.

## Evidence

- two departments retain three employees in source order;
- seven ordered days produce 21 attendance cells and twelve visible columns;
- employee, planned-hours and overtime summary values survive the typed boundary;
- payload revision `1 -> 2` updates the mounted view without remounting;
- the dense table owns horizontal overflow instead of widening the page;
- read-only day/schedule plus view and period actions explicitly request the legacy route;
- a disabled feature flag restores the lab legacy fallback;
- browser console remains clean;
- independent minified entry: `214,632 B` raw / `65,508 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:timesheet-react-lab
```

This proves the read-model and dense-calendar component boundary plus bounded
one-day attendance and permanent-schedule commands. It is
wired to the MES shell only behind two false-by-default permissions, PostgreSQL
read readiness and a localhost-only write request. The production/Pilot route
remains read-only and default-off.

Production-shell QA uses the canonical 76-employee System Domains projection.
It proves exact parity across 96 table rows and 35 columns, default legacy,
direct fallback into the seven-day legacy view and existing day editor,
table-owned overflow, unchanged `0600` state and a clean console. First commit
remained below `250 ms` in repeated local runs; the bundled
artifact is `214,632 B` raw / `65,508 B` gzip; the latest first commit was
`213.50 ms`. Command QA additionally proves
validation before PUT, sick-day and alternate-schedule saves, exact legacy
read-back, revision conflict without mutation, both resets, unrelated hidden
event/assignment preservation and an unchanged `0600` compatibility snapshot.
This is local regression evidence, not authorization for Pilot writes.

The legacy `qa:timesheet` browser suite now exercises the same PostgreSQL-
primary API contract instead of expecting obsolete localStorage authority. It
proves the existing legacy attendance and permanent-schedule editors still
advance two server revisions and render the saved sick day plus `2/2` schedule.

Production command:

```sh
npm run qa:timesheet-react-island
```

## Pilot acceptance

Authenticated read-only acceptance completed on immutable release
`v.1.499.93-d062eb1`. React matched the live PostgreSQL projection exactly:
76 employees, 35 columns and 96 table rows. The first accepted commit was
`315.5 ms`; commands remained disabled. Desktop QA proved four KPI columns,
18 px production panels, one content column and table-local scrolling.
Effective `443 x 959` compact QA proved two KPI columns, the same 76 employees,
no document overflow and table-local horizontal scrolling.

The first live `.92` evaluation exposed that the Timesheet host was absent from
the shared production UI selector. The `.93` fix and automated production /
compact contract now reject that unstyled state. Requesting `Неделя` restored
the exact 76-employee, 12-column legacy view; after server deactivation the
retained evaluation query also remained in legacy. All Timesheet rollout flags
are off, health is green, and no Pilot attendance or schedule data was written.
