# Phase 6 Runtime Decomposition Result

## 1. Summary

Phase 6 moved the first real runtime layer out of `src/app.js`: shared UI render helpers, pure HTML/class/tone helpers, two contract groups, one safe module renderer and two UI CSS component families. The project now has boundary and render smoke checks, so future extraction is protected by scripts instead of memory.

## 2. Baseline

- Branch: `main`
- `src/app.js` line count before Phase 6: `39 294`
- Baseline QA: build, UI, CSS, architecture, functional, UI regression and Gantt QA were green before extraction.
- Dirty workspace existed before Phase 6; unrelated files were not reverted.

## 3. New Structure

```text
src/ui/
  html.js
  components.js
  contracts/
    runtime-contracts.js
    hardening-plan-contracts.js

src/modules/
  dispatch/
    render.js

styles/ui/
  actions.css
  status.css
```

## 4. Extracted UI Helpers

| helper | old location | new file | output compatibility | tests |
| --- | --- | --- | --- | --- |
| `renderUiPanelHead` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiPanel` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiPanelBody` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiPanelFooter` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiEmptyState` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiStatusToken` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiActionButton` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiActionBar` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiToolbar` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiFilterBar` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiSidebarItem` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiModuleSidebar` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiModulePage` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiModuleHeader` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiTableWrap` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiFormField` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiDropdownFrame` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiModalFrame` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiModalShell` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiDrawerFrame` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiDrawerShell` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |
| `renderUiGanttBar` | `src/app.js` | `src/ui/components.js` | same marker/class contract | `qa:ui:helpers` |

## 5. Extracted Contracts

| contract group | old location | new file | compatibility entrypoint |
| --- | --- | --- | --- |
| Runtime module coverage lists and notes | `src/ui_runtime_contracts.js` | `src/ui/contracts/runtime-contracts.js` | re-exported by `src/ui_runtime_contracts.js` |
| UI hardening plan stages | `src/ui_runtime_contracts.js` | `src/ui/contracts/hardening-plan-contracts.js` | re-exported by `src/ui_runtime_contracts.js` |

## 6. Extracted Pure Helpers

- `escapeHtml`
- `escapeAttribute`
- `joinUiClasses`
- `isKnownUiSignalTone`
- `normalizeUiTone`

All are now in `src/ui/html.js` and are covered by `scripts/ui-render-helper-smoke.mjs`.

## 7. Extracted Modules

| module | old function(s) | new file | wrapper kept | event selectors preserved | smoke status |
| --- | --- | --- | --- | --- | --- |
| `dispatch` | `renderDispatchPage` | `src/modules/dispatch/render.js` | yes, `PHASE-6-COMPAT` | no module-specific event selectors | passed |

## 8. Event Handler Boundaries

Event delegation was not moved. `docs/event-handler-boundary-map.md` documents which modules are safe to move and which are blocked by selectors/state.

## 9. CSS Decomposition

| family | old file | new file |
| --- | --- | --- |
| ActionButton contract styles | `styles/mes-ui-core.css` | `styles/ui/actions.css` |
| StatusToken contract styles | `styles/mes-ui-core.css` | `styles/ui/status.css` |

`styles.css` remains manifest-only and `scripts/css-layer-audit.mjs` now validates the UI CSS imports explicitly.

## 10. Boundary Audit

- Script: `scripts/module-boundary-audit.mjs`
- Command: `npm run qa:boundaries`
- Rules: UI cannot import modules/app, contracts cannot import render modules, modules cannot import app, Gantt cannot import modules, simple cycle detection.
- Status: passed.

## 11. Render Helper Smoke

- Script: `scripts/ui-render-helper-smoke.mjs`
- Command: `npm run qa:ui:helpers`
- Checks: escaping, class join, tone normalization, ActionButton, StatusToken, Panel, TableWrap, FormField, Dropdown, Modal, Drawer, EmptyState, GanttBar.
- Status: passed.

## 12. Module Smoke

- Script: `scripts/extracted-module-render-smoke.mjs`
- Command: `npm run qa:modules:extracted`
- Checks: `dispatch` returns non-empty hard-v1 ModulePage with Panel marker and no `undefined`/`[object Object]`.
- Status: passed.

## 13. `src/app.js` Reduction

- Before Phase 6: `39 294` lines.
- After current Phase 6 extraction: `38 987` lines.
- Delta: `-307` lines.
- Render UI helpers remaining in `src/app.js`: only app-specific `renderUiAppShell` and `renderUiPresetMenuGroup`.

## 14. Compatibility Wrappers

See `docs/phase-6-compat-wrappers.md`.

## 15. QA Results

| command | status | notes |
| --- | --- | --- |
| `node scripts/app-runtime-map.mjs` | passed | 1699 functions mapped |
| `npm run qa:syntax` | passed | includes new files |
| `npm run qa:boundaries` | passed | 17 JS files checked |
| `npm run qa:ui:helpers` | passed | helper output smoke |
| `npm run qa:modules:extracted` | passed | dispatch smoke |
| `npm run qa:css` | passed | manifest-only with UI CSS imports |
| `npm run qa:ui` | passed | updated to scan `src/ui/*`, `src/ui/contracts/*`, `styles/ui/*` |
| `npm run qa:architecture` | passed | includes new boundary audit |
| `npm run build` | passed | static dist generated |
| `git diff --check` | passed | no whitespace errors |
| `for f in scripts/*.mjs; do node --check "$f"; done` | passed | all script syntax checked |
| `node --check src/app.js && node --check src/ui_runtime_contracts.js` | passed | plus new UI/module files |
| `npm run qa:functional` | passed | full browser-backed functional suite |
| `npm run qa:ui:regression` | passed | 100 checks, 0 failed, 11 warnings |
| `npm run qa:gantt` | passed | 15 geometry, 15 scale, 5 overlay checks; 0 failures |

## 16. Remaining Risks

- Most module renderers still live in `src/app.js`.
- Gantt, auth/session, timesheet, production matrix, planning labor and print runtime are intentionally not moved.
- `styles/mes-ui-core.css` remains large and still owns many cross-module contracts.
- Event selectors are still mostly implicit in `src/app.js`.

## 17. Next Tasks

1. Extract `nomenclature` table-only render helpers with selector smoke.
2. Extract directory table renderer after modal selector audit.
3. Move more contract registries from `src/ui_runtime_contracts.js`.
4. Split ActionButton/StatusToken helpers from `components.js` into family files if imports stay acyclic.
5. Add event-handler selector audit that renders static module HTML and compares registered selectors.
