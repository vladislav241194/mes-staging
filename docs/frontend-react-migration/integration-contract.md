# React island integration contract

Date: 2026-07-19
Status: production integrations available behind disabled-by-default flags

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

The host must not pass shared mutable state, DOM renderer functions, or storage
handles into the React island. A write-capable vertical slice may receive only
a capability-scoped typed command callback; the host validates the command and
delegates it to the existing command owner.

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
the first feature-flag integration. Its read-only mode remains unchanged. The
separate write-evaluation capability owns the create/edit form and usage-aware
delete confirmation. It calls the existing
`products/events.saveNomenclatureCommand` and the extracted
`deleteNomenclatureCommand`; both remain the single command owners. Component
Types proves the generic boundary in the lab
but is not approved for production activation yet.

`mountComponentTypesReactIsland(...)` owns only the Directories `componentTypes`
read slice. Its host requires two explicit server permissions, the active
section, and a per-session evaluation request. Choosing “Все справочники”, any
other section, or editor access restores or retains the legacy Directories
runtime and its commands.

`mountOperationsReactIsland(...)` uses the same directory host contract but a
separate bundle, scope, flags, and typed adapter. The host supplies operations
in existing runtime order with user-facing work-center labels already resolved
by production MES logic. React does not own work-center aliasing or routing.

`mountNomenclatureTypesReactIsland(...)` consumes the normalized
`nomenclatureTypes` read slice and may dispatch one typed create/edit save
command when the exact write capability is present. Existing directory logic
remains authoritative for validation, persistence and automatic Nomenclature
and Specifications type synchronization; delete stays legacy. The shared host
uses one explicit legacy override so returning from any migrated directory
cannot cycle into a different React section.

`mountStatusesReactIsland(...)` consumes the host-computed Statuses projection,
including lifecycle, contract, transition, audit and impact semantics. React
owns application-area filtering, selection, the read passport and a typed
custom-status editor. It does not reproduce MES status policy: the existing
owner accepts create/edit only for persisted user-authority rows, while every
system lifecycle row and delete remain read-only.

`mountBoardsReactIsland(...)` provides an independently bundled boundary for
Boards/BOM read and board-metadata create/edit. Its production host requires a
separate false-by-default feature policy and the `boards` pane. React dispatches
only typed board save commands to the existing Products owner; Excel import,
BOM rows and delete do not transfer from legacy.

`mountStructureEmployeesReactIsland(...)` provides the canonical Employees
registry slice over a host-supplied System Domains snapshot. The host retains
all registry navigation, authorization and command ownership; choosing any
registry other than Employees requests unchanged legacy rendering.

`mountStructurePositionsReactIsland(...)` uses the same authenticated System
Domains snapshot in a separate bundle and feature policy. It owns the Positions
read table/passport and a local-only create/edit evaluation delegated to the
host System Domains command owner. Archive and every unsupported Structure
command remain in the legacy renderer.

`mountStructureOrgUnitsReactIsland(...)` owns the Org Units read table/passport
and a local-only create/edit evaluation over the same snapshot. Parent labels
stay inside the typed adapter; parent existence and hierarchy cycles are checked
by the host before delegation to the revision-checked System Domains owner.
Archive and all unsupported commands remain legacy.

`mountStructureWorkCentersReactIsland(...)` owns the Work Centers read table,
passport and a local-only create/edit evaluation. Organization and parent-center
references are resolved at the typed boundary. The host validates reference
existence and hierarchy cycles before delegating the revision-checked command;
Planning participation and Gantt visibility remain explicit canonical fields.
Archive and unsupported lifecycle commands remain legacy.

`mountStructureEquipmentReactIsland(...)` owns the Equipment read table,
passport and a local-only create/edit evaluation. Organization, work-center and
schedule references are resolved from the same snapshot and validated by the
host command owner. Archive and equipment scheduling commands remain legacy.

`mountStructureResponsibilityPoliciesReactIsland(...)` owns the policy read
table, passport and a local-only create/edit evaluation. Employee labels and
reference options come from the same System Domains snapshot. The host validates
the unique master and target IDs, while operational runtime remains the owner of
assignable-employee resolution. Archive remains legacy.

