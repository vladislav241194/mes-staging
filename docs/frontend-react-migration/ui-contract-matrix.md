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
| modal/drawer/dropdown renderers | Overlay primitives | Focus ownership, close behavior, labelled frame | Size and domain content |

## Module-family decisions

| Family | Shared | Remains specialized | First proof |
| --- | --- | --- | --- |
| Registry/sidebar | Page, header, sidebar, filters, panel, table, metric grid, action, selectable row, detail panel, status | Entity-specific columns and detail fields | Nomenclature + Component Types + Structure Employees + Roles read-only scenarios |
| Registry/process composition | Page, header, sidebar list, panel, table overflow, action boundary, detail panel, status | BOM component summary, nine-column import table, board selection semantics | Boards/BOM read-only scenario |
| Dense planning | Header, sidebar, toolbar, metrics, panel, table overflow, status, loading/error | Dense grids, hierarchy, calendar and planning calculations | Weekly Production Control + Timesheet + Planning Workbench read-only scenarios |
| Operational | Status, action, panel, table tree, metric grid, overlay frames | Workshop board, worker fact entry, print/photo commands | Shift Work Orders read-only document journal |
| Protected canvas | Shell-level states only | Gantt geometry and Specifications tree/editor | Late migration with dedicated guardrails |
| Admin/standalone | Buttons, panels, states | Security perimeter and standalone shell | Separate acceptance path |

## Difference classification

- **Shared:** same user meaning and behavior. Implement once.
- **Process-specific:** same primitive, different composition required by the
  manufacturing workflow. Keep a named specialized component.
- **Unresolved:** two legacy implementations disagree and neither is approved.
  Do not encode both as permanent React variants; select a target during the
  module acceptance pass.

The lab now implements `ModulePage`, `ModuleHeader`, `ModuleSidebar`,
`SidebarItem`, `Panel`, `TableWrap`, `MetricGrid`, `MetricCard`, `ActionButton`,
`SelectableRow`, `DetailPanel`, `EmptyState`, `SystemState`, and `StatusToken`.
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
variants. The actual legacy action column and editable inputs remain protected
by editor fallback.

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
Domains projection; no editor behavior moved into React.

## Structure Work Centers read-model evidence

Work Centers reuses the same registry, metric, table, selection, detail and
status contracts. Its adapter preserves 19 stable IDs and resolves organization
and parent hierarchy from one PostgreSQL projection. Five cells and order match
legacy literally; planning, Gantt and editor commands remain outside React.

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
parity for two orders and two visible hierarchy rows. The host is disabled by
default; all selection and command scopes return to legacy.

## Shift Work Orders isolated evidence

The first operational-family proof consumes the completed legacy
`getShiftWorkOrderJournalViewModel()` boundary and normalizes only the read
projection: document packages, operations, assignments, eight table columns,
selected detail, quantities, transfer and executors. The fixture proves two
work orders, three operations and three assignments, local selection and tree
collapse, plus a payload revision. Print, package, photo and Workshop actions
request legacy; assignment, fact and Shift Execution authority are untouched.
Production integration remains a separate gate.

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
to the full legacy directories list cannot loop into another React island.

## Directories Nomenclature Types production evidence

Nomenclature Types reuses the same registry primitives while retaining its
four-column legacy contract and status filter. The adapter reads the runtime
projection only after legacy normalization, so the existing synchronization
from Nomenclature items is preserved rather than duplicated. Production-shell
QA matched five normalized rows, every visible cell and source order, and
proved loop-free return to the current full legacy section.

## Directories Statuses production evidence

Statuses is the dense registry proof: 85 current runtime rows, seven table
columns and a fourteen-field passport. The host computes all domain-specific
lifecycle and impact text before the typed boundary. React reuses registry
primitives without turning the five-part impact composition into a universal
table variant.
