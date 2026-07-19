# Planning Workbench React migration QA

Date: 2026-07-19
Status: authenticated Pilot read-only acceptance complete; evaluation disabled, quantity writes remain local-only

## Vertical scenario

`Open Work Orders -> select an order -> change its quantity -> survive a revision conflict -> refresh authoritative slots -> read the same quantity through legacy.`

The legacy Planning Workbench now exposes `getPlanningWorkbenchModel()` as a
completed presentation read-model. It owns PostgreSQL list/detail projection,
snapshot fallback, selection, readiness, labor and structure calculations.
React accepts only that result; it does not read planning state, call an API or
reproduce Gantt calculations.

## Evidence

- three work orders retain queue order, status and active selection;
- five readiness metrics preserve composition, transfer, revision, Gantt and
  shift state;
- four visible object/operation rows retain five columns and hierarchy level;
- payload revision `1 -> 2` changes Gantt readiness without remounting;
- route and tree-item selection stay inside React and update only host-owned UI
  selection; navigation itself does not mutate domain data;
- quantity is the only React-owned write scope and is delegated to the existing
  revision-checked Planning command owner;
- invalid input is rejected before PATCH, a forced `409` does not mutate data,
  and retry advances exactly one PostgreSQL revision;
- the refreshed authoritative slot retains the recalculated quantity and end
  time, React remains mounted, legacy reads the same value, and the compatibility
  snapshot stays unchanged;
- disabled activation restores the lab legacy fallback;
- page overflow and browser console remain clean;
- independent minified entry: `206,952 B` raw / `64,065 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:planning-workbench-react-lab
```

The production host requires two false-by-default server permissions, a
completed PostgreSQL list/detail bootstrap and an explicit session request.
Production-shell QA proves parity for two work orders, five readiness metrics
and two visible hierarchy rows; the latest first commit remained below `200 ms`.
Route and row selection stay mounted in React. A localhost-only write gate
changes quantity `80 -> 96` through PATCH, exposes one forced conflict, retries
with the refreshed revision, reloads the authoritative slot and reads `96`
through legacy without touching the compatibility snapshot. Date, labor,
Gantt and cancel actions remain legacy. The console is clean.
The bundled production artifact is `203,294 B` raw / `63,828 B` gzip /
`54,880 B` Brotli.

Production command:

```sh
npm run qa:planning-workbench-react-island
```

Pilot read-only acceptance is complete. Pilot quantity acceptance is a
separate gate; start-date, labor settings, send-to-Gantt, cancellation and all
other commands remain legacy.

## Planning Workbench Pilot checkpoint

Release `v.1.499.95-2c7dc1c` from upstream commit `2c7dc1c` is active on Pilot.
Its source digest is
`245e0e7f7cea2ac77e285b00b4cd4841e081279b4f3df9414b412af1d1df1460`
and its dist digest is
`f82a5f134ea55e5c83612712daaf98cfad8fc6d5eb2a64960c2ae2b8d626c321`.
The `.94` evaluation exposed one warm-cache lifecycle defect: after normal
authentication into Gantt, navigation to Planning restored the canonical
order from the PostgreSQL cache but skipped the final render because the
payload itself was unchanged. `.95` renders when either the payload or the
canonical selection changes, and production QA now reproduces the exact
module-away/module-back path.

Authenticated live acceptance then reached React `ready` through the normal
`Gantt -> Modules -> Work orders` flow. React matched two live work orders,
five readiness metrics and 88 hierarchy rows, with a `482.4 ms` first commit.
Desktop rendered two module columns, one workspace column, five KPI columns and
18 px panels without page overflow. The compact viewport rendered one module
column, two sidebar columns and two KPI columns without page overflow. Selecting
the second 1,000-unit order stayed inside React and retained all 88 rows. The
only visible domain command, `Send to planning`, remained disabled; no write
was invoked.

The root-only evaluation drop-in was removed after acceptance. A fresh
authorized session with the evaluation query retained proved zero React
targets and the exact legacy projection: two work orders, 88 rows and active
route `r2-eb5260e9`. The active immutable release remains `.95`; only its
false-by-default runtime permission was removed.
