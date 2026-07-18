# Structure Employees React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

## Scope

Standalone, read-only vertical scenario:

`open Structure and Employees -> open Employees registry -> select employee -> inspect primary employment assignment`.

The target is the canonical `productionStructureMatrix` System Domains module,
not the older `employees` hierarchy visualization. The React adapter consumes
only a snapshot of canonical registries. It does not read shared state, call an
API, persist data, or expose create/archive commands.

## Domain boundary

The scenario joins these existing canonical registries without changing them:

- `employees`: identity, full name, personnel number, active/archive state;
- `employmentAssignments`: primary position, organization unit, work center,
  validity dates;
- `positions`, `orgUnits`, and `workCenters`: visible reference labels;
- `equipment` and `responsibilityPolicies`: summary/sidebar counts only.

Other Structure registries continue through `unsupported-scope` to legacy.
Editor access receives `write-parity-incomplete` before React mounts.

## Automated evidence

Command:

```sh
node experiments/react-migration/qa.mjs
```

Result:

- 27 TypeScript/TSX sources compile;
- invalid registry containers and invalid employee rows fail closed;
- Russian three-part names use the actual legacy visible-name rule while the
  full name remains available in the detail card;
- primary employment assignment and missing-reference semantics match legacy;
- all seven registry sidebar counts match the actual legacy renderer;
- the actual four employee read columns, stable IDs, row order and values match
  the React adapter; legacy `Действие` remains explicit non-parity;
- the adapter consumes the complete generated canonical migration without
  dropping any of 76 employees;
- canonical counts are `19` organization units, `19` work centers, `49`
  positions, `76` employees, `6` equipment records and `152` diagnostic source
  rows;
- stop-list, isolation, independent bundle and full lab budgets pass.

## Browser evidence

Checked in the local in-app browser at `1280x720`:

1. The Employees registry rendered three rows and the expected seven sidebar
   counts plus six summary metrics.
2. The initial detail showed full identity and primary assignment for
   `Николаев Ирина` while the table kept the approved shortened display name.
3. Selecting archived `Петров Алексей` produced exactly one selected row,
   status `архив`, and validity `2025-05-10 — 2026-06-30`.
4. Keyboard `Enter` selected `Степанов Ирина` and kept exactly one selected row.
5. The table owned its horizontal overflow; the page itself had no horizontal
   overflow.
6. Payload update advanced revision `1 -> 2`, rendered one new employee,
   updated the employee metric to `1`, selected that employee, and measured a
   local post-commit duration of `2.90 ms`.
7. Selecting `Подразделения` produced exactly one `unsupported-scope` fallback
   and removed the React page.
8. `?scenario=structure-employees&access=editor` produced
   `write-parity-incomplete`, no React page and no commit revision.

Local timing proves telemetry only; it is not a Pilot SLA.

## Production boundary

`mountStructureEmployeesReactIsland(...)` is an independently bundled entry.
Production activation still requires the accepted host read payload, disabled-
by-default feature flag, identical-data visual comparison, authenticated Pilot
smoke and rollback proof after the required PostgreSQL final audit/rebase.
