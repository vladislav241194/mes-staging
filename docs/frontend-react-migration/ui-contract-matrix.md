# MES React UI contract matrix

Date: 2026-07-19
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

This matrix converts the existing HTML renderer contracts into React component
boundaries. It does not declare every legacy visual difference correct. Each
difference must be classified before migration as shared, process-specific, or
unresolved.

## Shared contracts

| Legacy renderer / marker | React boundary | Invariant | Allowed variation |
| --- | --- | --- | --- |
| `renderUiModulePage` / `ModulePage` | `ModulePage` | One semantic page root and one workspace | Layout family and protected mode |
| `renderUiModuleHeader` / `ModuleHeader` | `ModuleHeader` | Eyebrow, title, description/actions slots | Standard, special, absent |
| `renderUiModuleSidebar` / `ModuleSidebar` | `ModuleSidebar` | Named navigation/filter region | Required or absent; width by family |
| `renderUiSidebarItem` / `SidebarItem` | `SidebarItem` | Button semantics, active state, optional count | Registry, tree, filter variants |
| `renderUiPanel` / `Panel` | `Panel` | Header/body separation and stable surface | Density and process-specific content |
| `renderUiTableWrap` / `TableWrap` | `TableWrap` | Horizontal overflow owner and table semantics | Dense, standard, print |
| `renderUiStatusToken` / `StatusToken` | `StatusToken` | Text plus semantic tone; color is not the only signal | Domain-specific labels mapped to shared tones |
| `renderUiActionButton` / `ActionButton` | `ActionButton` | Native button state, focus, disabled reason | Primary, secondary, danger, compact |
| `renderUiSystemState` / `SystemState` | `SystemState` | Explicit loading, empty, error and unavailable states | Message and recovery action |
| `renderUiModalFrame` and modal renderers | `ModalOverlay` | Labelled dialog, initial focus, Tab containment, Escape/backdrop close and focus restoration | Size and domain content |

## Module-family decisions

| Family | Shared | Remains specialized | First proof |
| --- | --- | --- | --- |
| Registry/sidebar | Page, header, sidebar, filters, panel, table, metric grid, action, selectable row, detail panel, status | Entity-specific columns and detail fields | Nomenclature + Component Types + Structure Employees + Roles read-only scenarios |
| Registry/process composition | Page, header, sidebar list, panel, table overflow, action boundary, detail panel, status, typed metadata editor, usage-aware delete confirmation | BOM component summary, nine-column editable import table, board selection semantics, bounded quantity editor and row action | Boards/BOM read plus metadata create/edit/delete, all nine cell edits and row deletion |
| Dense planning | Header, sidebar, toolbar, metrics, panel, table overflow, status, loading/error, bounded typed form | Dense grids, hierarchy, calendar and planning calculations | Weekly Production Control read-only + Timesheet day fact + Planning Workbench quantity |
| Operational | Status, action, panel, table tree, metric grid, `ModalOverlay`, bounded quantity/fact forms, read-only attachment overlay, lazy print-preview shell, owner-backed board date/master/focus, carryover navigation and typed transfer | Manual lane movement and specialized worker fact entry | Shift Work Orders document journal plus Shift Master Board date/master/assignment/fact/carryover/transfer/SZN lifecycle |
| Protected canvas | Published tree inspection and Gantt schedule/passport selection | Gantt dependencies/drag/resize and Specifications editors/commands | Runtime-owned geometry and immutable revisions first; editors migrate last with dedicated guardrails |
| Admin/standalone | Contour controls, organizational picker and local-only PIN form | Session authority and standalone shell | Separate security acceptance path |

## Difference classification

- **Shared:** same user meaning and behavior. Implement once.
- **Process-specific:** same primitive, different composition required by the
  manufacturing workflow. Keep a named specialized component.
- **Unresolved:** two legacy implementations disagree and neither is approved.
  Do not encode both as permanent React variants; select a target during the
  module acceptance pass.

The lab now implements `ModulePage`, `ModuleHeader`, `ModuleSidebar`,
`SidebarItem`, `Panel`, `TableWrap`, `MetricGrid`, `MetricCard`, `ActionButton`,
`SelectableRow`, `DetailPanel`, `EmptyState`, `SystemState`, `StatusToken`, and
the accessible `ModalOverlay` and `DeleteConfirmation`. Repeated async command
state now uses one typed `useCommandRunner` contract instead of per-module
loading/error forks.
Nomenclature, Component Types, Boards/BOM and Structure Employees use the same
primitives; entity-specific columns, filters, summaries, and detail fields
remain inside their scenario. Write
actions stay disabled until an accepted API contract is connected.

