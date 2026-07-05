# Visual Regression Repair Baseline

Generated: 2026-07-05 12:30 MSK

## Scope

Corrective Phase A.5 checks visual regressions introduced or exposed by the recent UI/CSS consolidation. This pass does not start Phase B and does not change Gantt geometry, business logic, table data contracts, or module DOM structure.

## Start State

- `git status --short`: dirty worktree from Corrective Phase A; key changed areas are CSS layers, UI QA scripts, runtime contracts, `src/app.js`, generated QA reports.
- `git diff --stat`: 50 files changed, 474 insertions, 1205 deletions before A.5 repair changes.
- Legacy tail size: `styles/layers/99-legacy-overrides-tail.css` = 3961 lines.
- Extracted planning order layer: `styles/ui/planning-order.css` = 715 lines.
- Runtime safety layer: `styles/ui/runtime-safety.css` = 169 lines.

## Baseline Commands

| Command | Status | Notes |
| --- | --- | --- |
| `npm run build` | pass | dist generated with `src/app.js?v=952cf1c9039d-v.1.491` |
| `npm run qa:ui` | pass | UI contracts, runtime coverage, raw token, table, Gantt inline style, UI kit gates passed |
| `npm run qa:css` | pass | duplicate selector groups 349, exact duplicate rule groups 0, broad layout `!important` 0 |
| `npm run qa:architecture` | pass | legacy warnings only for allowed `projectId`/`batchId` compatibility aliases |
| `npm run qa:functional` | pass | module smoke 29 modules, planning labor, shift board, timesheet, Gantt, auth, roles, boot all passed |
| `npm run qa:ui:regression` | pass with warnings | 100 checks, 0 failed, 11 warnings |
| `npm run qa:visual` | pass | MacBook Air 15: 48/48 modules/open states passed |
| `git diff --check` | pass | no whitespace errors |

## Regression Warnings

The baseline has no failed visual checks. Warnings are limited to narrow viewport and optional overlay probe states:

- `gantt`, narrow and narrow-compact: header bounds limited on narrow viewport.
- `timesheet`, narrow and narrow-compact: action zone overflow in `div.timesheet-controls.ui-toolbar`.
- `routes`, narrow-compact: action zone overflow in `div.module-form-actions.full.ui-action-bar`.
- `authSessionPrototype`, overlay probe: issue-report modal trigger is not present in current empty state.

These warnings are outside the requested MacBook-only repair surface and are not treated as A.5 regressions.

## Suspect Modules

| Module | Risk Surface | Baseline Result |
| --- | --- | --- |
| `gantt` | topbar, timeline, slots, dependencies, modal editor | pass; protected by Gantt Phase 5 smoke |
| `planning` | newly extracted `planning-order.css`, table tree, detail panel | pass; no overflow/text/inset issues on visual QA |
| `shiftWorkOrders` | document tree table, detail panel, print modal | pass; print overlay probe pass |
| `routes` | route tree table, labor drawer, print modal | pass on desktop/tablet; narrow-compact action-zone warning |
| `products` | module sidebar/header after shell normalization | pass |
| `nomenclature` | table wrapper and detail panel | pass |
| `directories` | table wrapper, filter dropdown | pass |
| `timesheet` | dense calendar table, day editor modal | pass on MacBook/tablet; narrow toolbar warning |
| `productionStructureMatrix` | large matrix table, master manual modal | pass |
| `shiftMasterBoard` | board/detail panels, assignment cards, print modal | pass |
| `authPrototype` | fullscreen auth wizard, PIN keypad | pass |
| `authSessionPrototype` | worker desktop, empty/task states | pass; issue modal probe absent in empty state |
| `roles` | role matrix and preset controls | pass |
| `planningTable` | dense plan-table module | pass |
| `matrix` | matrix UI module | pass |
| `supply` | supply workspace/table | pass |
| `shopMap` | shop map runtime | pass |
| `visualSystem` | UI state/reference page | pass |
| `employees` | placeholder/legacy-safe page | pass |
| `dispatch` | placeholder page | pass |

## CSS/JS Files With Layout Impact

- `styles.css`: manifest order changed in Phase A; must remain manifest-only.
- `styles/layers/99-legacy-overrides-tail.css`: large reduction; risk is accidental return of extracted rules.
- `styles/ui/planning-order.css`: extracted planning order/table/detail styles; cascade order is critical.
- `styles/ui/runtime-safety.css`: interaction/Gantt safety contracts; protects hover flicker, Gantt scroll and rectangular bars.
- `styles/mes-ui-core.css`: shared shell/action/table tokens.
- `src/app.js`: runtime module rendering and business UI paths.
- `scripts/css-layer-audit.mjs`: CSS contract gate, now a target for A.5 guardrail hardening.

## Probable Layout-Impact Changes

| Area | Possible Symptom | Repair Type |
| --- | --- | --- |
| CSS manifest order | styles apply in wrong module, old UI leaks back | import-order-fix |
| Extracted planning CSS | planning table/detail loses spacing/tree layout | contract-css-fix |
| Runtime safety layer | hover flicker, Gantt scroll/bar shape regression | contract-css-fix |
| Tables | nested scroll/overflow returns | regression-test-fix |
| Modals/drawers | viewport-fit or close actions regress | regression-test-fix |

## A.5 Decision

No failed visual regression was found by baseline QA. The repair action is therefore limited to a regression guardrail in `scripts/css-layer-audit.mjs`: it now verifies that the extracted planning order layer stays in `styles/ui/planning-order.css`, does not return to `99-legacy-overrides-tail.css`, and that the runtime safety layer still contains the interaction stability selector.
