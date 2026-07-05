# Internal UI Kit Map

This map is the first place to check before adding or changing UI. New UI should use a token, helper, component contract, module contract or documented exception.

## Foundations

| Area | Tokens / Contract |
| --- | --- |
| Colors and surfaces | `--mes-ui-surface-*`, `--mes-ui-text-*`, `--mes-ui-accent`, `--mes-ui-sidebar-bg` |
| Borders | `--mes-ui-border-soft`, `--mes-ui-border-default`, `--mes-ui-border-strong` |
| Typography | `--mes-ui-type-*`, `--mes-ui-line-*`, `--mes-ui-weight-*` |
| Spacing | `--mes-space-*`, `--mes-ui-density-*`, `--mes-ui-panel-*` |
| Radius | `--mes-ui-radius-*`, `--mes-radius-*`, `--mes-radius-pill` |
| Elevation | `--mes-ui-shadow-sm`, `--mes-ui-shadow-overlay`, `--mes-ui-shadow-lift` |
| Density | compact, default, touch |
| Icons | `icon(name)` through helpers; no hand-made inline SVG in new UI unless adding an icon to the registry |
| Z-index | `--mes-ui-z-dropdown`, overlay contracts |

## Components

| Component | Helper / Contract | Use |
| --- | --- | --- |
| Button | `renderUiActionButton` | All clickable actions. |
| IconButton | `renderUiActionButton({ tone: "icon" })` | Toolbar icon-only actions. |
| TableIconButton | `renderUiActionButton({ tone: "table-icon" })` | Dense table actions. |
| ActionBar | `renderUiActionBar` | Right-aligned grouped actions. |
| Toolbar | `renderUiToolbar` | Module control rows. |
| FilterBar | `renderUiFilterBar` | Filter and segmented-control rows. |
| StatusToken | `renderUiStatusToken` | Status, risk, calculation, demo, warning and error tokens. |
| Badge | `StatusToken` or explicit MES badge wrapper | Badges must use status tokens. |
| Panel | `renderUiPanel` | Standard block. |
| PanelHead | `renderUiPanelHead` | Standard block heading. |
| PanelBody | `renderUiPanelBody` | Standard block body padding. |
| PanelFooter | `renderUiPanelFooter` | Modal/panel footer actions. |
| TableWrap | `renderUiTableWrap` | Tables and tree tables; horizontal-only scroll. |
| DataTable | `TableWrap` + table contract | Dense business tables. |
| TreeTable | `TableWrap` + tree classes | Hierarchical tables. |
| FormField | `renderUiFormField` | Input/select/textarea label + hint. |
| Select | `FormField` or dropdown contract | No standalone raw select in new modules. |
| Dropdown | `renderUiDropdownFrame` | Viewport-safe dropdowns. |
| Modal | `renderUiModalFrame` / `renderUiModalShell` | Dialogs. |
| Drawer | `renderUiDrawerFrame` / `renderUiDrawerShell` | Side details. |
| EmptyState | `renderUiEmptyState` | Empty, unavailable or filtered state. |
| GanttBar | `renderUiGanttBar` | UI Kit demo and Gantt visual contract samples. |

## MES-Specific Components

| Component | Current Source |
| --- | --- |
| DepartmentBadge | Status/badge tokens, matrix/authorization patterns. |
| ResourceChip | Status/badge tokens, planning/workshop patterns. |
| OperationChip | Status/badge tokens, route/planning patterns. |
| RouteTree | TreeTable contract in routes/planning. |
| WorkOrderTree | TreeTable contract in `shiftWorkOrders`. |
| ShiftTaskCard | `shiftMasterBoard` and `authSessionPrototype` cards. |
| WorkerLoadCard | `shiftMasterBoard` load cards. |
| GanttSlot | Special runtime Gantt slot; tokens only, no geometry changes. |
| GanttDependency | Special runtime Gantt dependency layer. |
| GanttToolbar | Special runtime toolbar aligned with ActionButton/Toolbar tokens. |

## Layout

| Layout | Helper / Contract |
| --- | --- |
| AppShell | `renderUiAppShell` and `main.app-shell[data-layout="app-shell"]` |
| ModulePage | `renderUiModulePage` |
| ModuleHeader | `renderUiModuleHeader` |
| ModuleSidebar | `renderUiModuleSidebar` |
| ModuleContent | `renderUiModulePage` content slot |
| ModuleWorkspace | `renderUiModulePage` workspace slot |
| PageToolbar | `renderUiToolbar` + `renderUiActionBar` |

## Special Runtime

- `gantt`: protected by Gantt Phase 5 contract. Do not change geometry, drag, resize, scale or dependency routing through generic UI work.
- `visualSystem`: UI Kit showcase. It can show examples, but must use production helpers.

## Do Not Use In New Code

- Raw `button` without `data-ui-component="ActionButton"`.
- Table wrapper without `data-ui-component="TableWrap"`.
- Raw modal/drawer/dropdown shell without overlay contract.
- New direct colors, random px font sizes, random radius, random weights outside `styles/mes-ui-core.css`.
- New page-specific fixes in `styles/ui/kit-polish.css`.
