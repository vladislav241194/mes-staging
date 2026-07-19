# React island integration contract

Date: 2026-07-19
Status: isolated lifecycle verified; not connected to MES

## Purpose

Define the smallest reversible boundary for mounting React scenarios
after the PostgreSQL slice is accepted and the frontend branch is rebased.

## Host responsibilities

The legacy host will remain responsible for:

- navigation and authorization;
- obtaining the accepted read-only payload for the selected scenario;
- deciding whether the disabled-by-default feature flag is enabled;
- creating one empty mount element;
- falling back to the existing renderer if mount fails;
- removing the React island before restoring the legacy renderer.

The host must not pass shared mutable state, DOM renderer functions, command
callbacks, or storage handles into the React island.

## React island responsibilities

`mountReactMigrationIsland(target, scenario, payload, { onError, onReady })` owns only
descendants of the explicit target, reports render failures to the host, and
returns the same lifecycle handle for every scenario:

- `update(payload)` to rerender from a new read-only snapshot;
- `unmount()` to release the target cleanly.

`onReady({ revision })` fires from a React effect after the corresponding DOM
commit. Revision `1` is the initial mount; every accepted `update(payload)`
increments it. The host can therefore measure mount/update completion without
using a timeout or treating `root.render()` return as user-visible readiness.

The island does not read global MES state, call an API, write data, persist
browser storage, or manipulate DOM outside its target.

`mountNomenclatureReactIsland(...)` remains a narrow convenience wrapper for
the first feature-flag integration. Component Types proves the generic boundary
in the lab but is not approved for production activation yet.

`mountComponentTypesReactIsland(...)` owns only the Directories `componentTypes`
read slice. Its host requires two explicit server permissions, the active
section, and a per-session evaluation request. Choosing “Все справочники”, any
other section, or editor access restores or retains the legacy Directories
runtime and its commands.

`mountOperationsReactIsland(...)` uses the same directory host contract but a
separate bundle, scope, flags, and typed adapter. The host supplies operations
in existing runtime order with user-facing work-center labels already resolved
by production MES logic. React does not own work-center aliasing or routing.

`mountNomenclatureTypesReactIsland(...)` owns only the normalized
`nomenclatureTypes` read slice. Existing legacy logic remains authoritative for
automatic type synchronization. The shared directory host uses one explicit
legacy override so returning from any migrated directory cannot cycle into a
different React section.

`mountStatusesReactIsland(...)` consumes the host-computed Statuses projection,
including lifecycle, contract, transition, audit and impact semantics. React
owns only application-area filtering, selection and the read passport; it does
not reproduce MES status policy.

`mountBoardsReactIsland(...)` provides an independently bundled boundary for
the read-only Boards/BOM scenario. Its production host requires a separate
false-by-default feature permission, read-only permission, session request and
the `boards` pane. This does not transfer editor commands from legacy.

`mountStructureEmployeesReactIsland(...)` provides the canonical Employees
registry slice over a host-supplied System Domains snapshot. The host retains
all registry navigation, authorization and command ownership; choosing any
registry other than Employees requests unchanged legacy rendering.

`mountStructurePositionsReactIsland(...)` uses the same authenticated System
Domains snapshot in a separate bundle and feature policy. It owns only the
Positions read table and passport. Create/save/archive commands and every
other Structure registry remain in the legacy renderer.

`mountStructureOrgUnitsReactIsland(...)` owns only the Org Units read table and
passport over the same snapshot. Parent resolution stays inside the typed
adapter; create/save/archive and all other registries remain legacy.

`mountStructureWorkCentersReactIsland(...)` owns the Work Centers read table
and passport. Organization and parent-center references are resolved at the
typed boundary; planning/Gantt commands and every editor action remain legacy.

`mountStructureEquipmentReactIsland(...)` owns only the Equipment read table
and passport. Work-center and schedule references are resolved from the same
snapshot; create/save/archive and equipment scheduling commands remain legacy.

`mountStructureResponsibilityPoliciesReactIsland(...)` owns the policy read
table and passport. Employee references and display-name policy stay at the
typed boundary; responsibility editing and Workshop commands remain legacy.

`mountStructureMigrationDiagnosticsReactIsland(...)` owns only the diagnostic
composition. The host supplies the existing report and legacy matrix after lazy
load; React neither bundles nor mutates those sources.

`mountRolesReactIsland(...)` provides the Roles and Access read slice over a
host-supplied System Domains snapshot and module registry. Its production host
requires two false-by-default flags, PostgreSQL read readiness, and a per-
session evaluation request. All role/grant/assignment/scope commands remain
legacy; editor access fails closed before React mounts.

The Nomenclature wrapper has its own entry point and does not bundle Component
Types. The multi-scenario lab keeps a separate entry for development QA.

The isolated browser gate has verified initial mount, a payload update, clean
unmount, preservation of the host node/controls, rejection of updates after
unmount, and automatic legacy restoration after a render failure. All checks
passed without console errors.

`createReactIslandFeatureGate(...)` is the host-side state machine:

- disabled flag: never call the React mount and render legacy immediately;
- mount failure: render legacy with a normalized error;
- render/update failure: schedule exactly one fallback, unmount React, then
  render legacy outside the React render phase;
- legacy state: reject later React updates instead of silently remounting;
- unsupported scope: let a migrated child request the unchanged legacy route;
- dispose: release a mounted island without removing an already restored
  legacy view.

The island mount is atomic: if its initial synchronous render fails after root
creation, it unmounts that root before rethrowing to the feature gate.

## Feature flag rules

- Default: off.
- Scope: Nomenclature item list in explicit read-only evaluation mode only.
- Activation: explicit local/runtime configuration after PostgreSQL acceptance.
- Editor mode: legacy until create/edit/delete command parity is implemented
  and accepted; do not mount the read-only island.
- Boards pane: local host payload, feature flag, same-data and rollback gates
  pass; authenticated Pilot acceptance remains pending.
- Structure registries other than Employees: legacy until separately migrated;
  create/archive and all editor access remain legacy command surfaces.
- Failure: `onError` schedules one host fallback; the feature gate unmounts the
  island and restores the legacy module.
- Rollback: disable flag and use the unchanged legacy renderer.
- No automatic promotion from Pilot to Stage.

## Integration gates

1. PostgreSQL slice merged to `main` and commit-derived Pilot release accepted.
2. Frontend branch rebased on that exact accepted commit.
3. Nomenclature read payload frozen and covered by adapter fixtures.
4. Shared build-file ownership released and `package-lock.json` reconciled once.
5. Feature flag and mount point added without changing business commands.
6. Activation policy proves disabled, unsupported pane, editor fallback and
   eligible read-only decisions.
7. Legacy and React paths compared on identical data and viewport.
8. Performance and browser smoke pass before any default-on proposal.
