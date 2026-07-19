# Structure Responsibility Policies React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario: `open Structure and Employees -> Responsibility Policies -> select a policy -> inspect its passport`.

The minimal functional-QA migration fixture has an empty registry. Empty-state behavior is covered directly;
the non-empty production-shell parity check uses one valid policy only inside a
  temporary `0600` QA snapshot and never writes Pilot or repository data. The
  full domain baseline independently reports one responsibility policy.

## Evidence

- invalid containers and policies without stable ID/subject fail closed;
- four legacy cells, employee-name formatting and order match React literally;
- selection/passport, seven links, six metrics, Employees fallback, unchanged
  temporary state and clean console pass;
- all five prior Structure registry regressions remain exact;
- latest non-empty local first commit was `17.2 ms`.

The independent entry is `210,082 B` raw / `64,604 B` gzip. The production
artifact is `204,254 B` raw / `64,244 B` gzip / `55,365 B` Brotli. It remains
false by default and has not been released or activated on Pilot.
