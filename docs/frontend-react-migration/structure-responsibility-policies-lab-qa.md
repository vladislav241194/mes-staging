# Structure Responsibility Policies React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read vertical scenario: `open Structure and Employees -> Responsibility Policies -> select a policy -> inspect its passport`.

The minimal functional-QA migration fixture has an empty registry. Empty-state behavior is covered directly;
the non-empty production-shell parity check uses one valid policy only inside a
  temporary `0600` QA snapshot and never writes Pilot or repository data. The
  full domain baseline independently reports one responsibility policy.

Local-only command scenario:

`create manual policy -> reject duplicate master -> switch to all -> conflict -> retry -> read through legacy`.

React edits only the canonical master/mode/manual-target contract. Existing
operational runtime remains responsible for calculating the assignable employee
set used by the Workshop.

## Evidence

- invalid containers and policies without stable ID/subject fail closed;
- four legacy cells, employee-name formatting and order match React literally;
- selection/passport, seven links, six metrics, Employees fallback, unchanged
  temporary state and clean console pass;
- all five prior Structure registry regressions remain exact;
- a second policy preserves two deterministic manual employee IDs;
- a duplicate master is rejected before any PUT;
- switching to `all` retains manual targets for a later mode change;
- conflict does not mutate the revision and retry advances it exactly once;
- hidden server fields survive edit and legacy reads back both policies;
- latest non-empty local first commit was `32.00 ms`.

The production artifact is `215,212 B` raw / `65,557 B` gzip, below the
`225,000 B / 68,000 B` gate. Separate read adapters keep the aggregate lab at
`474,438 B / 110,702 B`, below its unchanged budget. Read and write remain false
by default; the command slice has not been released or activated on Pilot.
