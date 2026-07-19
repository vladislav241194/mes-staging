# Employee Desktop React lab QA

Date: 2026-07-19
Status: isolated read-only proof; no production host or Pilot activation

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
- five explicit legacy command scopes;
- local task selection and payload revision `1 -> 2`;
- fact fallback, disabled flag, no overflow and clean console;
- independent entry `206,128 B` raw / `63,621 B` gzip under the unchanged
  `225,000 B / 68,000 B` production-entry budget;
- full twenty-scenario lab `411,525 B / 99,478 B` under its development-only
  `420,000 B / 111,000 B` budget;
- shared lab CSS `11,026 B / 2,435 B` under its development-only
  `12,000 B / 3,500 B` budget.

Production integration remains a separate default-off gate. It must prove the
same PostgreSQL assignment/fact projection and exact fallback into the legacy
fact and modal scopes.