## Nomenclature read-model evidence

The legacy source stores positions under `directoryState.nomenclature` with
`id`, `name`, `article`, `type`, `package`, `unit`, `manufacturer`,
`description`, and a Russian status label. Filter options are separate rows in
`directoryState.nomenclatureTypes`; inactive rows (`Отключен`, `Удален`,
`Архив`) are excluded. The React adapter mirrors this shape, normalizes legacy
REA aliases to `РЭА компоненты`, and infers only missing type definitions.

The first React table therefore keeps the legacy visible columns:
`Наименование`, `Артикул`, `Раздел`, `Корпус`, `Ед.`, `Производитель`, and
`Статус`. This prevents the migration lab from inventing a narrower data model.

The write-parity boundary reuses the same nine-field editor contract for
create/edit and the same usage-aware confirmation contract for delete. Typed
callbacks contain only normalized field values or the selected stable ID; the
host validates and delegates to the existing `products/events` command owner.
Read-only activation still exposes no command. Delete clears the same BOM and
specification references as legacy and waits for the shared-state write before
reporting success.

## Component Types read-model evidence

The second proof mirrors `directoryState.componentTypes`: `id`, `name`,
`package`, `family`, `coefficient`, `placementsPerHour`, `setupSeconds`,
`defaultCount`, and the Russian status label. The table keeps all eight legacy
columns from `getDirectoryData("componentTypes")` and groups the sidebar by the
existing `family` value rather than adding a new domain field.

This second implementation is the reuse gate for the registry family. Both
screens share page/header/sidebar/panel/action/table/keyboard-row/detail/status
behavior. A difference is allowed only in entity columns and entity-specific
detail fields; it is not encoded as a new visual variant by default.

## Nomenclature scope boundary

The legacy Nomenclature sidebar composes two different domains: ordinary
nomenclature type filters and a `Печатные платы` action that opens the embedded
Boards/BOM pane. The React item-list scenario keeps this distinction:

- ordinary types filter the typed nomenclature payload;
- the Boards badge counts `bomLists`;
- selecting Boards requests legacy through the feature gate;
- Boards must pass its separate vertical acceptance before React can own that
  pane in production.

This is classified as process-specific composition, not a `SidebarItem` visual
variant and not permission to reinterpret Boards as a nomenclature filter.

Boards/BOM is now the third production-integrated, disabled-by-default island.
It uses the common host lifecycle and shared registry primitives, but retains
its process-specific metric grid, nine-column table, board-selection semantics,
independent runtime flags and explicit return to the Nomenclature items pane.

## Boards/BOM read-model evidence

The isolated Boards adapter mirrors `directoryState.bomLists` and preserves the
legacy dual representation: imported `importRows` are authoritative when
present; the old eight component-count fields remain the fallback for older
saved boards. Imported rows keep all nine A:I values and the current package/
quantity normalization semantics. The sidebar badge remains the sum of
component quantities only when rows exist.

The board list reuses the shared `SidebarItem` with optional metadata. The BOM
summary and nine-column table are process-specific composition inside the
shared `Panel` and `TableWrap`; they are not promoted to universal registry
variants. Board identity create/edit/delete now reuses the shared form/action/
confirmation contracts and existing command owner. The bounded quantity form
and eight text inputs delegate to the existing `updateBomImportCell` owner
after the host rechecks the complete expected row, exact column allowlist and
nonnegative integer where applicable. Text inputs commit on blur/Enter and
accept the complete owner-normalized row back. A bounded select exposes only
host-projected eligible Nomenclature and sends the complete expected table to
`addNomenclatureToBom`; it remains available on an empty saved board and
preserves selection across authoritative rerender. A separate
row action carries the full expected table into an accessible confirmation;
the host rechecks every row before delegating to `deleteBomImportRow` and reads
the remaining owner projection back. Independently addressable Nomenclature is
retained. The host supplies the
owner-calculated delete-usage projection; React never reimplements
Specifications linkage. Delete clears only the selected board references,
retains the independent Nomenclature result and leaves Planning unchanged.
The compact file action is enabled only by exact `bomImport`; it sends the
original browser `File` through the typed host boundary and never parses XLSX in
React.

## Structure Employees read-model evidence

The canonical module is `productionStructureMatrix` over System Domains; the
older `employees` hierarchy screen is not treated as the target architecture.
The read-only vertical joins `employees` with the primary row from
`employmentAssignments` and resolves labels through `positions`, `orgUnits`
and `workCenters`. Stable IDs stay visible because they are the cross-module
identity contract.

