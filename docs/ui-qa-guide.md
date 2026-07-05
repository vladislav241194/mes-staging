# UI QA Guide

## Fast Checks

- `npm run qa:ui`: static/runtime UI contract gates.
- `npm run qa:css`: CSS layer and duplicate selector audit.
- `npm run qa:architecture`: broad non-browser architecture gate.

## Regression Checks

- `npm run qa:ui:regression`: full Phase 4 UI DOM/layout regression smoke.
- `npm run qa:ui:tables`: table-focused alias of the Phase 4 regression smoke.
- `npm run qa:ui:overlays`: overlay-focused alias of the Phase 4 regression smoke.
- `npm run qa:ui:gantt`: Gantt-focused alias of the Phase 4 regression smoke.
- `npm run qa:functional`: includes module smoke, UI contract coverage and UI regression smoke.

## Reports

- `reports/ui-regression-summary.json`
- `reports/ui-module-coverage.json`
- `reports/ui-overflow-report.json`
- `reports/ui-table-regression.json`
- `reports/ui-overlay-regression.json`
- `reports/gantt-ui-regression.json`
- `reports/ui-console-errors.json`
- `reports/ui-regression-exceptions.json`

Human-readable reports are written to `docs/ui-module-regression-smoke-report.md`, `docs/ui-table-regression-report.md`, `docs/ui-overlay-regression-report.md` and `docs/gantt-ui-regression-report.md`.

## Adding A New Module

1. Add it to `smokeModules` in `scripts/ui-module-regression-smoke.mjs`.
2. Add a profile in `src/ui_regression_exceptions.js`.
3. If it is special or limited support, add an explicit exception with reason and future phase.
4. Run `npm run qa:ui:regression`.

## Exceptions

Exceptions live in `src/ui_regression_exceptions.js` and are exported to `reports/ui-regression-exceptions.json`. Do not use exceptions to hide blank screens, runtime errors or missing shell.

## Before UI Refactoring

Run:

```bash
npm run qa:ui
npm run qa:ui:regression
```

Before Gantt changes also run:

```bash
npm run qa:gantt-guardrails
npm run qa:ui:gantt
```

## Phase 6 Runtime Checks

Runtime decomposition adds these checks:

```bash
npm run qa:boundaries
npm run qa:ui:helpers
npm run qa:modules:extracted
```

`qa:boundaries` prevents reversed imports between `src/ui`, `src/modules`, `src/gantt` and `src/app.js`. `qa:ui:helpers` checks helper output markers/escaping. `qa:modules:extracted` checks extracted module renderers.
