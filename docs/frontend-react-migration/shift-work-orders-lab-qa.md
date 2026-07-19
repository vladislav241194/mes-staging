# Shift Work Orders React migration QA

Date: 2026-07-19
Status: production-integrated read-only island; disabled by default; no Pilot activation

## Vertical scenario

`Open Shift Journal -> inspect document tree -> select an assignment -> read
quantity, transfer and executor detail.`

The boundary consumes the existing completed
`getShiftWorkOrderJournalViewModel()` result. It does not read PostgreSQL,
shared state or Shift Execution repositories directly.

## Command boundary

- assignment and fact commands;
- React implementation of print preview, work-order package, issue-photo viewer
  or Workshop navigation; each action returns to the unchanged legacy runtime;
- any Shift Execution authority, API or repository change.

Those scopes return to legacy through the common feature gate.

## Evidence

`npm run qa:shift-work-orders-react-island` and
`npm run qa:shift-work-orders-react-lab` pass:

- 93 typed sources and frozen-backend guard;
- two work orders, three operations, three assignments and eight columns;
- eight selected-detail metrics, executor and transfer projection;
- mouse selection, operation collapse and payload revision `1 -> 2`;
- command fallback, disabled flag, no page overflow and clean console;
- independent minified entry `213,306 B` raw / `65,184 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full eighteen-scenario lab `385,945 B / 95,275 B` under its development-only
  `390,000 B / 105,000 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
one PostgreSQL-backed work order/operation/assignment, identical eight-column
tree density, print fallback, zero Shift Execution writes, unchanged 0600 test
state and a clean console. The production bundle is `208,178 B` raw /
`64,883 B` gzip / `55,856 B` Brotli. Pilot remains unchanged.
