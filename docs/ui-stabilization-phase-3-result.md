# UI Stabilization Phase 3 Result

## 1. Summary

Phase 3 выполнена как кодовая консолидация UI-contract, а не как документация или редизайн.

Сделано:

- добавлен машинный coverage report по 20 модулям: `scripts/ui-contract-coverage-report.mjs`;
- добавлен DOM/layout regression smoke по 10 ключевым модулям и 3 viewport categories: `scripts/ui-module-regression-smoke.mjs`;
- добавлены runtime helpers `renderUiToolbar()` и `renderUiFilterBar()`;
- `Toolbar` и `FilterBar` внесены в `src/ui_runtime_contracts.js`, `styles/mes-ui-core.css` и `scripts/ui-contract-qa.mjs`;
- безопасно мигрированы зоны Nomenclature, Products, Routes, Directories, Timesheet, Planning/SZN/Supply/Gantt status strip;
- `products` получил `ModuleHeader` и `EmptyState` contract в пустом состоянии;
- VisualSystem обновлен живыми helper-based примерами Toolbar/FilterBar/ActionBar/TableWrap/StatusToken;
- удален superseded legacy CSS block `Enterprise Industrial Data-Dense UI`;
- compatibility CSS-only debt снижен до 0;
- duplicate selector groups снижены с 448 до 348.

## 2. Baseline

- branch: `main`
- baseline status: dirty worktree уже был до Phase 3, unrelated changes не откатывались.
- baseline build: `npm run build` passed.
- baseline `npm run qa:ui`: passed.
- baseline `npm run qa:css`: duplicate selector groups 448, rules 5422.
- baseline `npm run qa:architecture`: passed.
- baseline `npm run qa:functional`: passed.
- baseline UI runtime class audit: CSS-only runtime classes 7, compatibility CSS-only classes 7/8 printed names.
- baseline raw token audit: hex 2035, unique hex 280, `!important` 3128, font-size px 845.

## 3. UI contract coverage

Report files:

- `docs/ui-contract-coverage-report.md`
- `reports/ui-contract-coverage.json`

After Phase 3:

| module | status after | notes |
| --- | --- | --- |
| gantt | special-runtime | `gantt-v1: GanttRuntime`; geometry not changed |
| planning | contract | ModulePage, Header, Panel, TableWrap, ActionButton, StatusToken |
| dispatch | partial | placeholder-like module; missing ModuleHeader/ActionBar |
| shiftMasterBoard | contract | working board shell covered |
| authSessionPrototype | contract | workspace contract covered |
| shiftWorkOrders | partial | empty-state state covered; selected table state remains special/next pass |
| matrix | contract | table/runtime contract covered |
| routes | contract | header actions migrated to ActionButton helper |
| products | contract | ModuleHeader + EmptyState added |
| nomenclature | contract | FilterBar + TableWrap + StatusToken migrated |
| productionStructureMatrix | contract | table/runtime contract covered |
| employees | partial | placeholder/legacy shell section; missing ModuleHeader |
| timesheet | partial | special dense calendar; Toolbar/FilterBar added, ModuleHeader still absent |
| roles | contract | table/runtime contract covered |
| directories | contract | header actions migrated to ActionButton helper |
| visualSystem | special-runtime | `visual-system-v1: VisualSystemRuntime`; live helper examples updated |
| authPrototype | contract | auth flow remains hard runtime |
| planningTable | contract | table/runtime contract covered |
| supply | contract | status token migration in panel action |
| shopMap | contract | runtime covered |

Summary after:

- contract: 14
- special-runtime: 2
- partial: 4
- legacy: 0
- unknown: 0

## 4. Migrated modules

### Nomenclature

- functions: `renderNomenclatureSectionFilter`, `renderNomenclatureTable`, `renderSpekiWorkspace` indirectly shares product shell helpers.
- helpers added: `renderUiFilterBar`, `renderUiTableWrap`, `renderUiEmptyState`, `renderUiStatusToken`.
- preserved data attributes: `data-nomenclature-pane`, `data-nomenclature-type-filter`, `data-nomenclature-row-open`, `data-nomenclature-row-delete`.

### Products

- functions: `renderSpekiWorkspace`, `renderSpekiStructureTable`.
- helpers added: `renderUiModuleHeader`, `renderUiEmptyState`.
- fixed coverage gap: empty state now has `data-ui-component="EmptyState"`.

