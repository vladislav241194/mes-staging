# Frontend React Pilot readiness checkpoint

Date: 2026-07-19
Candidate branch: `codex/frontend-react-migration`
Released candidate commit: `b1b77cf`

## Read-only live evidence

The authenticated Pilot path was inspected without changing configuration or
data:

- `GET https://pilot.mes-line.ru/healthz` returned `status=ok`, version
  `v.1.499.72`, and `sharedState=ready`;
- the browser loaded `./src/app.js?v=db3bbb28f842-v.1.499.72`;
- Nomenclature rendered the legacy create action and no React mount target;
- all three Nomenclature rollout values were `false`:
  `MES_REACT_NOMENCLATURE`,
  `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION`, and
  `MES_REACT_NOMENCLATURE_WRITE_EVALUATION`;
- the live Nomenclature payload contained zero rows;
- the browser console contained no warnings or errors.

This proves a healthy unchanged baseline. It does not prove the candidate,
because commit `311fd5d` is not deployed.

## Candidate distance

`origin/main` is still the accepted PostgreSQL handoff `fc71e01`, and the
frontend candidate is a clean descendant with no new main-side divergence.
The live frontend release source recorded for `v.1.499.72` is `6985693`.
Candidate `311fd5d` is 34 commits ahead of that release source; the aggregate
diff contains 227 paths, 11,027 insertions and 346 deletions.

This is a multi-scenario candidate, not a safe one-file Pilot toggle. A release
must therefore be built and activated through the normal commit-derived,
checksummed release procedure with all React flags off first.

## Required acceptance sequence

1. Create a new visible application version and immutable release artifact from
   the exact candidate commit. Do not reuse `v.1.499.72`.
2. Deploy with every React feature and evaluation flag false. Verify health,
   loaded asset hashes, legacy module navigation, authorization, current Shift
   Execution scope and a clean console.
3. Preserve the current `v.1.499.72` artifact as the immediate rollback target.
4. Enable only one read-only island permission, then request it in one
   authenticated session. Do not enable write evaluation in the first pass.
5. Compare legacy and React on the same server projection, viewport and user.
   Record mount time, visible row/cell parity, fallback and console evidence.
6. Disable the permission and verify legacy restoration before moving to the
   next island.
7. Evaluate Nomenclature create/edit only after a non-production disposable
   record or an explicitly approved real record is available. The current live
   Nomenclature store is empty, so a non-empty or write-parity claim cannot be
   made without creating data.

## Pre-deployment decision

At the pre-deployment checkpoint, local source, browser and stabilization gates
were green, but authenticated candidate acceptance was still missing. The next visible version was prepared as
`v.1.499.73`; all React flags remain disabled by default. The complete
`qa:stabilize` gate passes, including release provenance, rollback and
activation diagnostics, and two consecutive production builds have the same
release-tree digest
`39ea1956930450f9b0385a9aa93ecb9fc576fd4d0b02b19d9e2b1bdc72d6db8d`
when the operational bootstrap artifact paths are excluded exactly as in the
release procedure.

At that checkpoint this was only a clean local release candidate: no server
staging, activation, rollout flag, real record or Pilot data had changed.

The exact all-flags-off candidate is locked at `b1b77cf` with release ID
`v.1.499.73-b1b77cf`. Later Nomenclature delete-parity commits are the next
development checkpoint and must not be substituted into that release ID.

## Refreshed authenticated baseline

The authenticated browser baseline was rechecked on 2026-07-19 without using
or persisting supplied credentials and without changing Pilot state:

- `/healthz` still returned `status=ok`, version `v.1.499.72`, and
  `sharedState=ready`;
- the browser loaded `./src/app.js?v=db3bbb28f842-v.1.499.72`;
- Nomenclature showed the legacy `Новая позиция` action and zero React mount
  targets;
- the browser console contained no warnings or errors;
- the HTTP response identified Caddy as the active reverse proxy.

This refresh proved only the unchanged pre-deployment baseline.

## All-flags-off deployment result