`mountStructureMigrationDiagnosticsReactIsland(...)` owns only the diagnostic
composition. The host supplies the existing report and legacy matrix after lazy
load; React neither bundles nor mutates those sources.

`mountWeeklyProductionControlReactIsland(...)` owns the dense weekly read view
behind two false-by-default server permissions, compact PostgreSQL read
readiness and an explicit session request. Its adapter accepts the completed
legacy weekly read model; PostgreSQL period hydration, structure lookups,
fact/report aggregation and deviation calculations stay outside React. A
fallback response, API error or missing session request retains legacy.

`mountTimesheetReactIsland(...)` owns the personnel calendar, summary and a
localhost-only single-day attendance save/remove evaluation. Its adapter
consumes the completed legacy `getTimesheetModel()` read model and explicit
per-employee capability/event coordinates. The host reuses the legacy
attendance-event builder and delegates to the revision-checked `timesheet`
System Domains owner. Period, view and permanent schedule interactions request
legacy; PostgreSQL hydration stays outside React. A fallback response, API error
or missing session request retains legacy.

`mountPlanningWorkbenchReactIsland(...)` owns the queue, readiness, visible
structure, host-validated route/item selection and one localhost-only quantity
write evaluation behind two false-by-default server permissions, a
completed PostgreSQL work-order bootstrap and an explicit session request. Its
adapter consumes the completed legacy
`getPlanningWorkbenchModel()` result: PostgreSQL list/detail projection,
snapshot fallback, readiness, labor and tree calculations remain outside
React. Selection updates only `activeRouteId`/`planningWorkItem`, refreshes the
existing PostgreSQL bootstrap when the route changes and is readable by legacy.
The quantity callback accepts only the active route and a positive integer,
requires PostgreSQL projection plus `planning:edit`, delegates to the existing
revision-checked owner, forbids compatibility-state fallback and refreshes the
authoritative detail/slot projection after success. Date, labor, Gantt and
cancellation commands remain legacy. A missing bootstrap, invalid target, API
error or missing session request retains the previous selection or legacy.

`mountShiftWorkOrdersReactIsland(...)` owns the read-only document journal
behind two false-by-default server permissions, PostgreSQL System Domains and
complete Shift Execution read readiness, plus an explicit session request.
Its typed adapter accepts the completed legacy journal model and owns local
document-tree collapse, read-detail selection, issue-report presentation and
local photo overlay navigation over already adapted `data:image/*` payloads.
SZN and work-order-package previews are lazy React chunks: the host supplies
the selected journal row, initializes the existing Routes renderer owner before
reading `getWorkOrderPrintPackageViewModel()`, and owns `window.print()` plus
temporary document-title restoration. React neither recalculates package
quantities nor writes runtime state. Workshop returns through
`unsupported-scope`; assignment, fact entry, Shift Execution repositories and
server authority stay outside React. Missing PostgreSQL coverage, an open
legacy overlay, editor access or a missing session request retains legacy.

`mountShiftMasterBoardReactIsland(...)` owns the read-only Workshop board
behind two false-by-default server permissions, PostgreSQL System Domains and
complete Shift Execution read readiness, plus an explicit session request.
Its adapter consumes the completed legacy board model and owns local task-card
selection across the three existing lanes. React also owns the four focus
controls, but sends only the focus ID to the host; the existing owner normalizes
it and rebuilds rows, lanes, selected row and KPI totals before the island is
remounted. An empty focused projection retains the toolbar and can return to
`all`. Date/master changes plus assignment, fact, carryover, transfer and print
scopes return through `unsupported-scope`. Missing coverage, an open legacy
overlay, editor access or a missing session request retains legacy.

