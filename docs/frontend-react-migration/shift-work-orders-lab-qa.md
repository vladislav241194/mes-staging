# Shift Work Orders React lab QA

Date: 2026-07-19
Status: isolated read-only proof; no Pilot activation

## Vertical scenario

`Open Shift Journal -> inspect document tree -> select an assignment -> read
quantity, transfer and executor detail.`

The boundary consumes the existing completed
`getShiftWorkOrderJournalViewModel()` result. It does not read PostgreSQL,
shared state or Shift Execution repositories directly.

## Explicit non-scope

- assignment and fact commands;
- print preview and browser print;
- work-order package generation;
- issue-photo viewer;
- navigation into Workshop;
- any Shift Execution authority, API or repository change.

Those scopes return to legacy through the common feature gate.

## Evidence

`npm run qa:shift-work-orders-react-lab` passes:

- 93 typed sources and frozen-backend guard;
- two work orders, three operations, three assignments and eight columns;
- eight selected-detail metrics, executor and transfer projection;
- mouse selection, operation collapse and payload revision `1 -> 2`;
- command fallback, disabled flag, no page overflow and clean console;
- independent bundle `210,824 B` raw / `64,526 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full eighteen-scenario lab `382,793 B / 94,415 B` under its development-only
  `390,000 B / 105,000 B` budget.

Production integration requires a separate default-off host, same-model legacy
comparison, exact fallback for print/photo/Workshop scopes and regression QA.
