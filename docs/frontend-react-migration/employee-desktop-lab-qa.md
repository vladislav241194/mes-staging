# Employee Desktop React lab QA

Date: 2026-07-19
Status: production-integrated task-start proof; disabled by default; no Pilot activation

## Vertical scenario

`Open employee desktop -> inspect assigned tasks -> select an available task ->
take it into work -> read back the owner state.`

The typed adapter consumes the completed `getAuthSessionPrototypeModel()`
result. It does not read authentication state, PostgreSQL, shared state or
Shift Execution repositories directly.

## Command boundary

- local task selection stays inside React;
- person switching returns to legacy;
- task start stays in React only behind an explicit localhost write evaluation
  and invokes the existing `startAuthSessionTask` owner;
- fact, Report, route, structure and PDF scopes return to legacy;
- fact quantities/comments, keypad input, photos and fact/report save commands
  remain legacy-owned; React does not duplicate their rules.

## Evidence

`npm run qa:employee-desktop-react-lab` passes:

- 129 typed sources and the frozen-backend guard;
- three assigned tasks and seven summary/detail metrics;
- local task selection, task start, disabled repeat and payload revision `1 -> 3`;
- six remaining explicit legacy fallback scopes including person switching;
- fact fallback, disabled flag, no overflow and clean console;
- independent entry `207,932 B` raw / `64,056 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-four-scenario lab `504,778 B / 116,494 B` under its
  development-only `505,000 B / 122,000 B` budget;
- shared lab CSS `19,470 B / 3,912 B` under its development-only
  `19,500 B / 4,000 B` budget.

## Production integration

The production host is disabled by default and requires both runtime
permissions, PostgreSQL System Domains, a complete current Shift Execution
scope and an explicit read-only session request. A direct Employee Desktop
entry now hydrates the complete Planning PostgreSQL graph before deriving the
bounded dispatch scope; it no longer depends on the retired shared-state graph.

Production-shell QA proves one identical task in legacy and React, seven React
metrics, read-only denial, one owner-backed transition to `В работе`, disabled
repeat, exact fact fallback, zero Shift Execution writes, unchanged `0600` test
state and a clean console. The first local commit was `33.30 ms`, below the
`2,000 ms` production-shell gate. The bundled artifact is `203,436 B` raw /
`63,673 B` gzip / `54,892 B` Brotli. Pilot remains unchanged.