### Routes

- function: `renderRoutesPage`.
- helpers added: `renderUiActionButton` for print preview and work-order creation actions.
- preserved data attributes: `data-route-print-preview`, `data-route-to-planning`, `data-route-delete`.

### Directories

- function: `renderDirectoryPage`.
- helpers added: `renderUiActionButton` for refresh/reset/delete/add actions.
- preserved data attributes: `data-directory-refresh`, `data-directory-clear-filters`, `data-delete-directory-selected`, `data-add-directory`.

### Timesheet

- function: `renderTimesheetPage`.
- helpers/markers added: `Toolbar`, `FilterBar`, `StatusToken`.
- preserved data attributes: `data-timesheet-view`, `data-timesheet-period-nav`.

## 5. Toolbar/FilterBar/ActionBar

Created/strengthened:

- `renderUiToolbar({ body, className, attributes })`
- `renderUiFilterBar({ body, className, attributes })`
- CSS contract in `styles/mes-ui-core.css`: wrap, gap, min-height, min-width.
- component registry entries in `src/ui_runtime_contracts.js`.
- QA guardrails in `scripts/ui-contract-qa.mjs`.

Applied to:

- Nomenclature type filter.
- Timesheet view switch and period controls.
- VisualSystem live helper examples.
- Existing form actions in Nomenclature/BOM/Routes now carry `ActionBar` marker.

## 6. Status/Badge consolidation

Patterns migrated or tokenized:

- `planning-order-state-token` render points now use `renderUiStatusToken(...)` while keeping compatibility class.
- concrete `shiftWorkOrders` SZN rows use `renderUiStatusToken(...)`.
- `supply-status-pill` now uses `renderUiStatusToken(...)`.
- Gantt topbar status strip now uses `renderUiStatusToken(...)`.
- Timesheet "Рабочий календарь" signal now uses `renderUiStatusToken(...)`.

Exceptions:

- `shift-work-orders-group-status` remains a quiet text marker, not a colored `StatusToken`: grouping rows must not compete visually with concrete SZN statuses.
- Gantt `deadline-badge` and `slot-quantity-badge` remain special geometry/status labels. They are tied to slot rendering and were not changed.
- section icon badges (`speki-section-icon-badge`, `route-type-icon-badge`) remain domain/category icons, not generic statuses.

## 7. Duplicate selector pressure

Before:

- rules: 5422
- duplicate selector groups: 448
- largest duplicate selector group: 12
- exact duplicate rules: 0

After:

- rules: 5136
- duplicate selector groups: 348
- largest duplicate selector group: 12
- exact duplicate rules: 0

Delta:

- rules: -286
- duplicate selector groups: -100
- threshold met: more than 10% reduction.

Changed CSS files:

- `styles/layers/10-shell-directory-gantt-base.css`
- `styles/layers/60-operational-modules.css`
- `styles/layers/70-planning-table-and-matrix.css`
- `styles/layers/80-visual-system-ui-states.css`
- `styles/mes-ui-core.css`

Reduced families:

- disabled/removed superseded `Enterprise Industrial Data-Dense UI` block;
- removed dead `directory-actions`;
- removed dead `kpi-row`;
- removed dead planning compatibility rules: `planning-detail-disclosure`, `planning-editable-panel`, `planning-order-actions`, `planning-order-map-head`, `planning-panel-head`, `planning-result-panel`.

## 8. Regression smoke / manual-check reduction

New script:

- `scripts/ui-module-regression-smoke.mjs`

Connected to:

- `qa:syntax`
- `qa:functional:inner`
- standalone: `npm run qa:ui-regression`

Modules covered:

- `gantt`
- `planning`
- `shiftWorkOrders`
- `routes`
- `products`
- `nomenclature`
- `directories`
- `timesheet`
- `productionStructureMatrix`
- `shiftMasterBoard`

Assertions:

- app shell exists;
- header exists and has usable bounds;
- main content exists and has usable bounds;
- no blank screen;
- no runtime error text;
- no body horizontal overflow;
- table modules have `TableWrap` or `EmptyState`;
- no double overlay risk;
- action buttons exist where expected.

After run:

- checks: 30
- failed: 0
- report: `docs/ui-module-regression-smoke-report.md`
- json: `reports/ui-module-regression-smoke.json`

