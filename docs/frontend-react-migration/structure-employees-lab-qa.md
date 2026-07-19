# Structure Employees React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

## Scope

Standalone read scenario plus a local-only PostgreSQL command evaluation:

`open Structure and Employees -> open Employees registry -> select employee -> inspect primary employment assignment -> create/edit employee and primary assignment`.

The target is the canonical `productionStructureMatrix` System Domains module,
not the older `employees` hierarchy visualization. The React adapter consumes
only a snapshot of canonical registries. The UI never owns persistence: its
create/edit command delegates to the existing compound System Domains owner.
Archive remains legacy-only.

## Domain boundary

The scenario joins these existing canonical registries without changing them:

- `employees`: identity, full name, personnel number, active/archive state;
- `employmentAssignments`: primary position, organization unit, work center,
  validity dates;
- `positions`, `orgUnits`, and `workCenters`: visible reference labels;
- `equipment` and `responsibilityPolicies`: summary/sidebar counts only.

Other Structure registries continue through `unsupported-scope` to legacy.
Normal editor access still receives `write-parity-incomplete`; only the
localhost-only `react-structure-employees-write=1` gate admits the command QA.

## Command boundary

The writable slice covers employee full name, personnel number and active flag,
plus one primary assignment. Position and organization unit are required; work
center and validity dates are optional.

The host rechecks the local write gate, PostgreSQL read readiness, server command
capability, the `production-structure` surface and
`productionStructureMatrix:edit` RBAC before dispatch. Reference IDs are checked
against the current projection. The owner validates the complete candidate,
refreshes the current revision, compares the exact compatibility projection and
uses `PUT /api/v1/system-domains` with `If-Match` and an idempotency key. Existing
employee and assignment fields that are not exposed by the form are preserved.

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
- read-only create remains disabled;
- the local write evaluation creates one employee and primary assignment,
  receives the authoritative `77`-row projection, then edits the same employee;
- one forced revision conflict is shown in the editor, performs no mutation and
  succeeds on explicit retry;
- every command carries the `production-structure` surface, matching `If-Match`
  revision and a non-empty idempotency key;
- references and hidden employee/assignment fields survive create/edit;
- legacy reads back all `77` rows and the disposable `0600` compatibility
  snapshot remains byte-for-byte unchanged;
- requesting `Подразделения` unmounts React and opens the exact legacy registry
  with `19` rows;
- the browser console is clean;
- latest local production-shell commit was `23.10 ms`, below the `2000 ms` local
  gate;
- the independent artifact is `216,825 B` raw / `65,878 B` gzip, within its
  `225,000 B` raw / `68,000 B` gzip budget; the full lab remains
  `473,819 B / 110,521 B` under `475,000 B / 118,000 B`.

The test uses a disposable, stateful System Domains API double for exact
capabilities, `GET` and revision-checked `PUT` behavior. It installs the same
root-cutover tombstone observed by a PostgreSQL-primary browser, never connects
to Pilot, and never writes real data or restores shared state as authority.

## Pilot acceptance

The production host shipped disabled by default in release
`v.1.499.73-b1b77cf`. On 2026-07-19, an authenticated read-only session was
evaluated behind the two server flags and the explicit session query.

- all `76` PostgreSQL-backed rows matched legacy in order and in the four read
  fields;
- the seven registry counts and six summary metrics matched;
- selection and the assignment passport worked;
- first React commit was `31.50 ms`;
- `Новая запись` was disabled;
- the unsupported `Подразделения` scope returned to the exact `19`-row legacy
  registry;
- deactivation restored the unchanged `76`-row legacy Employees view even
  when the session retained the evaluation query.

The rollout flags are off and the temporary root rollout directory has been
removed. No Pilot data was written. Pilot acceptance still covers only the
non-empty read slice; local create/edit completion does not authorize Pilot
writes, archive or delete.
