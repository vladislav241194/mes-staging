# Visual Regression Repair Result

Generated: 2026-07-05 12:38 MSK

## Summary

Corrective Phase A.5 completed as a visual regression repair pass before Phase B.

No failed visual regression was detected in the required module set. The only code repair was a regression-test hardening in `scripts/css-layer-audit.mjs`: the CSS audit now verifies that the extracted planning-order layout layer stays in `styles/ui/planning-order.css`, does not return to `styles/layers/99-legacy-overrides-tail.css`, and that `styles/ui/runtime-safety.css` keeps the interaction-stability guard.

## Fixed / Guarded Items

| Module / Area | Selector / File | Symptom | Root Cause | Fix Type | Risk |
| --- | --- | --- | --- | --- | --- |
| `planning` CSS layer | `styles/ui/planning-order.css` | No current visual failure; risk of extracted planning order rules being moved back to legacy tail | Phase A moved a large page-specific block out of legacy without a dedicated ownership assertion | `regression-test-fix` | low |
| runtime interaction safety | `styles/ui/runtime-safety.css` | No current visual failure; risk of losing hover/focus stability guard | Runtime safety layer could be dropped while keeping manifest order superficially valid | `regression-test-fix` | low |
| CSS manifest/cascade | `styles.css` import graph via `scripts/css-layer-audit.mjs` | No current visual failure; risk of wrong cascade order after future CSS movement | Manifest order is critical after extracting module-specific CSS | `import-order-fix` guard | low |

## Baseline Findings

- `npm run qa:ui:regression`: 100 checks, 0 failed, 11 warnings.
- `npm run qa:visual`: MacBook Air 15, 48/48 modules and open states passed.
- `npm run qa:css`: duplicate selector groups 349, exact duplicate rule groups 0, broad layout `!important` 0.
- `npm run qa:functional`: pass.
- No safe visual CSS bug was found that required changing module styles.

## Remaining Warnings

Warnings are documented but not repaired in A.5 because they are narrow viewport or absent optional overlay-state probes, while the requested repair surface is the current MacBook/desktop visual regression before Phase B.

- `gantt` narrow/narrow-compact: header bounds limited.
- `timesheet` narrow/narrow-compact: toolbar action zone overflow.
- `routes` narrow-compact: action zone overflow.
- `authSessionPrototype`: issue-report overlay trigger absent in the current empty state.

## Final QA

| Command | Status |
| --- | --- |
| `npm run build` | pass |
| `npm run qa:ui` | pass |
| `npm run qa:css` | pass |
| `npm run qa:architecture` | pass |
| `npm run qa:functional` | pass |
| `npm run qa:ui:regression` | pass |
| `npm run qa:ui:tables` | pass |
| `npm run qa:ui:overlays` | pass |
| `npm run qa:visual` | pass |
| `npm run qa:ui-kit` | pass |
| `git diff --check` | pass |

## Phase B Readiness

Phase B can proceed from the current state with one caveat: the UI still has known visual-debt metrics from Phase A (`349` duplicate selector groups, `2905` `!important` usages), but A.5 did not find a blocking visual regression in the checked modules.
