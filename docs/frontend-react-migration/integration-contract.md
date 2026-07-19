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
by production MES logic. A separate typed impact map allows custom-operation
delete confirmation; the host rechecks that bundled MES operations are
protected and delegates cleanup to the existing owner. React does not own
work-center aliasing, routing, Specifications cleanup or persistence. In the
Directories metadata-only runtime, Planning is omitted from shared writes and
preserved server-side; full loaded-graph cleanup is verified at the owner.

`mountNomenclatureTypesReactIsland(...)` consumes the normalized
`nomenclatureTypes` read slice and may dispatch typed create/edit save and
delete commands when their exact capabilities are present. The host supplies a
read-only delete-impact projection; React owns confirmation but not fallback
selection or cleanup. Existing directory logic remains authoritative for
validation, persistence and automatic Nomenclature and Specifications rename/
fallback synchronization. The shared host
uses one explicit legacy override so returning from any migrated directory
cannot cycle into a different React section.

`mountStatusesReactIsland(...)` consumes the host-computed Statuses projection,
including lifecycle, contract, transition, audit and impact semantics. React
owns application-area filtering, selection, the read passport and a typed
custom-status editor. It does not reproduce MES status policy: the existing
owner accepts create/edit only for persisted user-authority rows, while every
system lifecycle row and delete remain read-only.

`mountBoardsReactIsland(...)` provides an independently bundled boundary for
Boards/BOM read, XLSX import, board-metadata create/edit/delete, Nomenclature
row add, all nine existing-row BOM cell commands and ID/table-bound row deletion. Its production host
requires a separate false-by-default feature policy and the `boards` pane.
React dispatches only typed XLSX import, board save/delete, Nomenclature row-add, cell-edit
or row-delete commands
to the existing Products owner and renders the host-owned delete-usage projection.
The host verifies board/row existence, integer quantity, the exact eight-field
non-quantity allowlist and the complete expected normalized row before invoking
`updateBomImportCell`. It accepts the result only after reading the complete
owner-normalized row back. Row add carries the complete expected table, and the
host delegates to `addNomenclatureToBom` before accepting exactly one appended
owner row with the requested Nomenclature identity and unchanged prefix. Row deletion
must match the complete authoritative table snapshot before delegating to
`deleteBomImportRow`, then reads the remaining rows back from the owner. XLSX
import passes the original `File` and expected board-ID snapshot to
`importBomFromXlsxFile`; parsing and all side effects remain owner-only, and the
host accepts only a non-empty authoritative board with matching source file. The aggregate fixture lab
uses a separate read-only Boards scenario, so command UI does not leak into
read evaluation.

`mountStructureEmployeesReactIsland(...)` provides the canonical Employees
registry slice over a host-supplied System Domains snapshot. The host retains
all registry navigation, authorization and command ownership; choosing any
registry other than Employees requests unchanged legacy rendering.
Its local-only command slice delegates create/edit and compound archive to the
existing revision-checked System Domains owner and delegates explicit
reactivation to the existing employee upsert owner. Archive requires ID-bound
second-step confirmation, rejects active secondary employment, schedule,
access-role and responsibility dependencies before PUT, then deactivates the
employee and closes the active primary assignment in one command. Ordinary save
cannot change lifecycle state. Reactivation also requires ID-bound second-step
confirmation and authoritative active-state read-back; it restores the employee
only after `archivedAt` is cleared, without silently reopening the primary
assignment closed by archive.

`mountStructurePositionsReactIsland(...)` uses the same authenticated System
Domains snapshot in a separate bundle and feature policy. It owns the Positions
read table/passport and a local-only create/edit/archive evaluation delegated to
the host System Domains command owner. Archive requires ID-bound second-step
confirmation and a still-active target before `archiveSystemDomainEntity`.
Positions with an active employment assignment are rejected before delegation.
Every unsupported Structure command remains in the legacy renderer.

