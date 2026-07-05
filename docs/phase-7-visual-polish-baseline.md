# Phase 7 Visual Polish Baseline

Date: 2026-07-05.

## Git

- Branch: `main`.
- Worktree before Phase 7: dirty from previous Phase 1-6 work. Existing tracked changes were not reverted.
- Tracked diff before Phase 7: 38 files, about 2795 insertions and 13085 deletions.

## Baseline Commands

| Command | Status | Notes |
| --- | --- | --- |
| `npm run build` | pass | Bundle built before Phase 7 edits. |
| `npm run qa:ui` | pass | Runtime contracts, raw token audit, table audit, Gantt inline audit, helpers and extracted modules passed. |
| `npm run qa:css` | pass | Manifest-only CSS passed. Duplicate selector groups: 348. Exact duplicate rule groups: 0. Broad important layout rules: 0. |
| `npm run qa:architecture` | pass | Flow warnings remain documented compatibility aliases: `projectId`, `batchId`. |
| `npm run qa:functional` | pass | State, module smoke, UI regression, planning labor, workshop, timesheet, Gantt, auth, roles and boot passed. |
| `npm run qa:ui:regression` | pass | 20 modules, desktop/tablet/narrow smoke, 100 checks, 0 failures, 11 warnings. |
| `npm run qa:gantt` | pass | Geometry 15, scale 15, overlay 5, 0 failures. |
| `npm run qa:ui:tables` | pass | Same regression smoke, no failures. |
| `npm run qa:ui:overlays` | pass | Same regression smoke, no failures. |
| `npm run qa:ui:helpers` | pass | Helper smoke passed. |
| `npm run qa:boundaries` | pass | Module boundary audit passed. |
| `npm run qa:gantt:geometry` | pass | Gantt smoke passed. |
| `npm run qa:gantt:scale` | pass | Gantt smoke passed. |
| `npm run qa:visual` | baseline fail | Known pre-Phase 7 issue: `Cannot open interaction state: authPrototype-people` in `scripts/design-qa-snapshots.mjs`. |

## Covered Modules

- Hard runtime modules: `authPrototype`, `authSessionPrototype`, `planningTable`, `matrix`, `shiftWorkOrders`, `timesheet`, `roles`, `productionStructureMatrix`, `employees`, `dispatch`, `shiftMasterBoard`, `supply`, `shopMap`, `directories`, `products`, `nomenclature`, `routes`, `planning`.
- Special runtime modules: `gantt`, `visualSystem`.
- Legacy runtime modules: none in the runtime registry.
- Partial runtime modules: none in the runtime registry.

## Baseline Visual Debt Metrics

- Raw hex usages: 1894.
- Unique hex colors: 223.
- `!important` usages: 3048.
- `font-size` px declarations: 779.
- Literal `font-weight` declarations: 484.
- Raw `line-height` declarations: 609.
- Raw `border-radius` px declarations: 295.
- Raw spacing/position px declarations: 2095.

## Known Issues Before Phase 7

- `qa:visual` snapshot flow for `authPrototype-people` is out of sync with the current auth wizard.
- CSS is still large and historically layered; exact duplicate rules are controlled, but duplicate selector pressure remains high.
- `gantt` is intentionally special-runtime and must not be normalized by generic panel geometry.
- `visualSystem` existed as a mixed showcase; Phase 7 must make it a production-helper UI Kit showcase.