Only the Employees registry is inside this React slice. The six other sidebar
destinations return through the feature gate to legacy, and editor access never
mounts the read-only island. Shared `MetricGrid`/`MetricCard` primitives now
serve both canonical structure metrics and the Boards component summary without
turning either process composition into a universal table variant.

The local command surface keeps lifecycle separate from ordinary save. Archive
and reactivation each use a selected-employee-bound two-step confirmation.
Reactivation restores the employee identity and clears `archivedAt` through the
owner but leaves the archive-closed primary assignment closed, so the UI cannot
silently create a new employment state.

## Structure Positions read-model evidence

Positions reuses the canonical Structure sidebar, metric, table, row, detail
and status contracts. Its adapter preserves 49 stable IDs and resolves category,
organization, work-center and schedule references from the same PostgreSQL
snapshot. Five table cells match legacy literally; editor commands remain a
separate protected command surface.

## Structure Org Units read-model evidence

Org Units reuses the Structure registry components while preserving the
hierarchy-specific parent reference and department/section category. All 19
stable IDs, five table cells and legacy order match the authenticated System
Domains projection. Its local command surface keeps ordinary save
lifecycle-neutral; archive and reactivation use selected-unit-bound two-step
confirmations, and restoration cannot silently change the parent hierarchy.

## Structure Work Centers read-model evidence

Work Centers reuses the same registry, metric, table, selection, detail and
status contracts. Its adapter preserves 19 stable IDs and resolves organization
and parent hierarchy from one PostgreSQL projection. Five cells and order match
legacy literally. The local editor keeps Planning/Gantt flags explicit but
removes lifecycle from ordinary save; archive/reactivate use center-bound
two-step confirmations and cannot silently rewrite hierarchy or planning flags.

## Structure Equipment read-model evidence

Equipment reuses the Structure registry contracts while preserving its own
work-center, quantity and schedule columns. All six stable IDs, five visible
cells and Russian legacy order match the authenticated PostgreSQL projection;
no scheduling or editor behavior moved into React.

## Structure Responsibility Policies read-model evidence

Responsibility Policies retains its four-column master/mode/allowed-employees/
update contract. Empty input fails closed; a temporary valid QA policy
proves literal non-empty parity without creating real records. Commands remain legacy.

## Structure Migration Diagnostics evidence

Diagnostics deliberately reuses panels, metrics, empty states, status tokens and
the table wrapper without adopting CRUD/detail contracts. It preserves 152 source
rows, six metrics and four issue groups while keeping the legacy matrix read-only.

## Weekly Production Control production evidence

Weekly Control is the first dense planning-family proof. It reuses the shared
header, panel, metric, status, table, empty-state and lifecycle contracts while
keeping its seven-day matrix specialized. The typed boundary consumes the
legacy module's completed read model, so week selection, PostgreSQL hydration,
plan/fact aggregation, reports and deviation policy remain production-owned.
The production-shell comparison proves 25 completed groups and eleven columns
in identical order and text. The shared React `TableWrap` now emits the actual
`ui-table-wrap` class plus `horizontal-only` scroll contract, closing a common
production overflow gap for every island without scenario-specific CSS.

## Timesheet production evidence

Timesheet reuses the same dense-family header, metrics, panels, status tokens
and table overflow contract while keeping its calendar cells and departmental
group rows specialized. The typed boundary consumes the completed legacy
`getTimesheetModel()` result: three fixture employees, two departments, seven
days and 21 cells retain order and values. Period, view, schedule and day
actions return to legacy, where PostgreSQL hydration, editors and commands stay
authoritative. Production-shell comparison proves identical 76 employees, 96
rows and 35 columns from one canonical PostgreSQL-backed projection. The host
is disabled by default and every interactive scope returns to legacy.

## Planning Workbench production evidence

Planning Workbench reuses the shared page, header, sidebar, metrics, panels,
status and table contracts while retaining a specialized work-order hierarchy.
The legacy module now exposes one completed read-model for PostgreSQL
list/detail projection, snapshot fallback, readiness and visible structure.
The isolated proof preserves three queue entries, five decision metrics and
four object/operation rows. Production-shell QA adds PostgreSQL bootstrap
parity for two orders and two visible hierarchy rows. Route/item selection and
the separately gated quantity form stay inside React; the host delegates
quantity to the revision-checked Planning owner, refreshes the authoritative
slot and proves legacy read-back. The host is disabled by default; dates,
labor, Gantt and cancellation stay in legacy.

## Shift Work Orders production evidence

