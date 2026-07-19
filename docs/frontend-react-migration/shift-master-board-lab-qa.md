# Shift Master Board React lab QA

Date: 2026-07-19
Status: production-integrated read-only island; disabled by default; no Pilot activation

## Vertical scenario

`Open Workshop -> inspect shift lanes -> select a task -> switch board focus ->
read owner-filtered allocation, fact and executor coverage.`

The typed adapter consumes the completed `getShiftMasterBoardModel()` result.
It does not read PostgreSQL, shared state, Shift Execution repositories or the
legacy DOM directly.

## Command boundary

- local card selection stays inside the React island;
- all four focus controls stay inside React, but the host owner normalizes the
  focus and rebuilds rows, lanes, selection and KPIs;
- date and master changes return to legacy;
- assignment, fact, carryover, transfer and print actions return to legacy;
- no command callback, storage handle or API client crosses the island boundary.

## Evidence

`npm run qa:shift-master-board-react-lab` passes:

- 97 typed sources and the frozen-backend guard;
- three canonical lanes and four task cards;
- seven plan/allocation/fact/detail metrics;
- local selection, payload revision and owner-backed focus `Все -> Незакрытые`;
- focus reduces the lab board from four to three cards and preserves all three
  lanes; a zero-row production focus keeps the toolbar available so the user
  can return to `Все`;
- assignment fallback, disabled flag, no page overflow and clean console;
- independent entry `207,434 B` raw / `64,044 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-four-scenario lab `502,398 B / 116,007 B` under its development-only
  `505,000 B / 122,000 B` budget;
- shared lab CSS `19,470 B / 3,912 B` under its development-only
  `19,500 B / 4,000 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
three lanes and one PostgreSQL-backed task card on both renderers, assignment
fallback, owner-backed focus `Все -> empty Незакрытые -> Все`, zero Shift
Execution writes, unchanged 0600 test state and a clean console. The production
bundle is `203,459 B` raw / `63,786 B` gzip / `54,849 B` Brotli. Pilot remains
unchanged.
