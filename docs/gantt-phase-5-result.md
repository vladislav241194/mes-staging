# Gantt Phase 5 Result

Phase 5 stabilized Gantt as a special runtime without redesigning it and without changing planning behavior.

## What Changed

Added Gantt contract registry:

- `src/gantt_ui_contracts.js`

Added Gantt regression scripts:

- `scripts/gantt-ui-regression-smoke.mjs`
- `scripts/gantt-inline-style-audit.mjs`

Updated integration:

- `package.json`
- `scripts/ui-module-regression-smoke.mjs`
- `scripts/ui-contract-coverage-report.mjs`
- `src/ui_runtime_contracts.js`
- `src/ui_regression_exceptions.js`

Updated safe runtime markers:

- Gantt shell is `data-ui-component="GanttRuntime"` and `data-ui-runtime="gantt-v1"`.
- Gantt toolbar is `data-ui-component="GanttToolbar"`.
- Slot drawer/editor/optimization modal have `data-gantt-overlay` markers.
- Gantt slots, resize handles, dependency paths, arrows, masks and non-working zones are protected by the regression suite.

Updated safe token layer:

- Added required `--mes-ui-gantt-*` tokens in `styles/mes-ui-core.css`.
- Migrated critical Gantt slot, dependency, non-working, transfer, grid and timeline visual values to token fallbacks in:
  - `styles/layers/10-shell-directory-gantt-base.css`
  - `styles/layers/40-gantt-planning-routes.css`

## NPM Scripts

New or strengthened scripts:

- `npm run qa:gantt`
- `npm run qa:gantt:inline`
- `npm run qa:gantt:geometry`
- `npm run qa:gantt:scale`
- `npm run qa:gantt:interactions`
- `npm run qa:gantt:slow`

Integrated scripts:

- `npm run qa:ui` now includes the Gantt inline-style audit.
- `npm run qa:syntax` checks the Gantt registry and Gantt regression scripts.
- `npm run qa:functional` includes the Gantt regression smoke after existing Gantt guardrails.

## Generated Reports

Machine-readable:

- `reports/gantt-runtime-map.json`
- `reports/gantt-dom-contract.json`
- `reports/gantt-geometry-invariants.json`
- `reports/gantt-inline-style-audit.json`
- `reports/gantt-token-usage.json`
- `reports/gantt-slot-contract.json`
- `reports/gantt-dependency-contract.json`
- `reports/gantt-overlay-regression.json`
- `reports/gantt-scale-regression.json`
- `reports/gantt-phase-5-regression.json`

Human-readable:

- `docs/gantt-phase-5-baseline.md`
- `docs/gantt-runtime-map.md`
- `docs/gantt-dom-contract.md`
- `docs/gantt-geometry-invariants-report.md`
- `docs/gantt-inline-style-classification.md`
- `docs/gantt-slot-visual-contract.md`
- `docs/gantt-dependency-contract.md`
- `docs/gantt-scale-regression-report.md`

## Latest Gantt Regression

`npm run qa:gantt`:

- geometry checks: 15
- scale checks: 15
- overlay/interaction checks: 5
- failures: 0
- warnings: 0

Viewports:

- 1440x932
- 1512x982
- 1180x820
- 1024x768
- 430x932

Scale modes:

- hours
- days
- weeks

## Final Verification Commands

| Command | Result |
| --- | --- |
| `npm run build` | pass |
| `npm run qa:syntax` | pass |
| `npm run qa:ui` | pass |
| `npm run qa:css` | pass |
| `npm run qa:architecture` | pass |
| `npm run qa:functional` | pass |
| `npm run qa:ui:regression` | pass, 100 checks, 0 failed, 11 warnings |
| `npm run qa:ui:gantt` | pass, 100 checks, 0 failed, 11 warnings |
| `npm run qa:ui:tables` | pass, 100 checks, 0 failed, 11 warnings |
| `npm run qa:ui:overlays` | pass, 100 checks, 0 failed, 11 warnings |
| `npm run qa:gantt` | pass, 15 geometry checks, 15 scale checks, 5 overlay checks |
| `npm run qa:gantt:geometry` | pass |
| `npm run qa:gantt:scale` | pass |
| `npm run qa:gantt:interactions` | pass |
| `npm run qa:gantt:inline` | pass |
| `git diff --check` | pass |

## Inline Style Classification

`npm run qa:gantt:inline`:

- inline style entries: 27
- geometry entries: 27
- visual inline violations: 0
- unknown inline warnings: 0

Allowed inline styles are geometry only. Visual inline styles now fail the Gantt inline audit.

## Known Remaining Debt

`reports/gantt-token-usage.json` still reports legacy raw colors inside Gantt CSS. Phase 5 did not mass-replace every historical color because that would risk changing the visual design. The contract now provides required Gantt tokens and verifies that critical runtime zones use token entry points.

Recommended next pass:

1. Convert remaining raw Gantt CSS colors to semantic Gantt tokens in small groups.
2. Add non-destructive hover/selection screenshots once a stable visual baseline is approved.
3. Add a dedicated drag/resize simulation suite only after behavior expectations are written down.
4. Move more pure view-model helpers out of the monolithic `src/app.js` when module boundaries are safe.
5. Add a separate dependency-edit visual regression once route editing becomes a focus area.