`mountEmployeeDesktopReactIsland(...)` owns the executor task view
behind two false-by-default server permissions, PostgreSQL System Domains and
complete current Shift Execution coverage, plus an explicit session request.
Its adapter consumes the completed legacy `getAuthSessionPrototypeModel()` and
owns local task selection. An additional localhost-only write evaluation sends
only `start-task` and the visible task ID to the host. The host revalidates task
visibility, completion/start state and authenticated ownership, then invokes
the existing `startAuthSessionTask` owner and remounts from its read model. A
direct module entry first hydrates the full Planning PostgreSQL graph, then
derives the bounded dispatch scope. Person switching plus fact, Report,
structure, route and PDF scopes return through `unsupported-scope`;
authentication, fact input, photos and fact/report saves stay in legacy.
Missing coverage, an open legacy modal, ordinary editor access or a missing
session request retains legacy.

`mountContourAdminReactIsland(...)` owns the administrative read view over a
completed host model. React owns only local contour selection and presentation
of passports, rollout scenarios, timings and guardrails. Backup, sync, deploy,
promote and rollback always request legacy. The production host preserves the
server-authenticated admin-only hostname boundary and additionally requires two
false-by-default permissions plus an explicit read-only session request. A
public host, editor access or a missing request retains legacy.

`mountSpecifications2ReactIsland(...)` owns inspection of the selected immutable
published revision and its PostgreSQL tree plus a localhost-only command proof
for updating one existing pre-publication draft row. The host exposes a compact
read model only after source entry, revision number and fingerprint all match
the server projection, rechecks the write gate and delegates the typed command
to `updateSpecifications2DraftRow`. React owns local branch collapse; registry
switching, XLSX upload, add/remove/reparent, routes, norms, attachments,
publication and work-order creation return through `unsupported-scope`. Missing
or mismatched PostgreSQL data or a missing evaluation request retains legacy.

`mountGanttReactIsland(...)` owns the read-only schedule canvas, local slot-
passport selection and inspection of visible dependencies. The legacy Gantt
runtime computes the scale, timeline, rows, heights and slot rectangles from
the PostgreSQL runtime projection and resolves dependency pairs through
`getDependencyPairs(planningState)`, then passes that immutable read model
through a typed adapter. React does not own working calendars, scheduling math
or dependency rules. Filters, scale/date changes, dependency editing, drag,
resize, optimization and every editor command return through
`unsupported-scope`. A snapshot fallback, unloaded runtime, editor access or
missing session request retains legacy.

`mountAuthPickerReactIsland(...)` owns the unauthenticated organizational picker
and a localhost-only PIN command evaluation. Its typed payload allowlists
department, unit and employee presentation fields from PostgreSQL System
Domains plus remaining attempts; PIN draft, validation function, role
activation, gate unlock and session state remain absent. React holds digits in
component memory and sends one typed command. The host revalidates gate state,
employee existence, five-digit shape and attempts, then delegates to
`scheduleAuthPrototypePinValidation`; the existing owner alone creates the
session. Read-only employee selection still returns to the clean legacy PIN
renderer. An unlocked gate, non-server projection or missing evaluation retains
legacy.

`mountRolesReactIsland(...)` provides the Roles and Access read slice plus a
localhost-only passport metadata write evaluation over a host-supplied System
Domains snapshot and module registry. The command can change only label,
description and a view-allowed default module through the revision-checked
`access-control` owner. Grants, assignments, scopes, read-only, active and reset
remain legacy. Missing configure permission, PostgreSQL readiness or explicit
write evaluation fails closed before React exposes the editor.

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
- Scope: Nomenclature item list in explicit read-only mode, plus a separately
  gated create/edit/delete write evaluation.
- Activation: explicit local/runtime configuration after PostgreSQL acceptance.
- Editor mode: legacy by default. Create/edit/delete may mount only with the
  independent write permission and session request.
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
5. Feature flag and mount point added; write evaluation delegates to the
   unchanged command owner rather than duplicating persistence.
6. Activation policy proves disabled, unsupported pane, editor fallback,
   eligible read-only and separately eligible create/edit decisions.
7. Legacy and React paths compared on identical data and viewport.
8. Performance and browser smoke pass before any default-on proposal.
9. Write QA uses disposable data and proves exact mutation scope plus legacy
   fallback for every command not yet migrated.
