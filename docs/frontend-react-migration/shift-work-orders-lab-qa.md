# Shift Work Orders React migration QA

Date: 2026-07-20
Status: production-integrated and Pilot-accepted read island with local owner-backed fact/correction evidence; disabled by default

## Vertical scenario

`Open Shift Journal -> inspect document tree -> select an assignment -> read
quantity, transfer and executor detail -> inspect/print SZN and work-order
package -> enter/correct fact for the exact current PostgreSQL assignment.`

The boundary consumes the existing completed
`getShiftWorkOrderJournalViewModel()` result. It does not read PostgreSQL,
shared state or Shift Execution repositories directly.

## Command boundary

- fact entry/correction is locally complete through the existing Shift
  Execution owner and only in explicit localhost write evaluation;
- assignment remains legacy;
- Workshop navigation, which returns to the unchanged legacy runtime;
- any Shift Execution authority, API or repository change.

Unsupported scopes return to legacy through the common feature gate. React
does not own persistence, RBAC, carryover reconciliation or the PostgreSQL
read model.

## Evidence

`npm run qa:shift-work-orders-react-island` and
`npm run qa:shift-work-orders-react-lab` pass:

- 133 typed sources and frozen-backend guard;
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
- the production visual gate asserts the real grid, panel, table, Report card
  and five-column transfer contract; React now supplies the two semantic-free
  connector slots and current-step marker required by the existing MES visual
  contract instead of placing a card into an 18-pixel connector column;
- independent base entry `223,677 B` raw / `67,703 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- lazy print entry `19,025 B` raw / `3,659 B` gzip under the same production-entry
  budget; the base entry is checked not to contain the print sheet;
- lazy fact editor `5,269 B` raw / `2,098 B` gzip under the same budget; the
  base entry is checked not to contain its fields, and the editor reuses the
  host island's React hooks instead of bundling a second hook runtime;
- full twenty-four-scenario lab `565,019 B / 127,686 B` under its
  development-only `566,000 B / 128,000 B` budget.

Production-shell QA proves default legacy, explicit session-only read access,
one PostgreSQL-backed work order/operation/assignment, identical eight-column
tree density, lazy SZN/package/fact chunks, two host print callbacks and zero
writes in read-only mode. In write evaluation, Escape sends no command; the
typed correction posts once to the exact assignment fact endpoint, React and
legacy both read `58 -> 59`, and cleanup posts once and restores `59 -> 58`.
No assignment/carryover endpoint is touched, the 0600 test state is byte-stable
and the console is clean. The production base bundle is `216,974 B` raw /
`67,343 B` gzip / `63,914 B` Brotli; its lazy fact bundle is `4,097 B` raw /
`1,928 B` gzip / `1,797 B` Brotli, and its lazy print bundle is `13,774 B` raw /
`3,378 B` gzip / `3,137 B` Brotli. The production fixture has no report photo,
so attachment behavior is proven by the isolated typed-payload browser gate;
Pilot remains unchanged.

Root-only activation and deactivation artifacts own an isolated
`78-react-shift-work-orders-evaluation.conf` systemd drop-in. Both procedures
fail closed, verify health plus the exact two public runtime values and restore
the prior configuration after a failed transition. Server/Pilot write
activation remains absent; the command evidence is localhost-only.

Pilot acceptance completed on immutable release `v.1.499.79-b987e90`. The
actual one-order/one-operation/one-assignment journal reached revision `1` in
`503.90 ms`; the SZN and package previews opened without invoking print. A
previous `.78` evaluation was rejected because its actions were still native
browser buttons. `.79` added the scoped action contract, passed the live visual
gate, then returned to legacy with zero React targets and the same assignment.
No Pilot data was written.
