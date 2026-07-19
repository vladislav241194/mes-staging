# Shift Master Board React lab QA

Date: 2026-07-19
Status: production-integrated assignment, fact and carryover-navigation island; disabled by default; no Pilot activation

## Vertical scenario

`Open Workshop -> inspect shift lanes -> select a task -> switch board focus ->
distribute a bounded quantity between eligible executors -> read the assignment
back -> record a partial shift fact -> read the canonical fact and carryover back
-> open the canonical remainder on the next shift.`

The typed adapter consumes the completed `getShiftMasterBoardModel()` result.
It does not read PostgreSQL, shared state, Shift Execution repositories or the
legacy DOM directly.

## Command boundary

- local card selection stays inside the React island;
- all four focus controls stay inside React, but the host owner normalizes the
  focus and rebuilds rows, lanes, selection and KPIs;
- a localhost-only write evaluation opens shared `ModalOverlay` forms for
  assignment and fact; both accept only bounded integer quantities;
- React sends typed `save-assignment` and `save-fact` commands; the host rechecks
  RBAC, access-matrix membership, Timesheet availability, duplicates, assignment
  bounds and `defect <= actual`;
- the existing Shift Execution owner performs the PostgreSQL command and refresh,
  then React reads the canonical assignment or fact back;
- a partial fact preserves the existing automatic carryover lifecycle without
  duplicate callbacks; a completed fact cancels an earlier canonical remainder;
- the owner supplies a typed transfer contract. React displays the remainder
  quantity/date and requests navigation, while the host validates the known
  carryover and changes the date through the existing workbench date owner;
- provisional-to-canonical reconciliation preserves selection by the durable
  `(sourceRowId, dateKey)` identity, so the next render selects the PostgreSQL ID;
- read-only evaluation still returns assignment and fact to legacy; date/master
  picker changes, manual cancellation/correction and print remain legacy;
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
- two-executor assignment `80 + 40 = 120`, partial fact `100 - 4 = 96` and
  remainder preview `24`, navigation to the next-shift carryover, owner-backed
  revision `1 -> 6`, print fallback,
  disabled flag, no page overflow and clean console;
- independent entry `220,182 B` raw / `66,864 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full aggregate lab `545,196 B / 124,379 B` under its development-only
  `546,000 B / 126,000 B` budget;
- shared lab CSS `29,860 B / 5,345 B` under its development-only
  `30,000 B / 5,350 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
three lanes and one PostgreSQL-backed task card on both renderers, read-only
assignment fallback, owner-backed focus `Все -> empty Незакрытые -> Все`, then
one write-evaluation assignment, one partial fact and one carryover with
canonical read-back. It then navigates to the next shift and selects the
canonical carryover alongside a normal next-shift production row. The test
intercepts exactly one assignment, fact and carryover write, leaves the 0600
fixture unchanged and keeps a clean console. Current first commit is `26.10 ms`;
the production bundle is `213,357 B` raw / `66,542 B` gzip / `57,264 B` Brotli.
Pilot remains unchanged.

The frozen backend still requires at least one durable source row in a dispatch
scope. A future date containing only a carryover therefore remains a legacy
fallback and needs a separate Domain API contract change outside this frontend
checkpoint; no backend/API/repository file was changed here.

## Legacy lifecycle baseline restored

`npm run qa:shift-master-board` now supplies a validated PostgreSQL-primary
System Domains projection generated from the production matrix. The fixture has
the canonical warehouse master, one manually authorized warehouse executor,
their role assignments and the standard schedule projection. The dispatch
window is seeded through the date-only UI contract before application startup.

The full legacy lifecycle passes without weakening access or Timesheet checks:
one isolated Specifications 2.0 task, one authorized and available executor,
`11 / 12` assigned, direct shift-sheet issue, transfer contract, print preview,
unauthorized-executor filtering, storage isolation and no horizontal overflow.
The React production shell, server command/bridge/outbox/carryover suites and
the 26-module smoke also pass against the restored baseline.
