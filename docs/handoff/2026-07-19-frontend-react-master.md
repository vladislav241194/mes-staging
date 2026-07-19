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
fallback. The independent artifact is `208,801 B` raw / `64,511 B` gzip. It
now has the same disabled-by-default production host boundary; all commands
remain legacy.

The lab also contains a host-side feature gate. A disabled flag never mounts
React; mount/update/render failures schedule one fallback, unmount React, and
restore the host-owned legacy view. Browser QA proved disabled and render-error
paths without console warnings. This closes the isolated rollback-mechanics
gate but does not wire or activate a production flag.

The independent Nomenclature, Boards, Structure Employees, Roles, Component
Types and Operations entries are
separated from the multi-scenario lab. Each minified budget is `225,000 B` raw /
`68,000 B` gzip; the current artifacts are respectively `205,469 B` /
`63,705 B`, `208,616 B` / `64,478 B`, `210,459 B` / `64,768 B`, and
`208,801 B` / `64,511 B`, `204,857 B` / `63,539 B`, and `203,364 B` /
`63,173 B`. Each is checked not to contain unrelated scenarios.
The shared runtime reports post-commit revision
events, so Pilot mount/update time can later be measured without arbitrary
timeouts. Local timings are QA evidence only, not Pilot acceptance.

The legacy source audit also found that `Печатные платы` in the Nomenclature
sidebar opens the separate Boards/BOM pane and counts `bomLists`; it is not an
item filter. The React item-list scenario still requests `unsupported-scope`
and returns to legacy for that action. An independent Boards/BOM read-only
vertical scenario now covers board selection, identity, nine-column BOM
inspection, component totals and the empty-board state without prematurely
taking over production navigation.

The same audit confirmed that the legacy module owns create/edit/delete
commands. The read-only React slice is therefore eligible only for an explicit
evaluation access mode. Editor access returns `write-parity-incomplete` before
mount, so no working user loses commands while write parity is unfinished.

The QA now executes the actual legacy Nomenclature renderer and compares it
with the React adapter on the same fixture. The seven read headers, four row
IDs, cell values, order and initial selection match. The legacy editor and
`Действия` column are recorded as intentional non-parity protected by the
activation policy, not hidden behind a broad parity claim.

Boards QA also executes the actual legacy Boards page and BOM row normalizer on
the shared fixture. Nine read headers, normalized row values and order, plus
sidebar component totals match. The legacy action column, editable inputs,
create/import/delete commands, and editor mode remain explicit non-parity.

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

Boards/BOM also uses that host contract with its own two runtime flags and
per-session request. Production-shell parity proves the same nine headers and
four normalized BOM rows, a 16-component/four-group summary, empty-board state,
disabled import, unchanged disposable state and return to the two-row legacy
Nomenclature pane. Its artifact is `203,869 B` raw / `64,223 B` gzip /
`60,893 B` Brotli. It has not been released or activated on Pilot.

Roles/Access now uses the same host with two independent runtime flags,
PostgreSQL read readiness, and a per-session request. Production-shell QA
renders eight canonical roles, thirteen modules and explicit assignments,
keeps every write disabled, leaves state unchanged and records a `< 25 ms`
local first commit. Its production artifact is `204,264 B` raw / `64,094 B`
gzip / `55,289 B` Brotli. It has not been released or activated on Pilot.

Directories Component Types is now the fifth production-integrated read-only
island. It activates only inside `componentTypes`, behind two server flags and
a per-session request. Production-shell QA proves literal parity for four rows,
eight formatted cells and order, including `комп./ч`, `сек`, and `шт.` units;
family filtering, selection/detail, legacy return, unchanged state and clean
console pass. Its artifact is `201,269 B` raw / `63,156 B` gzip / `54,455 B`
Brotli. It has not been released or activated on Pilot.

Directories Operations is now the sixth production-integrated read-only
island. Existing production logic still sorts operations and resolves each
work-center label before the typed adapter. Production-shell QA proves literal
parity for three rows, the three visible cells and order, plus work-center
filtering, selection/detail, loop-free legacy return, unchanged state and clean
console. Its artifact is `200,213 B` raw / `62,802 B` gzip / `54,111 B`
Brotli. It has not been released or activated on Pilot.

Directories Nomenclature Types is now the seventh production-integrated
read-only island. It consumes the existing normalized runtime rows and does not
duplicate automatic type synchronization. Production-shell QA proves literal
parity for five rows, four visible cells and order, plus status filtering,
selection/detail, loop-free legacy return, unchanged state and clean console.
Its artifact is `200,131 B` raw / `62,738 B` gzip / `53,938 B` Brotli. It has
not been released or activated on Pilot.

Directories Statuses is now the eighth production-integrated read-only island.
The host retains lifecycle, contract, transition, audit and impact semantics;
React renders the resulting projection. Production-shell QA matches all 85
runtime rows, seven visible cells and order, plus group filtering, the full
read passport, loop-free legacy return, unchanged state and clean console. Its
artifact is `200,980 B` raw / `62,993 B` gzip / `54,248 B` Brotli. It has not
been released or activated on Pilot.