## 9. Mobile/tablet overflow guard

Viewports:

- desktop: `1710x1112`
- tablet: `1180x900`
- narrow: `820x900`

Guard checks:

- body horizontal overflow;
- shell/header/main bounds;
- table/empty contract;
- overlay count;
- action presence.

Result:

- 30 checks passed.
- No body horizontal overflow detected in checked modules.

Remaining exception:

- This is DOM/layout smoke, not mobile redesign and not pixel-perfect visual QA.

## 10. Overlay contract

Coverage report tracks:

- `Modal`
- `Drawer`
- `Dropdown`

Regression smoke tracks:

- `.modal-backdrop`
- `.ui-modal`
- `.ui-drawer`
- double overlay risk.

Migrated in this phase:

- no risky live overlay DOM was rewritten.

Exceptions:

- Gantt overlays and print previews stay special/sensitive; no geometry or print DOM changed.

## 11. Compatibility debt

Before:

- compatibility CSS-only classes: 7/8 printed names.

After:

- compatibility CSS-only classes: 0.
- unexpected runtime CSS-only classes: 0.

Removed/migrated:

- `directory-actions`
- `kpi-row`
- `planning-detail-disclosure`
- `planning-editable-panel`
- `planning-order-actions`
- `planning-order-map-head`
- `planning-panel-head`
- `planning-result-panel`

## 12. VisualSystem

Updated live helper examples:

- `renderUiPanel`
- `renderUiPanelBody`
- `renderUiPanelFooter`
- `renderUiFormField`
- `renderUiDropdownFrame`
- `renderUiModalFrame`
- `renderUiDrawerFrame`
- `renderUiGanttBar`
- `renderUiStatusToken`
- `renderUiDemoBadge`
- `renderUiToolbar`
- `renderUiFilterBar`
- `renderUiActionBar`
- `renderUiTableWrap`

Remaining mock/demo examples:

- selected-row variants and Gantt visualization variants remain intentionally visual samples, because they compare design alternatives rather than production data.

## 13. QA results

| command | status | notes |
| --- | --- | --- |
| `node --check src/app.js` | pass | syntax ok |
| `node --check src/ui_runtime_contracts.js` | pass | syntax ok |
| `npm run qa:syntax` | pass | includes new Phase 3 scripts |
| `for f in scripts/*.mjs; do node --check "$f"; done` | pass | all `.mjs` scripts syntax checked |
| `node --check scripts/ui-contract-coverage-report.mjs` | pass | syntax ok |
| `node --check scripts/ui-module-regression-smoke.mjs` | pass | syntax ok |
| `npm run build` | pass | fresh dist generated |
| `npm run qa:ui` | pass | compatibility CSS-only classes 0 |
| `npm run qa:css` | pass | duplicate selector groups 348 |
| `npm run qa:architecture` | pass | flow/ui/legacy/css/structure passed |
| `npm run qa:module-smoke` | pass | 29 registered modules render |
| `npm run qa:functional` | pass | full functional suite passed |
| `npm run qa:ui-contract-coverage` | pass | 20 modules explicit |
| `npm run qa:ui-regression` | pass | 30 layout checks |
| `git diff --check` | pass | whitespace ok |

## 14. Remaining risks

- `dispatch`, `employees`, `timesheet`, `shiftWorkOrders` still report `partial` in the coverage report because their visible state misses ModuleHeader and/or table/status markers.
- `shiftWorkOrders` coverage depends on current state: selected/tree table states can expose more components than an empty journal state.
- `gantt` remains special runtime by design; it should be migrated only through Gantt guardrails, not generic ModulePage.
- Large raw-token debt remains in historical CSS layers, although Phase 3 reduced totals.
- Regression smoke is DOM/layout invariant coverage, not visual design approval.

## 15. Next recommended tasks

1. Convert `shiftWorkOrders` selected/tree state to consistently expose `ModuleHeader`, `TableWrap`, and `StatusToken`.
2. Add opened-state smoke for a real modal, drawer, dropdown and print preview.
3. Migrate `timesheet` hero/header into `renderUiModuleHeader` or document it as special dense-calendar runtime.
4. Continue CSS consolidation by removing the next superseded shell generation from `30-module-shell-ui-foundations.css`.
5. Add a budget ratchet: fail if duplicate selector groups rise above 348 or compatibility classes above 0.