Release `v.1.499.73-b1b77cf` was staged and activated on Pilot after explicit
authorization. The release manifest records exact commit
`b1b77cf8c0c45fb661beaab44bb8373122744c10`, source digest
`fe530672634f023d27feef421430977fd014d5c3e3ae2219e746423dcb6f49cf`, and
dist digest
`39ea1956930450f9b0385a9aa93ecb9fc576fd4d0b02b19d9e2b1bdc72d6db8d`.

Post-activation evidence:

- local and public health are `ok`; the public version is `v.1.499.73` and
  shared-state is `ready`;
- `/srv/mes/pilot/app` points to the immutable `.73-b1b77cf` artifact, while
  `.72-6985693` is recorded as the immediate rollback target;
- no `MES_REACT_*` values are present in the effective service environment, so
  every React island remains disabled by default;
- the authenticated browser loaded
  `./src/app.js?v=c8acd01fdb11-v.1.499.73`, rendered legacy Nomenclature and
  legacy authorization, found zero React mount targets, and logged no warnings
  or errors;
- all four domain readiness checks passed from PostgreSQL; a bounded
  Shift Execution dispatch read returned complete, server-authoritative
  coverage for its exact row/work-center/date scope without writes;
- the pre-deploy shared-state backup and metadata both have mode `0600`;
- the exact active commit was fast-forward promoted to GitHub `main`.

This completes acceptance steps 1-3.

## Nomenclature read-only Pilot evaluation

The root-owned Nomenclature evaluation permission was enabled for one bounded,
authenticated session and then disabled again. No write-evaluation flag was
enabled and no application data was changed.

Live evidence for the React path:

- the effective service environment contained only
  `MES_REACT_NOMENCLATURE=1` and
  `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION=1`;
- the service remained active and public `/healthz` returned `200`;
- the authenticated user explicitly requested
  `react-nomenclature-evaluation=1` and received the React read-only view;
- the island reached `data-react-island-state=ready`, revision `1`, with a
  first-commit measurement of `60.30 ms`;
- React and legacy both showed zero Nomenclature rows and the same eleven
  registry sections with zero counts;
- React exposed no legacy `Новая позиция` action and its `Добавить позицию`
  control was disabled;
- no real or disposable record was created, updated or deleted.

Rollback evidence:

- the root-owned deactivation procedure removed all effective
  `MES_REACT_*` values;
- the service remained active and public `/healthz` still returned `200`;
- an authenticated reload with the same evaluation query rendered legacy,
  had no React mount target and restored the legacy `Новая позиция` action.

This completes acceptance steps 4-6 for the empty-state Nomenclature read-only
slice. A non-empty row/detail parity claim and every write command remain
unaccepted until a disposable test record is available. All sessions currently
use legacy Nomenclature.

## Structure Employees read-only Pilot evaluation

The second live slice evaluated the non-empty PostgreSQL-backed Employees
registry. Rollout controls from commit `97fb0ac` were executed from a temporary
root-only directory so the immutable `v.1.499.73-b1b77cf` release artifact was
not modified.

Live React evidence:

- the effective service environment contained only
  `MES_REACT_STRUCTURE_EMPLOYEES=1` and
  `MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION=1`;
- the service remained active and public `/healthz` stayed `200` with
  `sharedState=ready`;
- an existing authenticated session explicitly requested
  `react-structure-employees-evaluation=1`;
- the island reached `ready`, revision `1`, with a first-commit measurement of
  `31.50 ms`;
- all `76` React rows matched all `76` legacy rows in order and in all four
  read fields: employee, personnel number, assignment and status;
- the registry counts matched the same PostgreSQL projection:
  `19 / 19 / 49 / 76 / 6 / 0`;
- selecting a second employee updated the selected row and the full assignment
  passport, while `Новая запись` remained disabled;
- requesting `Подразделения` unmounted React and opened the exact legacy
  registry with `19` rows and its command surface.

Rollback evidence:

- deactivation removed every effective `MES_REACT_*` value;
- an authenticated reload with the same evaluation query mounted no React
  island and opened legacy;
- legacy Employees still contained the same `76` rows in the same order and
  with the same four read values captured before evaluation;
- the temporary root-only rollout directory was inspected and removed after
  deactivation.

No create, edit, archive or delete action was invoked. Structure Employees is
currently legacy for every session. The non-empty read-only Pilot gate is now
accepted; command migration remains a separate future slice.
