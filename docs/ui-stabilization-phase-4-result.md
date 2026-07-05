# UI Stabilization Phase 4 Result

## 1. Summary

Phase 4 adds an automated UI regression protection layer. It does not redesign the app and does not change business logic.

Main result: `npm run qa:ui:regression` now opens 20 main modules across 5 viewport categories and checks shell/header/content bounds, UI-contract markers, body overflow, tables, actions, overlays, Gantt guardrails and console/runtime errors.

## 2. Strategy

- Strategy: browser-based DOM/layout smoke using existing headless Chrome CDP infrastructure.
- Playwright: not added.
- Screenshot diff: not added in Phase 4 because current module state is data/date dependent; DOM/layout invariants are more stable.
- Existing runner reused: `scripts/run-with-local-server.mjs`.

## 3. Changed Files

| file | type | reason | risk |
| --- | --- | --- | --- |
| `scripts/ui-module-regression-smoke.mjs` | QA runtime | expanded to Phase 4 regression suite | medium, browser smoke |
| `src/ui_regression_exceptions.js` | registry | explicit exceptions, profiles and limited-support modules | low |
| `package.json` | scripts | added Phase 4 command aliases and syntax check | low |
| `docs/ui-phase-4-baseline.md` | docs | baseline QA map | low |
| `docs/ui-regression-strategy.md` | docs | chosen strategy | low |
| `docs/ui-regression-manual-check-reduction.md` | docs | manual-check replacement matrix | low |
| `docs/ui-qa-guide.md` | docs | how to run/extend UI QA | low |

## 4. New Scripts

| script/command | purpose | fast/slow | included in |
| --- | --- | --- | --- |
| `npm run qa:ui:regression` | full Phase 4 UI regression smoke | slow | standalone |
| `npm run qa:ui:tables` | table-focused alias of same regression suite | slow | standalone |
| `npm run qa:ui:overlays` | overlay-focused alias of same regression suite | slow | standalone |
| `npm run qa:ui:gantt` | Gantt-focused alias of same regression suite | slow | standalone |
| `npm run qa:ui-regression` | compatibility alias | slow | `qa:functional` |

## 5. Module Coverage

Modules checked: `gantt`, `planning`, `shiftWorkOrders`, `routes`, `products`, `nomenclature`, `directories`, `timesheet`, `productionStructureMatrix`, `shiftMasterBoard`, `authPrototype`, `authSessionPrototype`, `roles`, `planningTable`, `matrix`, `supply`, `shopMap`, `visualSystem`, `employees`, `dispatch`.

Coverage result: 100 checks, 0 failures, 11 warnings.

## 6. Viewports

- desktop: `1440x932`
- tablet: `1180x820`
- tablet-compact: `1024x768`
- narrow: `430x932`
- narrow-compact: `390x844`

Body overflow threshold: 16px.

## 7. Gantt Guardrails

Protected in Phase 4:

- `.gantt-shell[data-gantt-shell]`
- `.timeline-row`
- `.rows-layer`
- `.operation-slot[data-slot-id]`
- `.dependencies-layer[data-ui-component="GanttDependencyLayer"]`

Not checked until Phase 5:

- drag/resize behavior;
- dependency editing gestures;
- pixel-perfect slot geometry.

## 8. Table Regression

Checks include:

- `TableWrap` or `EmptyState`;
- non-empty headers for production tables;
- rows/empty state;
- tree markers and level markers;
- visible table action button dimensions;
- body overflow protection.

Report: `docs/ui-table-regression-report.md` and `reports/ui-table-regression.json`.

## 9. Overlay Regression

Safe overlay probes are run for:

- `routes`;
- `shiftWorkOrders`;
- `timesheet`;
- `shiftMasterBoard`;
- `authSessionPrototype` when a report action exists.

Checks include overlay root, body, close/action presence, double overlay risk and overflow.

Report: `docs/ui-overlay-regression-report.md` and `reports/ui-overlay-regression.json`.

## 10. Overflow Report

Report: `reports/ui-overflow-report.json`.

Current result: no failing body-level overflow. Warnings remain for narrow limited-support control zones in Gantt, routes and timesheet.

## 11. Manual-Check Reduction

See `docs/ui-regression-manual-check-reduction.md`.

No longer necessary to manually open all main modules just to check blank screen, missing shell/header/content, missing table wrapper, obvious body overflow, basic overlay opening or Gantt shell loss.

Still manual: visual taste, fine typography, complex Gantt interactions, print fidelity and full mobile UX.

## 12. QA Results

| command | status | notes |
| --- | --- | --- |
| `npm run build` | pass | baseline and final |
| `npm run qa:ui` | pass | static/runtime UI gates |
| `npm run qa:css` | pass | duplicate selector pressure unchanged at 348 |
| `npm run qa:architecture` | pass | architecture gates pass |
| `npm run qa:functional` | pass | includes Phase 4 regression smoke |
| `npm run qa:ui:regression` | pass | 100 checks, 0 failures, 11 warnings |
| `npm run qa:ui:tables` | pass | alias of Phase 4 regression smoke |
| `npm run qa:ui:overlays` | pass | alias of Phase 4 regression smoke |
| `npm run qa:ui:gantt` | pass | alias of Phase 4 regression smoke |
| `git diff --check` | pass | no whitespace errors |

## 13. Remaining Risks

- Narrow Gantt topbar/header is smoke-supported, not mobile-optimized.
- Narrow timesheet toolbar can overflow internally; documented as limited tablet/mobile support.
- Narrow route action bar can overflow in `390x844`; table/content still render.
- `authSessionPrototype` report overlay probe is unavailable when the current desktop has no assigned task.
- VisualSystem intentionally renders demo/sample tables; not every sample table is a production table contract.

## 14. Next Tasks

1. Add opened dropdown probe for standard dropdowns.
2. Add Phase 5 Gantt interaction smoke for safe non-mutating gestures.
3. Add print preview visual fidelity checks after print DOM stabilizes.
4. Add ratchet budgets for warning count by module/viewport.
5. Add optional stable screenshots for `nomenclature`, `directories`, `products`, `routes`, `planning` and `shiftWorkOrders`.
