# MES frontend React migration master

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Worktree: `/Users/vladislav/Documents/Codex/2026-05-30/mes-frontend-react`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`
Initial coordination handoff: PostgreSQL commit `4f0fbae`
Final PostgreSQL handoff: `fc71e01`

## Coordination checkpoint

Final handoff `fc71e01` confirms that the accepted PostgreSQL release `c3b4059`
is live as `v.1.499.70-c3b4059`, all four readiness domains are green, the two
Specifications 2.0 command surfaces are active in the authenticated UI, backup
files are `0600`, and the real Shift Execution assignment was preserved. System
Domains and Shift Execution no longer hydrate working authority from shared
state; shared-state/bootstrap are compatibility or emergency mechanisms only.
There is no remaining PostgreSQL migration gate for frontend work. The frontend
branch may now rebase onto `origin/main@fc71e01` or newer and consume the frozen
contracts through adapters.

## Goal

Move the MES frontend from legacy JavaScript and manual DOM rendering to React
and TypeScript through complete, measurable user scenarios. Preserve business
logic, API contracts, user data, the legacy UI, and the existing visual and
Gantt contracts until each replacement is explicitly accepted.

This branch remains isolated until each React slice is separately accepted; the
earlier requirement not to merge ahead of PostgreSQL is now satisfied.

## Released handoff stop-list

The initial `4f0fbae` handoff prohibited changes to these paths while PostgreSQL
authority was in flight:

- `src/app.js`;
- `src/modules/runtime_state/service.js`;
- auth/login hydration and runtime reconciliation;
- Shift Master Board server projection or bridge code;
- Shift Execution API, repository, authority, or their QA scripts;
- `package.json`, `package-lock.json`, `index.html`, or `app-version.json`;
- business logic, API contracts, or the data model.

This lock is released by `fc71e01`. The isolated proofs completed before the
release did not change any listed path. After rebase, pure frontend integration
may change host/build files with normal overlap review, while PostgreSQL schema,
repositories, Specifications capability policy and Shift Execution authority
remain frozen backend contracts rather than frontend migration scope.

## Migration rules

1. Use a strangler path: legacy remains available until a React scenario passes
   functional, visual, performance, and live-pilot acceptance.
2. Move one user scenario at a time, not one technical layer at a time.
3. Put all server payload normalization behind typed adapters.
4. Separate shared UI primitives from process-specific MES components.
5. Treat existing module differences as intentional, accidental, or unresolved
   before reproducing them.
6. Do not use React migration as permission to redesign, change commands, or
   replace PostgreSQL contracts.
7. A local build is not acceptance; the final gate is the real pilot path.

## Current module families

| Family | Modules | Migration treatment |
| --- | --- | --- |
| Registry/sidebar | Nomenclature, Roles, Production Structure, Directories | Shared page, sidebar, filter, table, detail contracts |
| Dense planning | Planning, Timesheet, Weekly Control | Shared loading/error contracts; specialized dense layouts |
| Operational | Workshop, Worker Desktop, Shift Journal | Integrate only after the final PostgreSQL root audit; preserve accepted server authority |
| Protected canvas | Gantt, Specifications 2.0 | Published tree and runtime-owned Gantt geometry are read-only React; editors and active interactions retain legacy guardrails |
| Admin/standalone | Contours, Authorization | Keep isolated security and standalone-shell contracts |

## Isolated vertical scenarios

`Nomenclature: open -> filter by type -> select an item -> inspect its card.`

Why first:

- its renderer is not changed by the current PostgreSQL branch;
- it represents a common registry/sidebar/table/detail pattern;
- the first slice can be read-only and therefore cannot corrupt pilot data;
- its acceptance is visible and measurable;
- the resulting primitives can later support Roles, Production Structure, and
  Directories without forcing those modules to have identical layouts.

The initial implementations live under `experiments/react-migration/`. Each
standalone architecture lab uses a fixture through a typed adapter before
production integration. The production hosts remain separate, reversible and
disabled by default; none of these local integrations is a release candidate.

The second proof is `Component Types: open -> filter by family -> select a type
-> inspect its calculation fields.` It mirrors all eight legacy columns and
reuses the same action, selectable-row, detail, table, status, sidebar, panel,
header and page contracts. This closes the one-off-prototype risk for the
registry family: shared behavior now has two consumers, while entity columns
remain scenario-specific.

Six scenario families are available through the generic reversible island boundary.
Nomenclature remains the first production feature-flag scope; Component Types
is an isolated reuse proof. Structure Employees is the first canonical System
Domains read-model proof and the second production-integrated island. Boards/BOM
is now the third production-integrated island and preserves its process-specific
nine-column table and component summary. All remain disabled by default; these
integrations are not Pilot activation claims.

The fifth proof is `Roles and Access: select role -> inspect passport
-> inspect six-action grants -> inspect explicit employee assignments`. Its
typed adapter consumes canonical System Domains plus the module registry and is
checked action-by-action against the production access-control service. Browser
QA proves three roles, four modules, mouse/keyboard selection, payload revision
`1 -> 2`, assignment joins, table-owned overflow and editor/disabled legacy
fallback. The current independent artifact is `212,831 B` raw / `65,382 B`
gzip. It now has the same disabled-by-default production host boundary; the
later local metadata slice owns only label, description and default module.

The lab also contains a host-side feature gate. A disabled flag never mounts
React; mount/update/render failures schedule one fallback, unmount React, and
restore the host-owned legacy view. Browser QA proved disabled and render-error
paths without console warnings. This closes the isolated rollback-mechanics
gate but does not wire or activate a production flag.

The independent Nomenclature, Boards, Structure Employees, Roles, Component
Types and Operations entries are
separated from the multi-scenario lab. Each minified budget is `225,000 B` raw /
`68,000 B` gzip; the artifacts at that read-only checkpoint were respectively `205,469 B` /
`63,705 B`, `208,616 B` / `64,478 B`, `210,459 B` / `64,768 B`, and
`208,801 B` / `64,511 B`, `204,857 B` / `63,539 B`, and `203,364 B` /
`63,173 B`. Each is checked not to contain unrelated scenarios.
The shared runtime reports post-commit revision
events, so Pilot mount/update time can later be measured without arbitrary
timeouts. Local timings are QA evidence only, not Pilot acceptance.

The legacy source audit also found that `Печатные платы` in the Nomenclature
sidebar opens the separate Boards/BOM pane and counts `bomLists`; it is not an
item filter. The React item-list scenario still requests `unsupported-scope`
and returns to that separate pane. The independent Boards/BOM scenario now
covers board selection, identity, nine-column BOM inspection, component totals,
empty-board state and local metadata create/edit without taking over Excel
import, BOM rows or delete.

The existing Products module still owns every Board command. React now
dispatches only typed create/edit metadata saves through that owner. Excel
import, BOM row edits and delete remain legacy, so no working user loses those
commands while their parity is unfinished.

The QA now executes the actual legacy Nomenclature renderer and compares it
with the React adapter on the same fixture. The seven read headers, four row
IDs, cell values, order and initial selection match. The legacy editor and
`Действия` column are recorded as intentional non-parity protected by the
activation policy, not hidden behind a broad parity claim.

Boards QA also executes the actual legacy Boards page and BOM row normalizer on
the shared fixture. Nine read headers, normalized row values and order, plus
sidebar component totals match. Its disposable write pass proves create/edit,
hidden metadata and imported-row preservation, Nomenclature result sync,
Specifications reference stability and legacy read-back. Import, BOM cells and
delete remain explicit non-parity.

Structure Employees QA targets the canonical `productionStructureMatrix`
System Domains module rather than the older hierarchy visualization. It joins
employees to their primary employment assignments, preserves stable IDs, and
matches the actual legacy four-column Employees table plus all seven registry
counts. The adapter also consumes the complete generated canonical snapshot
without dropping any of its 76 employees. Other registries and every command
remain behind `unsupported-scope`/editor fallback.

The production host now accepts Structure Employees only after an actual
PostgreSQL API hydration, two explicit false-by-default runtime flags and a
per-session evaluation request. The production-shell QA sends one canonical
read-only System Domains response to both renderers and proves `76 = 76` rows,
identical visible values/order, selection/detail parity, all seven registries,
six metrics, disabled writes, unchanged disposable state and exact fallback to
the `19`-row legacy Organization Units registry. The independent production
artifact is `204,788 B` raw / `64,411 B` gzip / `61,098 B` Brotli. It has not
been released or activated on Pilot.

Nomenclature and Structure Employees now use one production island-host
contract for activation decisions, cancellation-safe lazy loading, commit
telemetry, single-shot error fallback, unmount and exact legacy-scope return.
Module wrappers retain only their payload policy, bundle entry and scenario-
specific eligibility rules. This prevents the second module from becoming a
copied runtime fork while preserving independent feature flags and rollback.

Boards/BOM also uses that host contract with its own read-only runtime flags and
local-only RBAC-gated metadata write evaluation. Production-shell parity proves
the same nine headers and four normalized BOM rows, a 16-component/four-group
summary, create/edit, hidden/BOM preservation, result-Nomenclature sync,
Specifications stability and legacy read-back. The owner audit repaired a
missing `upsertBomResultToNomenclature` dependency and stopped edit from
clearing `projectId`. Its artifact is `206,793 B` raw / `65,055 B` gzip /
`56,012 B` Brotli. It has not been released or activated on Pilot.

Roles/Access now uses the same host with two independent runtime flags,
PostgreSQL read readiness, and a per-session request. Production-shell QA
renders eight canonical roles, thirteen modules and explicit assignments,
keeps default writes disabled and records a `< 25 ms` local first commit. A
separate localhost-only metadata gate changes label, description and default
module through the revision-checked `access-control` owner; conflict retry,
legacy read-back and preservation of grants, assignments, scope, flags and a
hidden server field pass. Its production artifact is `207,239 B` raw /
`65,088 B` gzip / `56,024 B` Brotli. It has not been released or activated on
Pilot.

Directories Component Types is the fifth production-integrated island. Its
read mode activates only inside `componentTypes`, behind two server flags and
a per-session request. Production-shell QA proves literal parity for four rows,
eight formatted cells and order, including `комп./ч`, `сек`, and `шт.` units.
A separate local RBAC-gated write contour now creates, edits, reads back through
legacy and deletes one disposable row via the existing directory owner and
safe removal flush. Cleanup restores all original rows and preserves Planning
routes, steps and slots. Pilot accepted the eight-row read slice; no Pilot
write gate is active.

Directories Operations is now the sixth production-integrated island. Existing
production logic still sorts operations and resolves each
work-center label before the typed adapter. Production-shell QA proves literal
parity for three rows, the three visible cells and order, plus work-center
filtering, selection/detail, loop-free legacy return, unchanged state and clean
console. Its artifact is `200,213 B` raw / `62,802 B` gzip / `54,111 B`
Brotli. Pilot read acceptance now proves `22/22` row parity, seven warehouse
operations, stable passport `D1_OP1`, a `25.20 ms` first commit and clean
rollback with all flags off. A local RBAC-gated write contour now completes
create/edit through the existing owner, preserves hidden operation fields and
reads results through legacy. Direct owner QA proves ordinary and overridden
route-step propagation plus the unlocked/locked/completed slot boundary. It
also repaired a missing Planning-labor dependency in the legacy event service.
Pilot write stays off; delete remains legacy because it also clears
Specifications references.

Directories Nomenclature Types is now the seventh production-integrated island
and has locally complete create/edit parity. It consumes the existing
normalized runtime rows and dispatches typed save commands to the existing
RBAC-protected owner. Disposable-snapshot QA proves literal read parity for
five rows, create/edit, Nomenclature and Specifications reference propagation,
legacy read-back, unchanged unrelated Planning rows and clean console. The
owner audit repaired stale-state synchronization and the empty-previous-name
normalization defect that could recategorize existing REA items during create.
Its artifact is `203,085 B` raw / `63,699 B` gzip / `54,776 B` Brotli. Write is
local-only with no server runtime flag; it has not been released or activated
on Pilot and delete remains legacy.

Directories Statuses is now the eighth production-integrated island with local
create/edit parity for user-managed rows only. The host retains lifecycle,
contract, transition, audit and impact semantics; React renders the projection
and dispatches one typed custom-status command. The owner requires both a
`custom-status-` ID and persisted `statusAuthority: "user"`, so forged input
cannot mutate any of the 85 system rows. Disposable-snapshot QA proves custom
create/edit, persistence, system-row protection, legacy read-back and unchanged
Planning rows. Its artifact is `204,911 B` raw / `64,133 B` gzip / `55,175 B`
Brotli. Write is local-only; it has not been released or activated on Pilot.

Structure Positions is now the ninth production-integrated read-only island.
It consumes the authenticated PostgreSQL System Domains payload in a separate
bundle and keeps create/save/archive in legacy. Production-shell QA proves
literal parity for 49 rows, five visible cells and order, selection/passport,
all seven registry links, six metrics, exact Org Units fallback, unchanged
state and clean console. Employees regression remains 76/76. Its artifact is
`203,728 B` raw / `63,958 B` gzip / `55,098 B` Brotli. It has not been released
or activated on Pilot.

Structure Org Units is now the tenth production-integrated island and has a
local-only PostgreSQL create/edit evaluation gate.
Production-shell QA proves 19/19 PostgreSQL rows, all five cells and order,
parent hierarchy, selection/passport, seven registry links, six metrics, exact
Work Centers fallback, unchanged state and clean console. Positions regression
remains 49/49. Command QA creates a twentieth child unit, rejects an indirect
hierarchy cycle before PUT, exercises revision conflict and retry, preserves
hidden fields and reads the edit through legacy without changing the disposable
compatibility snapshot. Its current artifact is `213,588 B` raw / `65,204 B`
gzip. It has not been released or activated on Pilot.

Structure Work Centers is now the eleventh production-integrated island with a
local-only PostgreSQL create/edit evaluation gate. Production-shell QA proves
19/19 PostgreSQL rows, five cells and order,
organization/parent references, selection/passport, seven registry links, six
metrics, exact Equipment fallback, unchanged state and clean console. Employees,
Positions and Org Units regressions remain exact. Command QA creates a twentieth
row, rejects an indirect hierarchy cycle before PUT, preserves explicit
Planning/Gantt flags, exercises conflict and retry, preserves hidden fields and
reads the result through legacy. The runtime impact audit also repairs explicit
parent-clear and false-flag fallback defects and proves stable employee/Shift
references across rename. Its artifact is `215,471 B` raw / `65,474 B` gzip.
Pilot write evaluation remains separate.

Structure Equipment is now the twelfth production-integrated island and has a
local-only PostgreSQL create/edit evaluation gate.
Production-shell QA proves 6/6 PostgreSQL rows, five cells and order, work-center
and schedule references, selection/passport, seven registry links, six metrics,
exact Org Units fallback, unchanged state and clean console. All four prior
Structure registry regressions remain exact. Command QA rejects invalid quantity
before PUT, creates a seventh row with exact organization/work-center/schedule
references, exercises revision conflict and retry, preserves hidden fields and
reads the result through legacy without changing the disposable compatibility
snapshot. Its artifact is `214,824 B` raw / `65,385 B` gzip. It has not been
released or activated on Pilot.

Structure Responsibility Policies is now the thirteenth production-integrated
island and has a local-only PostgreSQL create/edit evaluation gate. The minimal functional fixture is empty; empty-state QA passes,
while one valid policy in a temporary `0600` snapshot proves literal four-cell parity,
employee formatting, selection/passport, navigation, fallback and unchanged
state; the full domain baseline independently reports one policy. Command QA
creates a second manual policy, rejects a duplicate master before PUT, preserves
manual targets while switching to `all`, exercises conflict/retry, preserves
hidden fields and reads both rows through legacy. All five earlier Structure
regressions remain exact. Its artifact is `215,212 B` raw / `65,557 B` gzip. It
has not been released or activated on Pilot.

Structure Migration Diagnostics is now the fourteenth production-integrated
read-only island and completes all seven sidebar destinations. Production-shell
QA proves 152/152 source rows, five cells/order, six legacy-equal metrics, four
issue groups, seven registry links, exact Employees fallback, unchanged state
and clean console. All six registry regressions remain exact. Its artifact is
`203,082 B` raw / `63,875 B` gzip / `55,020 B` Brotli. It has not been released
or activated on Pilot.

Weekly Production Control is now the fifteenth production-integrated scenario
and the first dense planning-family island. Its adapter consumes the existing
module's completed read model instead of duplicating PostgreSQL hydration or
plan/fact calculations. Production-shell QA proves literal 25-group,
eleven-column parity on one compact PostgreSQL payload, default legacy,
session-scoped activation, table-owned overflow, unchanged state and clean
console. The owner now projects formatted deviation-note/report context and
React matches the legacy focus/blur interaction in a viewport-safe popover;
Weekly owns no write commands. The integration also closes a legacy Structure-
helper lazy-load race for both renderers. Its artifact is `202,775 B` raw /
`63,714 B` gzip / `54,840 B` Brotli. It has not been released or activated on
Pilot.

Timesheet is the sixteenth production-integrated scenario and the second dense
planning proof, now with a local-only one-day attendance save/remove gate. Its
adapter accepts the completed legacy read model; browser QA proves
exact 76-employee parity across 96 rows and 35 columns on canonical System
Domains, default legacy, table-owned overflow, unchanged state and direct
legacy editor fallback. Command QA rejects invalid absence/overtime before PUT,
saves a sick day, reads it through legacy, exercises conflict-without-mutation,
retries reset and preserves an unrelated hidden event field. The React host
reuses the legacy event builder and the existing revision-checked `timesheet`
owner. Its bundled artifact is `210,506 B` raw / `64,915 B` gzip. Permanent
schedule commands and Pilot writes remain separate. The legacy Timesheet
browser suite was also moved from obsolete localStorage assertions to a mocked
PostgreSQL-primary API and proves its existing fact and `2/2` schedule editors
still advance two server revisions.

Planning Workbench is the seventeenth production-integrated scenario. The legacy renderer
now exposes a completed read-model for PostgreSQL list/detail projection,
snapshot fallback, readiness, labor and visible structure. Lab QA proves three
queue entries, five readiness metrics, four hierarchy rows, payload update and
legacy route fallback. Production-shell QA proves two-order PostgreSQL
bootstrap parity, five readiness metrics, two hierarchy rows, unchanged state
and clean console. Its bundled artifact is `201,793 B` raw / `63,311 B` gzip /
`54,483 B` Brotli. It moves no quantity, date, labor, Gantt or cancel command
and has not been released or activated on Pilot.

Shift Work Orders is the eighteenth production-integrated scenario and the
first operational-family proof. Its typed
adapter consumes the completed journal model and renders two fixture work
orders, three operations, three assignments, eight columns and the selected
read detail. Selection, tree collapse, revision update and legacy command
fallback pass. Production-shell QA proves one PostgreSQL-backed work order,
operation and assignment, default legacy, explicit read-only activation,
print fallback, zero Shift Execution writes and unchanged state. Assignment,
fact, print/photo implementation, Workshop runtime and Shift Execution authority
remain untouched. The production artifact is `208,178 B` raw / `64,883 B`
gzip / `55,856 B` Brotli. It has not been released or activated on Pilot.

The standalone Dispatch module was audited and intentionally skipped: its
blueprint is a disabled, headerless placeholder with no reads, writes, table
or actions. Shift Master Board is instead the next meaningful operational
slice and the nineteenth production-integrated scenario. Its React island consumes the completed legacy board model and
renders three lanes, four task cards and seven read metrics. Selection and
revision update pass; assignment, fact, carryover, transfer, print, date,
focus and master scopes return to legacy. Production-shell QA proves identical
three-lane/one-card density from PostgreSQL, default legacy, assignment
fallback, zero Shift Execution writes and unchanged state. Its production
artifact is `202,787 B` raw / `63,572 B` gzip / `54,628 B` Brotli. It has not
been released or activated on Pilot.

Employee Desktop is the twentieth production-integrated scenario and closes the read
path from Planning through Workshop and Shift Work Orders to the executor. Its
adapter consumes `getAuthSessionPrototypeModel()` and renders three fixture
tasks, seven read metrics, route context and plan/fact values. Local selection
and revision update pass; person switching, start, fact, Report, structure,
route and PDF return to legacy. Production-shell QA proves one identical
PostgreSQL-backed task in legacy and React, default legacy, explicit read-only
activation, fact fallback, zero Shift Execution writes and unchanged state. A
direct module entry now hydrates the Planning PostgreSQL graph before deriving
the bounded dispatch scope. Its production artifact is `202,416 B` raw /
`63,416 B` gzip / `54,553 B` Brotli. It has not been released or activated on
Pilot.

Contour Admin is the twenty-first production-integrated scenario. The legacy module exposes a completed
read model with three contours, five operational scenarios, speed rows and
guardrails. React owns only local contour selection; every backup, sync, deploy,
promote and rollback action returns to legacy. Browser QA proves three cards,
five scenarios, two speed rows, revision update, action fallback, disabled flag,
no overflow and a clean console. Its independent entry is `204,350 B` raw /
`63,207 B` gzip. Production-shell QA on the exact mapped admin hostname proves
default legacy, three contours, five scenarios, five speed rows, scoped CSS,
first commit below `20 ms`, action fallback, zero Ops writes and clean console.
The production artifact is `201,348 B` raw / `63,003 B` gzip / `54,161 B`
Brotli. Pilot and Admin were not changed.

Specifications 2.0 is the twenty-second production-integrated scenario and the
first bounded protected-canvas proof. The legacy module exposes a compact read
model only after the selected source entry, publication revision and fingerprint
match the PostgreSQL revision projection. React renders the immutable revision
passport, four metrics and published tree with local branch collapse. Registry
switching, XLSX upload, editing, routes, norms, attachments, publication and
work-order creation all return to legacy. Lab QA proves revision `7 -> 8`, tree
collapse, disabled fallback and clean console. Production-shell QA proves
default legacy, exact PostgreSQL revision/fingerprint parity, four rows, first
commit below `20 ms`, editor fallback, zero Specifications API writes and unchanged
`0600` state. The production artifact is `204,557 B` raw / `64,193 B` gzip /
`60,833 B` Brotli. It has not been released or activated on Pilot.

Gantt is the twenty-third production-integrated scenario. Its read boundary is
not a second scheduler: the existing runtime computes the PostgreSQL-backed
scale, rows, heights and slot rectangles, and React renders that completed
geometry with local slot-passport selection. Toolbar/filter/scale,
dependencies, drag, resize, optimization and editor scopes return to legacy.
Production-shell QA proves default legacy, revision-19 PostgreSQL projection,
three rows, two slots, first commit `15.30 ms`, editor fallback and zero
Planning writes. The production artifact is `201,763 B` raw / `63,352 B` gzip /
`54,525 B` Brotli. It has not been released or activated on Pilot.

Authorization picker is the twenty-fourth production-integrated scenario. It
owns only department, unit and employee selection from PostgreSQL System
Domains. PIN digits/draft, attempt limits, validation, role activation, gate
unlock and session state never cross into React. Employee selection falls back
to a clean legacy PIN screen. Browser QA proves nine departments, no React
keypad, ten legacy keypad buttons after handoff, zero entered digits, zero
System Domains writes and clean console. The production artifact is `199,896 B`
raw / `62,906 B` gzip / `54,098 B` Brotli. No authentication policy or Pilot
release was changed.

The first write-parity milestone is now implemented for Nomenclature create and
edit behind a third false-by-default permission and an explicit session request.
React never writes storage directly: the host allowlists the typed payload and
delegates to the same `products/events.saveNomenclatureCommand` used by the
legacy form. Disposable production-shell QA proves exactly one create and one
edit, all nine fields, unchanged Planning state, read-only byte identity, and
exact selected-row legacy fallback for delete. Delete and all other module
writes remain legacy. The production artifact is `205,773 B` raw / `64,539 B`
gzip / `55,547 B` Brotli; Pilot was not changed.

A dry-run rebase preflight against the earlier `origin/main@511e281` found 40
frontend paths, 50 main paths, zero overlapping paths and zero merge conflict
markers. Final handoff `fc71e01` now authorizes the actual rebase; the preflight
will be repeated after the Structure Employees commit and before rebasing.

## Acceptance gates for the first integrated slice

- legacy and React routes can be switched independently by a feature flag;
- identical API payload produces equivalent visible data;
- filtering and selection survive rerenders without full-page replacement;
- keyboard focus and table/sidebar semantics remain usable;
- no command or write is introduced in the first slice;
- no regression in startup or navigation budgets;
- visual comparison is approved on the same viewport and data;
- pilot smoke is completed after the PostgreSQL slice is accepted and rebased.

## Integration order

1. Finish the isolated lab and component contract. **Complete for Nomenclature, Component Types, Operations, Nomenclature Types, Statuses, Boards/BOM, all seven Structure sidebar destinations, Roles/Access, Weekly Production Control, Timesheet, Planning Workbench, Shift Work Orders, Shift Master Board, Employee Desktop, Contour Admin, Specifications 2.0, Gantt and the pre-PIN Authorization picker read-only proofs.**
2. PostgreSQL root rollout and final authenticated audit. **Complete at `fc71e01`.**
3. Rebase this branch onto the accepted PostgreSQL/main commit. **Complete at `fc71e01`; zero conflicts.**
4. Replace fixtures with read-only runtime payload adapters. **Complete locally for Nomenclature, Directories Component Types, Operations, Nomenclature Types and Statuses using current runtime projections; for Structure Employees, Structure Positions, Structure Org Units, Structure Work Centers, Structure Equipment, Structure Responsibility Policies, Roles/Access and Timesheet using PostgreSQL-hydrated System Domains; for Planning Workbench using the PostgreSQL list/detail bootstrap; for Shift Work Orders and Shift Master Board using the complete PostgreSQL Shift Execution projection; for Specifications 2.0 using the fingerprint-matched published revision read model; and for Gantt using runtime-owned PostgreSQL-backed geometry. No fixture reaches production.**
5. Mount React islands behind disabled-by-default feature flags. **Complete for Nomenclature, Structure Employees, Structure Positions, Structure Org Units, Structure Work Centers, Structure Equipment, Structure Responsibility Policies, Structure Migration Diagnostics, Boards/BOM, Roles/Access, Directories Component Types, Operations, Nomenclature Types, Statuses, Weekly Production Control, Timesheet, Planning Workbench, Shift Work Orders, Shift Master Board, Employee Desktop, Contour Admin, Specifications 2.0, Gantt and Authorization picker; read slices require two explicit runtime flags plus a session request, Nomenclature has an independent server write permission, Component Types, Operations, Nomenclature Types, user-managed Statuses, Board metadata, PostgreSQL-backed Structure Employees/Positions/Org Units/Work Centers/Equipment/Responsibility Policies create/edit, Timesheet single-day attendance save/remove and Roles passport metadata have local RBAC-gated write evaluations, and every unsupported/write/security scope falls back to legacy.**
6. Run legacy parity, functional, visual, performance, and pilot checks. **Local parity, non-empty production-shell functional QA, visual checkpoint and bundle budgets pass; authenticated Pilot acceptance remains pending.**
7. Migrate commands one vertical scope at a time. **Nomenclature and Component
   Types create/edit/delete are locally complete default-off write evaluations;
   Operations create/edit is locally complete with linked Planning reference
   proof, while its Specifications-aware delete remains legacy. Component Types
   and Operations still need separately gated Pilot write checkpoints. Structure
   Employees create/edit plus one primary assignment is locally complete through
   the revision-checked PostgreSQL System Domains owner; archive remains legacy
   and Pilot write acceptance is separate. Structure Positions create/edit is
   locally complete with organization, work-center and schedule-reference proof;
   archive and Pilot write acceptance remain separate. Structure Org Units
   create/edit is locally complete with parent-existence and indirect-cycle
   rejection before mutation; archive and Pilot write acceptance remain
   separate. Structure Work Centers create/edit is locally complete with
   organization, parent-hierarchy and explicit Planning/Gantt flag validation;
   archive and Pilot write acceptance remain separate. Structure Equipment
   create/edit is locally complete with quantity,
   organization, work-center and schedule-reference validation; archive and
   Pilot write acceptance remain separate. Structure Responsibility Policies
   create/edit is locally complete with unique-master, mode and employee-list
   validation while Workshop assignability remains runtime-owned; archive and
   Pilot write acceptance remain separate. Timesheet single-day attendance
   save/remove is locally complete through the PostgreSQL owner; permanent
   schedule assignment and Pilot write acceptance remain separate. Roles
   passport metadata is locally complete through the `access-control` owner;
   grants, assignments, scopes, read-only, active and Pilot write acceptance
   remain separate. Weekly
   Production Control is read-only by product contract and has no command
   scope; all remaining module commands are pending.**
8. Only then propose default-on activation or the next command scope.

Live readiness was refreshed after the first write-parity checkpoint. Pilot is
healthy on `v.1.499.72`, loads `src/app.js?v=db3bbb28f842-v.1.499.72`, keeps all
three Nomenclature React flags false, renders legacy with zero rows and has a
clean console. Candidate `311fd5d` is 34 commits and 227 changed paths beyond
the recorded live source `6985693`; it must be deployed as a new immutable
all-flags-off release before authenticated React acceptance is possible. The
exact evidence and rollout order are recorded in
`docs/frontend-react-migration/pilot-readiness-2026-07-19.md`.

The second integrated scope is prepared independently of the outstanding root
operation: Structure Employees is committed only as default-off source and QA.
It must not be staged or activated before the Nomenclature evaluation is
accepted on the live Pilot path.

Pilot rollout safety is session-scoped: even when both public server switches
permit the experiment, Nomenclature stays legacy unless an authenticated or
QA-bypass session explicitly requests `react-nomenclature-evaluation=1`.

## Live Pilot checkpoint

Release `v.1.499.71-7b9bbf7` from commit `7b9bbf7` was the first activated
frontend candidate. Its
source digest is
`282920f6649621ea163936fa7e60d648867de0ed172a4b6c7efa06379a271b50` and its
dist digest is
`fd2bda6d739e9b9132ecfdb87b23925c43a78085d06ed640d8d51b9a9e61e4b3`.
That activation retained `v.1.499.70-c3b4059` as the previous release pointer.
Public health returned `ok`, shared state `ready`, the systemd service was
active, and the authenticated browser loaded the `v.1.499.71` application
asset without console errors.

Both React flags were absent during activation and were published as `false`.
The live Nomenclature navigation therefore rendered legacy, preserved the
create action, and created no React root or commit marker. The session's
Nomenclature payload contained zero rows, so the non-empty 4-row parity remains
local production-shell evidence rather than a live-data claim.

Release `v.1.499.72-6985693` is now active on Pilot with source digest
`e21a8612052967f08ad9825d8a120b0f986a47ac4e35073a7a75ddaa820501f5` and
dist digest
`e9f79d16639f998d4542d126794f2c1744f2d6fed93ea0f7e24514be003e893b`.
It adds reproducible root-only activation and deactivation scripts under
`ops/frontend/`, including health/config verification and automatic
restoration of the prior drop-in on failure. Public health is `ok`, version is
`v.1.499.72`, shared state is `ready`, and the browser loaded the matching
application asset with a clean console while both React flags remained
`false`. The deploy account's sudo policy permits restarting Pilot but not
installing the required systemd drop-in, so the remaining experimental-
permission step is a narrow external root handoff rather than a frontend code
blocker. Release `.71` is the immediate rollback target.

## Prepared all-flags-off release candidate

Visible version `v.1.499.73` is prepared on the frontend migration branch with
every React feature and evaluation flag still disabled by default. Full
`qa:stabilize` passes. Two consecutive local production builds produced the
same release-tree digest
`39ea1956930450f9b0385a9aa93ecb9fc576fd4d0b02b19d9e2b1bdc72d6db8d`
using the release procedure's compatibility-artifact exclusions. This is not a
staged or active Pilot release: no external state changed, and staging plus
activation still require explicit authorization.

The exact candidate remains commit `b1b77cf` and release ID
`v.1.499.73-b1b77cf`. The later Nomenclature delete-parity checkpoint is not
part of that immutable candidate and must receive a new visible version before
any future release.

## Weekly Control Pilot checkpoint

Release `v.1.499.74-7784ab4` is now active on Pilot from clean upstream commit
`7784ab4`. Its source digest is
`4351a52a4d4bb3b0206fcd9fe7d6b2c16ff414aa94e46b022e1f18200e6c8bf8`
and its dist digest is
`39c6c47d9dbf05a7fb9fccc6a2a42f3f54bf6998383fe4d37b13dbf3468dba20`.
The prior `.73-b1b77cf` release is the immediate rollback target.

The authenticated Weekly evaluation accepted the real `25 x 11` projection,
revision `1`, `214.80 ms` first commit, current summary
`28 171 / 1 / 17 / 0`, viewport-safe deviation-note focus and clean console.
All normalized React rows matched the same legacy rows after deactivation.
No data was written. The isolated rollout drop-in is removed, both Weekly
flags are false, health is `ok`, shared-state is `ready`, and every session is
back on legacy Weekly Control. The next migration scope must remain a separate
vertical scenario; this checkpoint does not authorize default-on activation.
The exact active commit `7784ab4` was fast-forward promoted to `origin/main`;
the acceptance documentation is intentionally a later branch-only commit.