`mountStructureOrgUnitsReactIsland(...)` owns the Org Units read table/passport
and a local-only create/edit/archive/reactivate evaluation over the same snapshot. Parent
labels stay inside the typed adapter; parent existence and hierarchy cycles are
checked by the host before delegation. Archive uses ID-bound second-step
confirmation and is rejected while active child org units, work centers,
positions, equipment or employment assignments reference the target. The
existing revision-checked System Domains owner remains authoritative. Ordinary
save cannot change lifecycle. Reactivation uses its own ID-bound confirmation,
requires an active parent, clears `archivedAt` through the owner and accepts only
an authoritative active read-back.

`mountStructureWorkCentersReactIsland(...)` owns the Work Centers read table,
passport and a local-only create/edit/archive/reactivate evaluation. Organization and parent-center
references are resolved at the typed boundary. The host validates reference
existence and hierarchy cycles before delegating the revision-checked command;
Planning participation and Gantt visibility remain explicit canonical fields.
Archive requires ID-bound second-step confirmation and delegates to the existing
`archiveSystemDomainEntity` owner. The host rechecks the active target and rejects
work centers referenced by active child centers, positions, equipment or
employment assignments before PUT. Ordinary save cannot change lifecycle.
Reactivation has its own ID-bound confirmation, requires active organization and
parent references, clears `archivedAt` through the existing upsert owner and
accepts only authoritative active read-back while retaining Planning/Gantt flags.

`mountStructureEquipmentReactIsland(...)` owns the Equipment read table,
passport and a local-only create/edit/archive evaluation. Organization,
work-center and schedule references are resolved from the same snapshot and
validated by the host command owner. Archive requires an explicit second
confirmation and delegates to `archiveSystemDomainEntity`; the host rechecks
that the target is still active. Equipment scheduling commands remain legacy.

`mountStructureResponsibilityPoliciesReactIsland(...)` owns the policy read
table, passport and a local-only create/edit evaluation. Employee labels and
reference options come from the same System Domains snapshot. The host validates
the unique master and target IDs, while operational runtime remains the owner of
assignable-employee resolution. Archive remains legacy.
The current PostgreSQL responsibility-policy table/repository persists neither
`isActive` nor `archivedAt`; therefore the generic archive candidate would be
lost on server read-back. React must not expose archive until that owner/schema
contract is defined outside this migration boundary.

`mountStructureMigrationDiagnosticsReactIsland(...)` owns only the diagnostic
composition. The host supplies the existing report and legacy matrix after lazy
load; React neither bundles nor mutates those sources.

`mountWeeklyProductionControlReactIsland(...)` owns the dense weekly read view
behind two false-by-default server permissions, compact PostgreSQL read
readiness and an explicit session request. Its adapter accepts the completed
legacy weekly read model; PostgreSQL period hydration, structure lookups,
fact/report aggregation and deviation calculations stay outside React. A
fallback response, API error or missing session request retains legacy.

`mountTimesheetReactIsland(...)` owns the personnel calendar, summary and
localhost-only single-day attendance plus permanent-schedule save/remove
evaluations. Its adapter consumes the completed legacy `getTimesheetModel()`
read model and explicit per-employee capabilities, event coordinates and
schedule-template options. The host reuses the legacy attendance-event builder,
`saveScheduleAssignment` and `removeScheduleAssignment`, then delegates to the
revision-checked `timesheet` System Domains owner. Period and view interactions
still request legacy; PostgreSQL hydration stays outside React. A fallback
response, API error or missing session request retains legacy.

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

`mountShiftMasterBoardReactIsland(...)` owns the Workshop board
behind two false-by-default server permissions, PostgreSQL System Domains and
complete Shift Execution read readiness, plus an explicit session request.
Its adapter consumes the completed legacy board model and owns local task-card
selection across the three existing lanes. React also owns the four focus
controls, but sends only the focus ID to the host; the existing owner normalizes
it and rebuilds rows, lanes, selected row and KPI totals before the island is
remounted. An empty focused projection retains the toolbar and can return to
`all`. React also sends only an ISO date or master ID: the host delegates dates
to `setShiftWorkbenchDate`, which rehydrates the PostgreSQL dispatch scope, and
revalidates privileged master selection against the current profile list and
`admin`/`productionHead` RBAC before forcing `mine`. A localhost-only write evaluation sends typed `save-assignment` and
`save-fact` commands. The host rechecks role permission, employee access-matrix
membership, Timesheet availability, uniqueness, quantity and defect bounds,
delegates to the existing Shift Execution PostgreSQL owner and refreshes the
canonical projection before React reports success. The owner also supplies the
transfer contract and canonical carryover IDs. React navigates next/source
shifts, corrects a fact, cancels the exact carryover and renders the physical-
transfer result. SZN uses the existing lazy shared print renderer; the host
validates the selected row and executor, records its print status and invokes
`window.print()`. Read-only assignment/fact and manual lane movement return
through `unsupported-scope`; date and permitted master navigation stay in React.
Missing coverage, an open legacy
overlay, editor access or a missing session request retains legacy.

