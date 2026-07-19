# Employee Desktop React lab QA

Date: 2026-07-19
Status: production-integrated task-start and fact proof; disabled by default; no Pilot activation

## Vertical scenario

`Open employee desktop -> select an available task -> take it into work ->
enter quantities -> pass deviation validation -> save -> read back the owner state.`

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
- Report, route, structure and PDF scopes return to legacy; photos, problem
  reports and their save command remain legacy-owned.

## Evidence

`npm run qa:employee-desktop-react-lab` passes:

- 129 typed sources and the frozen-backend guard;
- three assigned tasks and seven summary/detail metrics;
- local task selection, task start, fact save/read-back and payload revision
  `1 -> 4`;
- remaining explicit legacy fallback scopes including Report and person switching;
- deviation guard, disabled flag, no overflow and clean console;
- independent entry `212,773 B` raw / `64,935 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-four-scenario lab `517,773 B / 118,951 B` under its
  development-only `518,000 B / 125,000 B` budget;
- shared lab CSS `23,604 B / 4,532 B` under its development-only
  `23,750 B / 4,600 B` budget.

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
The first local commit was `32.20 ms`, below the `2,000 ms` production-shell
gate. The bundled artifact is `206,618 B` raw / `64,528 B` gzip / `55,645 B`
Brotli. Pilot remains unchanged.