Structure Positions is now the ninth production-integrated read-only island.
It consumes the authenticated PostgreSQL System Domains payload in a separate
bundle and keeps create/save/archive in legacy. Production-shell QA proves
literal parity for 49 rows, five visible cells and order, selection/passport,
all seven registry links, six metrics, exact Org Units fallback, unchanged
state and clean console. Employees regression remains 76/76. Its artifact is
`203,728 B` raw / `63,958 B` gzip / `55,098 B` Brotli. It has not been released
or activated on Pilot.

Structure Org Units is now the tenth production-integrated read-only island.
Production-shell QA proves 19/19 PostgreSQL rows, all five cells and order,
parent hierarchy, selection/passport, seven registry links, six metrics, exact
Work Centers fallback, unchanged state and clean console. Positions regression
remains 49/49. Its artifact is `203,298 B` raw / `63,823 B` gzip / `55,093 B`
Brotli. It has not been released or activated on Pilot.

Structure Work Centers is now the eleventh production-integrated read-only
island. Production-shell QA proves 19/19 PostgreSQL rows, five cells and order,
organization/parent references, selection/passport, seven registry links, six
metrics, exact Equipment fallback, unchanged state and clean console. Employees,
Positions and Org Units regressions remain exact. Its artifact is `203,739 B`
raw / `64,039 B` gzip / `55,095 B` Brotli. It has not been released or activated
on Pilot.

Structure Equipment is now the twelfth production-integrated read-only island.
Production-shell QA proves 6/6 PostgreSQL rows, five cells and order, work-center
and schedule references, selection/passport, seven registry links, six metrics,
exact Org Units fallback, unchanged state and clean console. All four prior
Structure registry regressions remain exact. Its artifact is `203,506 B` raw /
`63,993 B` gzip / `55,085 B` Brotli. It has not been released or activated on Pilot.

Structure Responsibility Policies is now the thirteenth production-integrated
read-only island. The minimal functional fixture is empty; empty-state QA passes,
while one valid policy in a temporary `0600` snapshot proves literal four-cell parity,
employee formatting, selection/passport, navigation, fallback and unchanged
state; the full domain baseline independently reports one policy. All five
earlier Structure regressions remain exact. Its artifact is
`204,254 B` raw / `64,244 B` gzip / `55,365 B` Brotli. It has not been released
or activated on Pilot.

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
console. The integration also closes a legacy Structure-helper lazy-load race
for both renderers. Its artifact is `201,150 B` raw / `63,156 B` gzip /
`54,408 B` Brotli. It has not been released or activated on Pilot.

Timesheet is the sixteenth production-integrated scenario and the second dense planning
proof. Its adapter accepts the completed legacy read model; browser QA proves
exact 76-employee parity across 96 rows and 35 columns on canonical System
Domains, default legacy, table-owned overflow, unchanged state and direct
legacy editor fallback. Its bundled artifact is `201,559 B` raw / `63,358 B`
gzip / `54,518 B` Brotli. It has not been released or activated on Pilot and
moves no attendance or schedule command.

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

1. Finish the isolated lab and component contract. **Complete for Nomenclature, Component Types, Operations, Nomenclature Types, Statuses, Boards/BOM, all seven Structure sidebar destinations, Roles/Access, Weekly Production Control, Timesheet, Planning Workbench, Shift Work Orders, Shift Master Board, Employee Desktop, Contour Admin, Specifications 2.0 and Gantt read-only proofs.**
2. PostgreSQL root rollout and final authenticated audit. **Complete at `fc71e01`.**
3. Rebase this branch onto the accepted PostgreSQL/main commit. **Complete at `fc71e01`; zero conflicts.**
4. Replace fixtures with read-only runtime payload adapters. **Complete locally for Nomenclature, Directories Component Types, Operations, Nomenclature Types and Statuses using current runtime projections; for Structure Employees, Structure Positions, Structure Org Units, Structure Work Centers, Structure Equipment, Structure Responsibility Policies, Roles/Access and Timesheet using PostgreSQL-hydrated System Domains; for Planning Workbench using the PostgreSQL list/detail bootstrap; for Shift Work Orders and Shift Master Board using the complete PostgreSQL Shift Execution projection; for Specifications 2.0 using the fingerprint-matched published revision read model; and for Gantt using runtime-owned PostgreSQL-backed geometry. No fixture reaches production.**
5. Mount React islands behind disabled-by-default feature flags. **Complete for Nomenclature, Structure Employees, Structure Positions, Structure Org Units, Structure Work Centers, Structure Equipment, Structure Responsibility Policies, Structure Migration Diagnostics, Boards/BOM, Roles/Access, Directories Component Types, Operations, Nomenclature Types, Statuses, Weekly Production Control, Timesheet, Planning Workbench, Shift Work Orders, Shift Master Board, Employee Desktop, Contour Admin, Specifications 2.0 and Gantt; each requires two explicit runtime flags plus a session request, and every unsupported/write scope falls back to legacy.**
6. Run legacy parity, functional, visual, performance, and pilot checks. **Local parity, non-empty production-shell functional QA, visual checkpoint and bundle budgets pass; authenticated Pilot acceptance remains pending.**
7. Only then propose default-on activation or the next integrated registry scope.

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