`mountEmployeeDesktopReactIsland(...)` owns the executor task view
behind two false-by-default server permissions, PostgreSQL System Domains and
complete current Shift Execution coverage, plus an explicit session request.
Its adapter consumes the completed legacy `getAuthSessionPrototypeModel()` and
owns local task selection plus fact-form state. An additional localhost-only
write evaluation sends typed `start-task` or `save-fact` commands to the host.
The host revalidates task visibility, completion/start state, authenticated
ownership, quantity bounds, defect balance and deviation-comment requirements,
then invokes the existing `startAuthSessionTask` or `saveAuthSessionTaskFact`
owner and remounts from its read model. The second typed pair,
`prepare-report-photo` and `save-report`, keeps file
selection/preview in React but delegates image compression and report creation
to `prepareAuthSessionReportPhoto` and `saveAuthSessionTaskReport`. Journal
counts are read back through `getShiftWorkOrderIssueSummary`. This journal is
still compatibility UI-state rather than a PostgreSQL domain, so the React
slice preserves that authority instead of introducing a parallel API. A direct
module entry first hydrates the full Planning PostgreSQL graph, then
derives the bounded dispatch scope. Structure, Route and PDF require no host
command: they use the existing typed task payload and shared `ModalOverlay`.
Person switching remains the explicit
`unsupported-scope`; authentication stays in its separate React/legacy session
boundary.
Missing coverage, an open legacy modal, ordinary editor access or a missing
session request retains legacy.

`mountContourAdminReactIsland(...)` owns the administrative read view over a
completed host model plus a local-only typed Ops command proof. React owns local
contour selection, confirmation and safe result presentation; the host rechecks
scenario/action membership and delegates to `executeContourAdminAction`. The
existing owner alone calls the admin-only API, and the server retains cookie
authentication, allowlist, confirmation token, audit and shell execution.
Deploy requests without an API action remain legacy. A public host, missing
local write gate or missing session request retains legacy.

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
passport selection and inspection of visible dependencies, plus a loopback-only
typed start-time command proof for one existing unlocked slot. The legacy Gantt
runtime computes the scale, timeline, rows, heights and slot rectangles from
the PostgreSQL runtime projection and resolves dependency pairs through
`getDependencyPairs(planningState)`, then passes that immutable read model
through a typed adapter. React does not own working calendars, scheduling math
or dependency rules. Before delegating the typed command to the existing
revision-checked `changeSlotSchedule` owner, the host rechecks the PostgreSQL
projection, RBAC, slot identity, route/operation binding, lock state and date.
Filters, scale/date changes, dependency editing, drag, resize, optimization and
all other editor commands return through `unsupported-scope`. A snapshot
fallback, unloaded runtime, non-loopback write request, editor access or missing
session request retains legacy.

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
localhost-only passport metadata and grant write evaluation over a host-supplied
System Domains snapshot and module registry. Typed commands can change only
label, description, a view-allowed default module, one existing six-action
grant coordinate, or the role default scope through the revision-checked
`access-control` owner. The host
rechecks module/action existence, `roles:configure`, read-only-role restrictions
and the `view` dependency rule before delegating. Assignments,
personal/assignment scopes, read-only/active lifecycle and reset remain legacy. Missing configure
permission, PostgreSQL readiness or explicit write evaluation fails closed
before React exposes either command surface.

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
