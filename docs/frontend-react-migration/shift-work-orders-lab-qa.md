# Shift Work Orders React migration QA

Date: 2026-07-19
Status: production-integrated read-only island with local attachment and print/package previews; disabled by default; no Pilot activation

## Vertical scenario

`Open Shift Journal -> inspect document tree -> select an assignment -> read
quantity, transfer and executor detail -> inspect/print SZN and work-order
package.`

The boundary consumes the existing completed
`getShiftWorkOrderJournalViewModel()` result. It does not read PostgreSQL,
shared state or Shift Execution repositories directly.

## Command boundary

- assignment and fact commands;
- Workshop navigation, which returns to the unchanged legacy runtime;
- any Shift Execution authority, API or repository change.

Those scopes return to legacy through the common feature gate.

## Evidence

`npm run qa:shift-work-orders-react-island` and
`npm run qa:shift-work-orders-react-lab` pass:

- 129 typed sources and frozen-backend guard;
- two work orders, three operations, three assignments and eight columns;
- eight selected-detail metrics, executor and transfer projection;
- mouse selection, operation collapse and payload revision `1 -> 2`;
- issue-photo opening, Escape close and mounted React continuity in the isolated
  lab; the viewer consumes only the already adapted report payload;
- SZN and package previews stay mounted in React, close with Escape and invoke
  the supplied host print callback with the document title;
- the package adapter consumes the existing Routes owner model with two
  operations, two SZN rows and one executor; it does not reproduce calculations;
- Workshop fallback, disabled flag, no page overflow and clean console;
- independent base entry `220,036 B` raw / `66,703 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- lazy print entry `19,025 B` raw / `3,659 B` gzip under the same production-entry
  budget; the base entry is checked not to contain the print sheet;
- full twenty-four-scenario lab `502,398 B / 116,007 B` under its development-only
  `505,000 B / 122,000 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
one PostgreSQL-backed work order/operation/assignment, identical eight-column
tree density, lazy SZN and package previews, two host print callbacks, zero
Shift Execution writes, unchanged 0600 test state and a clean console. The
production base bundle is `213,696 B` raw / `66,343 B` gzip / `57,159 B`
Brotli; its lazy print bundle is `13,774 B` raw / `3,351 B` gzip / `2,890 B`
Brotli. The production fixture has no report photo, so attachment behavior is
proven by the isolated typed-payload browser gate; Pilot remains unchanged.
