# UI Phase 4 Baseline

Generated: 2026-07-05.

## Git State

Baseline worktree was already dirty from prior stabilization phases. Phase 4 did not reset or revert unrelated changes.

## Existing Commands

| command | baseline status | purpose |
| --- | --- | --- |
| `npm run build` | pass | creates `dist` and cache-busted assets |
| `npm run qa:ui` | pass | UI helpers, runtime coverage, class audit, raw token audit, table contract audit |
| `npm run qa:css` | pass | CSS layer audit and duplicate selector pressure |
| `npm run qa:architecture` | pass | flow, UI, legacy, CSS and structure gates |
| `npm run qa:functional` | pass | state, module smoke, UI regression, planning, workshop, timesheet, Gantt, auth, roles, boot |

## Existing QA/Smoke/Audit Scripts

| script | role |
| --- | --- |
| `scripts/module-smoke-qa.mjs` | registered module render smoke on MacBook-sized viewport |
| `scripts/ui-module-regression-smoke.mjs` | Phase 3 DOM/layout regression smoke, expanded in Phase 4 |
| `scripts/ui-contract-coverage-report.mjs` | module UI-contract coverage report |
| `scripts/gantt-runtime-guardrails-qa.mjs` | Gantt runtime structure guardrails |
| `scripts/gantt-operational-layer-qa.mjs` | Gantt plan/distribution/fact layer checks |
| `scripts/ui-contract-qa.mjs` | UI helper/CSS/marker contract gate |
| `scripts/ui-runtime-coverage-qa.mjs` | explicit hard/special/partial/legacy runtime status |
| `scripts/ui-runtime-class-audit.mjs` | runtime CSS class coverage |
| `scripts/ui-raw-token-audit.mjs` | raw visual token budget |
| `scripts/ui-table-contract-audit.mjs` | static table wrapper audit |
| `scripts/css-layer-audit.mjs` | CSS layer and duplicate selector audit |
| `scripts/design-qa-snapshots.mjs` | existing visual snapshot/check helper |
| `scripts/*functional-qa.mjs` | focused functional checks by domain |

## Coverage Before Phase 4

- Module smoke covered 29 route/module aliases at one desktop viewport.
- UI regression covered 10 modules across 3 viewports.
- Gantt had a dedicated guardrail.
- Static table contract existed.
- Missing: one unified regression smoke for all main modules, explicit exception registry, narrow/mobile limited-support registry, separate machine reports for overflow/table/overlay/Gantt, manual-check reduction document.

## Browser Automation Decision

No Playwright dependency was added. The project already has a stable browser runner based on local server + headless Chrome through CDP, so Phase 4 extends that infrastructure.
