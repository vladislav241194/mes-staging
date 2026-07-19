# Shift Master Board React lab QA

Date: 2026-07-19
Status: production-integrated assignment island; disabled by default; no Pilot activation

## Vertical scenario

`Open Workshop -> inspect shift lanes -> select a task -> switch board focus ->
distribute a bounded quantity between eligible executors -> read the assignment back.`

The typed adapter consumes the completed `getShiftMasterBoardModel()` result.
It does not read PostgreSQL, shared state, Shift Execution repositories or the
legacy DOM directly.

## Command boundary

- local card selection stays inside the React island;
- all four focus controls stay inside React, but the host owner normalizes the
  focus and rebuilds rows, lanes, selection and KPIs;
- a localhost-only write evaluation opens the shared `ModalOverlay`, validates
  integer quantities and prevents the executor total from exceeding the task plan;
- React sends one typed `save-assignment` command; the host rechecks RBAC,
  access-matrix membership, Timesheet availability, duplicates and quantity bounds;
- the existing Shift Execution owner performs the PostgreSQL command and refresh,
  then React reads the canonical assignment back;
- read-only evaluation still returns assignment to legacy; date/master changes,
  fact, carryover, transfer and print remain legacy;
- no storage handle or API client crosses the island boundary.

## Evidence

`npm run qa:shift-master-board-react-lab` passes:

- 130 typed sources and the frozen-backend guard;
- three canonical lanes and four task cards;
- seven plan/allocation/fact/detail metrics;
- local selection, payload revision and owner-backed focus `Все -> Незакрытые`;
- focus reduces the lab board from four to three cards and preserves all three
  lanes; a zero-row production focus keeps the toolbar available so the user
  can return to `Все`;
- two-executor assignment `80 + 40 = 120`, owner-backed revision `1 -> 4`,
  fact fallback, disabled flag, no page overflow and clean console;
- independent entry `213,608 B` raw / `65,640 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-four-scenario lab `536,188 B / 122,764 B` under its development-only
  `537,000 B / 126,000 B` budget;
- shared lab CSS `28,699 B / 5,207 B` under its development-only
  `28,900 B / 5,250 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
three lanes and one PostgreSQL-backed task card on both renderers, read-only
assignment fallback, owner-backed focus `Все -> empty Незакрытые -> Все`, then
one write-evaluation assignment and canonical read-back. The test intercepts
exactly one Shift Execution write, leaves the 0600 fixture unchanged and keeps a
clean console. First commit is `26.50 ms`; the production bundle is `208,190 B`
raw / `65,231 B` gzip / `56,256 B` Brotli. Pilot remains unchanged.

## Known legacy-fixture debt

`npm run qa:shift-master-board` currently stops before its mutation assertions:
the isolated Specifications 2.0 card receives `0` access-matrix employees and
`0` Timesheet-available employees after PostgreSQL System Domains hydration.
The failure is upstream of both the React form and the assignment owner. The
dedicated server command/bridge/outbox/carryover suites, React production shell
and 26-module smoke pass; the legacy fixture still needs a PostgreSQL-primary
employee/schedule seed rather than a weakened assertion.
