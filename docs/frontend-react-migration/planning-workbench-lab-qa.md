# Planning Workbench React migration QA

Date: 2026-07-19
Status: production-integrated read island with React-owned navigation; disabled by default

## Vertical scenario

`Open Work Orders -> inspect the queue -> select another order -> select a tree row -> inspect readiness and the object/operation tree.`

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
  selection; domain data remains read-only;
- disabled activation restores the lab legacy fallback;
- page overflow and browser console remain clean;
- independent minified entry: `205,814 B` raw / `63,743 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:planning-workbench-react-lab
```

The production host requires two false-by-default server permissions, a
completed PostgreSQL list/detail bootstrap and an explicit session request.
Production-shell QA proves parity for two work orders, five readiness metrics
and two visible hierarchy rows; the latest first commit remained below `100 ms`.
Route and row selection stay mounted in React, a subsequent legacy render reads
the same selected route, and quantity/date/labor/Gantt/cancel actions remain
disabled. The `0600` state is unchanged and the console is clean. The bundled
artifact is `202,251 B` raw / `63,500 B` gzip / `54,623 B` Brotli.

Production command:

```sh
npm run qa:planning-workbench-react-island
```

It is not activated on Pilot. Planning quantity, start-date, labor settings,
send-to-Gantt, cancellation and all other commands remain legacy.
