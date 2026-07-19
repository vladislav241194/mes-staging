# Employee Desktop React lab QA

Date: 2026-07-19
Status: production-integrated task-start, fact and photo Report proof; disabled by default; no Pilot activation

## Vertical scenario

`Open employee desktop -> select an available task -> take it into work ->
enter quantities -> pass deviation validation -> save -> read back the owner state.`

The adjacent Report continuation is `open Report -> add text/photo -> let the
legacy owner prepare the image -> save once -> read back journal counters`.

The typed adapter consumes the completed `getAuthSessionPrototypeModel()`
result. It does not read authentication state, PostgreSQL, shared state or
Shift Execution repositories directly.

## Command boundary

- local task selection stays inside React;
- person switching returns to legacy;
- task start stays in React only behind an explicit localhost write evaluation
  and invokes the existing `startAuthSessionTask` owner;
- fact quantities and the deviation comment are React form state; the typed
  `save-fact` command contains only the visible task ID and normalized values;
- the host revalidates task state, authenticated ownership, quantity bounds,
  defect balance and the five-percent deviation rule before invoking the
  existing `saveAuthSessionTaskFact` aggregation owner;
- Report text/photo form state is React-owned, while `prepareAuthSessionReportPhoto`
  keeps resize/compression rules and `saveAuthSessionTaskReport` keeps report
  identity, the eight-record journal limit and persistence;
- the Report journal currently remains compatibility UI-state, not a
  PostgreSQL-backed domain; this frontend slice deliberately does not invent a
  second API or change that authority;
- Structure, Route and PDF instruction now render from the same typed task
  payload inside the shared React `ModalOverlay`; no host command or data write
  is added for these read-only views;
- person switching remains the explicit legacy rollback scope.

## Evidence

`npm run qa:employee-desktop-react-lab` passes:

- 130 typed sources and the frozen-backend guard;
- three assigned tasks and seven summary/detail metrics;
- local task selection, task start, fact save/read-back, owner-prepared photo,
  Report journal read-back and payload revision `1 -> 5`;
- Structure/Route/PDF parity, Tab focus containment, Escape/focus restoration,
  button/backdrop close and person-switching rollback;
- deviation guard, disabled flag, no overflow and clean console;
- independent entry `224,501 B` raw / `67,206 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-four-scenario lab `530,153 B / 121,544 B` under its
  development-only `531,000 B / 125,000 B` budget;
- shared lab CSS `27,677 B / 5,096 B` under its development-only
  `27,900 B / 5,150 B` budget.

## Production integration

The production host is disabled by default and requires both runtime
permissions, PostgreSQL System Domains, a complete current Shift Execution
scope and an explicit read-only session request. A direct Employee Desktop
entry now hydrates the complete Planning PostgreSQL graph before deriving the
bounded dispatch scope; it no longer depends on the retired shared-state graph.

Production-shell QA proves one identical task in legacy and React, seven React
metrics, read-only denial, one owner-backed transition to `В работе`, disabled
repeat, deviation validation, exactly one PostgreSQL Shift Execution fact
command, owner-model read-back, unchanged `0600` test state and a clean console.
The same gate prepares one image through the legacy owner, persists one Report,
reads back `1 запись / 1 фото` and proves no additional Shift Execution command.
It also opens Structure, Route and PDF in React without a write and verifies
the shared modal keyboard/close contract. The first local commit was `30.20 ms`,
below the `2,000 ms` production-shell gate. The bundled artifact is `214,902 B`
raw / `66,681 B` gzip / `57,535 B` Brotli. Pilot remains unchanged.
