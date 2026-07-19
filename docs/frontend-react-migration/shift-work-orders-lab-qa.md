# Shift Work Orders React migration QA

Date: 2026-07-19
Status: production-integrated read-only island with local attachment navigation; disabled by default; no Pilot activation

## Vertical scenario

`Open Shift Journal -> inspect document tree -> select an assignment -> read
quantity, transfer and executor detail.`

The boundary consumes the existing completed
`getShiftWorkOrderJournalViewModel()` result. It does not read PostgreSQL,
shared state or Shift Execution repositories directly.

## Command boundary

- assignment and fact commands;
- React implementation of print preview, work-order package or Workshop
  navigation; each action returns to the unchanged legacy runtime;
- any Shift Execution authority, API or repository change.

Those scopes return to legacy through the common feature gate.

## Evidence

`npm run qa:shift-work-orders-react-island` and
`npm run qa:shift-work-orders-react-lab` pass:

- 93 typed sources and frozen-backend guard;
- two work orders, three operations, three assignments and eight columns;
- eight selected-detail metrics, executor and transfer projection;
- mouse selection, operation collapse and payload revision `1 -> 2`;
- issue-photo opening, Escape close and mounted React continuity in the isolated
  lab; the viewer consumes only the already adapted report payload;
- command fallback, disabled flag, no page overflow and clean console;
- independent minified entry `215,683 B` raw / `65,711 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-four-scenario lab `476,415 B / 111,255 B` under its development-only
  `478,000 B / 118,000 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
one PostgreSQL-backed work order/operation/assignment, identical eight-column
tree density, print fallback, zero Shift Execution writes, unchanged 0600 test
state and a clean console. The production bundle is `210,253 B` raw /
`65,375 B` gzip / `56,326 B` Brotli. The production fixture has no report photo,
so attachment behavior is proven by the isolated typed-payload browser gate;
Pilot remains unchanged.
