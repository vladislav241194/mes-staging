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
- frozen backend contract guard, isolation, independent bundle and full lab budgets pass.

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
The production host is now integrated but remains disabled by default. It mounts
only when all of these conditions are true:

- `MES_REACT_STRUCTURE_EMPLOYEES=1`;
- `MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION=1`;
- the authenticated session explicitly requests
  `react-structure-employees-evaluation=1`;
- the current System Domains payload was hydrated from the PostgreSQL API;
- the session is read-only evaluation rather than editor access.

Localhost QA can use `qa-auth-bypass=1`, `react-structure-employees=1`, and
`react-structure-employees-readonly=1`. These URL overrides are rejected on
non-local hosts.

Production-shell command:

```sh
npm run qa:structure-employees-react-island
```

Result:

- the same canonical PostgreSQL-shaped response produces `76` legacy rows and
  `76` React rows with identical visible values and order;
- server flags without a per-session request preserve the legacy renderer;
- selection, detail, seven registry entries, six metrics and page overflow pass;
- create remains disabled and the disposable `0600` state file remains byte-for-byte
  unchanged;
- requesting `Подразделения` unmounts React and opens the exact legacy registry
  with `19` rows;
- the browser console is clean;
- latest local production-shell commit was `17.40 ms`, below the `2000 ms` local
  gate;
- the independent artifact is `204,788 B` raw / `64,411 B` gzip /
  `61,098 B` Brotli, within its `225,000 B` raw / `68,000 B` gzip budget.

The test intercepts only the exact read-only `GET /api/v1/system-domains` with
one canonical generated response. This is deliberate: after the PostgreSQL
cutover the local server correctly fails closed without `DATABASE_URL`, and the
QA must not restore shared state as working authority.

The island has not been activated or released on Pilot. Authenticated Pilot
comparison and rollback proof remain downstream of the first Nomenclature live
evaluation, so the active `v.1.499.72-6985693` release and its false React flags
are unchanged.