The first operational-family proof consumes the completed legacy
`getShiftWorkOrderJournalViewModel()` boundary and normalizes only the read
projection: document packages, operations, assignments, eight table columns,
selected detail, quantities, transfer, executors and issue reports. The fixture proves two
work orders, three operations and three assignments, local selection, tree
collapse, a payload revision and React-owned report-photo, SZN print and
work-order-package overlays that close with Escape without unmounting the
island. The print views consume the existing owner package model, are split
from the base island and delegate the browser print call to the host. Workshop
requests legacy; assignment, fact and Shift Execution authority are untouched.
Production-shell QA proves the same tree density on one PostgreSQL-backed
work order, operation and assignment, default legacy, explicit read-only
session activation, both lazy previews, two host print callbacks, zero Shift
Execution commands and unchanged state.

## Shift Master Board production evidence

The second operational-family proof consumes the completed legacy
`getShiftMasterBoardModel()` boundary. It reuses OperationalPage, Panel,
MetricGrid, MetricCard, StatusToken and ActionButton while retaining the
Workshop-specific three-lane card board. The fixture proves three lanes, four
cards, seven summary/detail metrics, local card selection and an owner-backed
focus update from four to three cards. React sends only `all`, `mine`, `open` or
`attention`; the host owner rebuilds the filtered model and KPI totals. The
toolbar remains available when a focused projection is empty. The shared
`ModalOverlay` composes executor quantity and fact editors. React validates the
visible totals and defect balance; the host independently rechecks RBAC,
matrix membership, Timesheet availability and quantity bounds before the Shift
Execution owner writes PostgreSQL and refreshes the canonical projection. A
partial fact exposes the carryover quantity/date, opens the canonical
next-shift card, returns to the source task and supports a corrected fact that
cancels the exact canonical carryover. The same typed transfer contract renders
`Откуда -> Куда -> Результат`; the shared lazy SZN component stays outside the
base island, and the host preserves print-record and browser-print ownership.
The date picker sends an ISO date to the existing workbench owner and rehydrates
the requested PostgreSQL scope. The master picker is emitted only for
`admin`/`productionHead`; the host validates the current profile and returns an
owner-filtered `mine` payload. Scoped masters retain a read-only identity.
Manual lane movement returns to legacy.
Production-shell QA proves identical three-lane/one-card density from the same
PostgreSQL-backed runtime projection, default legacy, explicit read-only
activation, date navigation `19 -> 20 -> 19`, privileged master switching,
focus recovery `all -> empty open -> all`, read-only assignment
fallback, one assignment, a partial fact, canonical carryover creation,
next/source navigation, corrected fact, one canonical cancellation, typed
transfer/SZN print and unchanged fixture state. Cached dispatch-scope return now
re-renders React even when its ETag is unchanged.

## Employee Desktop production evidence

The third operational-family proof consumes the completed legacy
`getAuthSessionPrototypeModel()` boundary. It reuses ModuleHeader,
OperationalPage, Panel, MetricGrid, MetricCard, StatusToken and ActionButton
while retaining the task board, route chain and employee fact passport. The
fixture proves three assignments, seven metrics, local task selection,
owner-backed task start, quantity/deviation fact save, photo Report,
Structure/Route/PDF context and a payload update. Person switching returns to
legacy. The production host requires
PostgreSQL System Domains, complete Shift Execution coverage, two
false-by-default permissions and an explicit session request; the start command
is available only through a separate localhost write evaluation. Production-
shell QA proves one identical PostgreSQL-backed task in legacy and React,
read-only denial, one persisted transition to `В работе`, duplicate denial,
deviation validation, exactly one Shift Execution fact command, owner-model
read-back, one owner-prepared/persisted photo Report with journal-counter
read-back and unchanged intercepted test state. Report retains its existing
compatibility UI-state authority and creates no extra Shift Execution command.
The same QA proves the shared modal Tab/Escape/focus/backdrop contract and zero
writes from all three context views.
A direct module entry also hydrates the Planning PostgreSQL graph before
deriving its bounded dispatch scope.

## Contour Admin production evidence

The administrative proof consumes a completed host read model containing the
three contour passports, five rollout scenarios, iteration measurements and
safety guardrails. It reuses OperationalPage, ModuleHeader, Panel, MetricGrid,
MetricCard, TableWrap, StatusToken and ActionButton. Local contour selection
stays in React; a local-only command slice adds explicit confirmation and safe
result display for the existing backup/sync/promote/rollback Ops actions. React
does not receive shell commands, cookies, audit storage or raw output. The host
rechecks the action and the server retains authenticated `admin.mes-line.ru`,
allowlist and confirmation-token enforcement. Production-shell QA proves
default legacy, identical three-contour/five-scenario density, read-only
fallback, cancellation with zero calls and one exact mocked confirmed call.

