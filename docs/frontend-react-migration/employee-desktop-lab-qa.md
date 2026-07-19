# Employee Desktop React lab QA

Date: 2026-07-19
Status: production-integrated read-only proof; disabled by default; no Pilot activation

## Vertical scenario

`Open employee desktop -> inspect assigned tasks -> select a task -> read route
and plan/fact coverage.`

The typed adapter consumes the completed `getAuthSessionPrototypeModel()`
result. It does not read authentication state, PostgreSQL, shared state or
Shift Execution repositories directly.

## Command boundary

- local task selection stays inside React;
- person switching returns to legacy;
- start, fact, Report, route, structure and PDF scopes return to legacy;
- fact drafts, keypad input, photos and save commands remain legacy-owned.

## Evidence

`npm run qa:employee-desktop-react-lab` passes:

- 101 typed sources and the frozen-backend guard;
- three assigned tasks and seven summary/detail metrics;
- six explicit legacy command scopes;
- local task selection and payload revision `1 -> 2`;
- fact fallback, disabled flag, no overflow and clean console;
- independent entry `206,267 B` raw / `63,641 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-scenario lab `411,663 B / 99,501 B` under its development-only
  `420,000 B / 111,000 B` budget;
- shared lab CSS `11,026 B / 2,435 B` under its development-only
  `12,000 B / 3,500 B` budget.

## Production integration

The production host is disabled by default and requires both runtime
permissions, PostgreSQL System Domains, a complete current Shift Execution
scope and an explicit read-only session request. A direct Employee Desktop
entry now hydrates the complete Planning PostgreSQL graph before deriving the
bounded dispatch scope; it no longer depends on the retired shared-state graph.

Production-shell QA proves one identical task in legacy and React, seven React
metrics, a first local commit below `50 ms`, exact fact fallback, zero Shift
Execution writes, unchanged `0600` test state and a clean console. The bundled
artifact is `202,416 B` raw / `63,416 B` gzip / `54,553 B` Brotli. Pilot remains
unchanged.
