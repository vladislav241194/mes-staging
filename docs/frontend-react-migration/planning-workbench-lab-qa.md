# Planning Workbench React migration QA

Date: 2026-07-19
Status: isolated read-only lab; not production-integrated

## Vertical scenario

`Open Work Orders -> inspect the queue -> inspect readiness -> inspect the object/operation tree.`

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
- route and tree-item selection explicitly request legacy;
- disabled activation restores the lab legacy fallback;
- page overflow and browser console remain clean;
- independent minified entry: `205,180 B` raw / `63,549 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:planning-workbench-react-lab
```

This is not wired to the MES shell and is not activated on Pilot. Quantity,
start-date, route selection, labor settings, send-to-Gantt, cancellation and
all other commands remain legacy.