## Specifications 2.0 production evidence

The protected-canvas proof keeps immutable revision inspection and now adds one
bounded existing-row draft editor. The legacy host derives registry summaries,
allowlisted draft fields and accepts the selected server item only when source
entry, revision number and fingerprint match PostgreSQL. React reuses
ModulePage, ModuleSidebar, Panel, MetricGrid, TableWrap, StatusToken and
ActionButton, while owning local tree collapse and form state. Production-shell
QA proves revision 7 with four hierarchy rows, default legacy, exact server
parity, one owner-backed draft save, one compatibility persistence, unchanged
published tree and zero publication, attachment or work-order API writes.

## Gantt production evidence

The Gantt proof migrates schedule inspection, local slot-passport selection and
visible dependency inspection. Scale, timeline ticks, rows, heights, slot
rectangles and dependency pairs come from the completed legacy runtime after
the PostgreSQL projection gate; React does not reproduce scheduling, calendar
or dependency rules. The canvas preserves
`GanttRuntime`, `GanttCanvas`, `GanttTimeline`, `GanttRowsLayer`, `GanttSlot`,
row and slot identity markers. Production-shell QA proves three rows, two
slots, one `Монтаж -> Контроль` dependency with a 60-minute interval, target-
slot selection, a `17.10 ms` first commit, default legacy, editor fallback and
zero Planning writes. Dependency editing, drag, resize and optimization remain
legacy.

## Authorization picker production evidence

The standalone authorization proof covers department, unit, employee and a
local-only PIN evaluation. React reuses the page/header/panel/metric/status
contracts, adds a shuffled keypad, and keeps digits solely in component memory;
the typed adapter excludes PIN, validation and session state. Production-shell
QA renders nine departments, preserves the read-only legacy PIN handoff,
rejects one PIN with four attempts left, then proves successful owner-backed
session creation for the selected employee. Neither PIN reaches storage, System
Domains writes remain zero and the console stays clean.

## Roles and Access read-model evidence

The fifth scenario consumes canonical `accessRoles`, `grants`,
`roleAssignments`, employees and employment references. It reuses the shared
page/header/sidebar/panel/table/metric/detail/status contracts, while keeping
the six-action grant matrix and assignment table process-specific. Role/module/
action visibility is executable-parity checked against the production access-
control service. Editor access, reset, role edits, grant edits, assignments and
scope commands remain legacy.

Its production host is disabled by default and additionally requires
PostgreSQL read readiness plus a per-session evaluation request. Production-
shell browser QA covers the legacy default, canonical role/module/assignment
rendering, disabled writes, unchanged state, commit telemetry, and clean
console.

## Directories Component Types production evidence

The existing Component Types proof now has a narrow production host for the
`componentTypes` section. Its eight visible cells are compared against the
actual legacy directory renderer on the same payload and order. React preserves
Russian number/unit formatting, family filtering, keyboard-capable selection,
detail context, and an explicit return to the full legacy directories list.
Create/edit/delete and every other directory section remain legacy.

## Directories Operations production evidence

Operations reuses page/header/sidebar/panel/table/row/detail/status primitives,
but keeps its own three-column contract and work-center filter. The production
runtime resolves organization semantics before the typed adapter. Browser QA
compares the exact legacy and React cells/order and proves that switching back
to the full legacy directories list cannot loop into another React island. The
shared delete confirmation presents exact Specifications usage plus loaded
Planning usage, supports byte-stable cancel and remains disabled for bundled
MES operations. Confirmed custom deletion is read back through legacy.

## Directories Nomenclature Types production evidence

Nomenclature Types reuses the same registry primitives while retaining its
four-column legacy contract and status filter. The adapter reads the runtime
projection only after legacy normalization, so the existing synchronization
from Nomenclature items and Specifications remains in the command owner rather
than React. Production-shell QA matched five normalized rows, every visible
cell and source order, then proved local RBAC-gated create/edit/delete, typed
usage disclosure, byte-stable cancellation, both rename and fallback reference
projections, legacy read-back and loop-free return to the current full legacy
section using a disposable snapshot.

## Directories Statuses production evidence

Statuses is the dense registry proof: 85 current runtime rows, seven table
columns and a fourteen-field passport. The host computes all domain-specific
lifecycle and impact text before the typed boundary. React reuses registry
primitives without turning the five-part impact composition into a universal
table variant. Its editor is deliberately narrower than the reader: it creates
or edits only user-authority rows, while system lifecycle rows have no edit
action and remain protected by the command owner.
