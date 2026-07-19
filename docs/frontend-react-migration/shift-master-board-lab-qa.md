# Shift Master Board React lab QA

Date: 2026-07-19
Status: production-integrated read-only island; disabled by default; no Pilot activation

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
- three canonical lanes and four task cards;
- seven plan/allocation/fact/detail metrics;
- local selection and payload revision `1 -> 2`;
- assignment fallback, disabled flag, no page overflow and clean console;
- independent entry `206,494 B` raw / `63,796 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full nineteen-scenario lab `399,785 B / 97,638 B` under its development-only
  `405,000 B / 108,000 B` budget;
- shared lab CSS `8,842 B / 2,161 B` under its development-only
  `9,500 B / 2,800 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
three lanes and one PostgreSQL-backed task card on both renderers, assignment
fallback, zero Shift Execution writes, unchanged 0600 test state and a clean
console. The production bundle is `202,787 B` raw / `63,572 B` gzip /
`54,628 B` Brotli. Pilot remains unchanged.
