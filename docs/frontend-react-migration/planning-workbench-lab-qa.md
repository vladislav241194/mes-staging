# Planning Workbench React migration QA

Date: 2026-07-19
Status: production-integrated island with React-owned navigation and local-only quantity write evaluation; disabled by default

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

It is not activated on Pilot. Pilot quantity acceptance is a separate gate;
start-date, labor settings, send-to-Gantt, cancellation and all other commands
remain legacy.
