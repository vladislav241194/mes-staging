# Shift Master Board React lab QA

Date: 2026-07-19
Status: isolated read-only proof; no production host or Pilot activation

## Vertical scenario

`Open Workshop -> inspect shift lanes -> select a task -> read allocation,
fact and executor coverage.`

The typed adapter consumes the completed `getShiftMasterBoardModel()` result.
It does not read PostgreSQL, shared state, Shift Execution repositories or the
legacy DOM directly.

## Command boundary

- local card selection stays inside the React island;
- date, focus and master changes return to legacy;
- assignment, fact, carryover, transfer and print actions return to legacy;
- no command callback, storage handle or API client crosses the island boundary.

## Evidence

`npm run qa:shift-master-board-react-lab` passes:

- 97 typed sources and the frozen-backend guard;
- four canonical lanes and four task cards;
- seven plan/allocation/fact/detail metrics;
- local selection and payload revision `1 -> 2`;
- assignment fallback, disabled flag, no page overflow and clean console;
- independent entry `206,411 B` raw / `63,788 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full nineteen-scenario lab `399,691 B / 97,623 B` under its development-only
  `405,000 B / 108,000 B` budget;
- shared lab CSS `8,900 B / 2,171 B` under its development-only
  `9,500 B / 2,800 B` budget.

Production integration remains a separate default-off gate. It must consume
the same PostgreSQL-backed runtime model and prove identical lane/card density
before any authenticated evaluation is proposed.
