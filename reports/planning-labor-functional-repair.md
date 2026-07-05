# Planning Labor Functional Repair

## 0. Metadata

- date: 2026-07-05
- branch: main
- commit: 7286d0c
- task scope: repair the functional QA failure in planning labor / planning order flow without changing production planning logic, Gantt geometry, CSS, visual baselines, or business calculations.
- manual files changed:
  - `scripts/planning-labor-functional-qa.mjs`
  - `scripts/shift-operational-flow-functional-qa.mjs`
  - `scripts/auth-functional-qa.mjs`
  - `reports/planning-labor-functional-repair.md`
- QA-generated files updated during required gates:
  - `docs/ui-contract-coverage-report.md`
  - `docs/ui-module-regression-smoke-report.md`
  - `reports/gantt-phase-5-regression.json`
  - `reports/ui-contract-coverage.json`
  - `reports/ui-regression-summary.json`

## 1. Starting baseline

Commands before repair:

| command | before |
| --- | --- |
| `npm run qa:functional` | fail |
| `npm run qa:planning-labor` | fail |
| `npm run qa:planning-labor:inner` | fail |

Failure summary:

```txt
Error: Не найден UI-элемент заказ-наряда для шага rs-3089fe36
    at assert (.../scripts/planning-labor-functional-qa.mjs:167:25)
    at selectPlanningStepWorkItem (.../scripts/planning-labor-functional-qa.mjs:253:3)
    at async main (.../scripts/planning-labor-functional-qa.mjs:524:5)
```

Verbose targeted reproduction showed the planning labor data path was already healthy before the UI selection failure:

```txt
- planning rendered
- prepared local manual-labor fixture
- selected slot r-c8546c78::rs-3089fe36
- fixed labor prepared
- slot synced fixed work-order labor
- fixed labor updated
- fixed update synced to slot
- unit labor updated
- unit update synced to slot
- panel labor updated
- panel update synced to slot
- shift labor updated
- legacy slot reload restored work-order labor
Error: Не найден UI-элемент заказ-наряда для шага rs-3089fe36
```

## 2. Root cause analysis

`rs-3089fe36` is a runtime route step id selected from the current application state, not a hard-coded fixture id in the QA script. The script reads `state.slots`, picks the first unlocked slot with a planning order id and `routeStepId`, then uses `slot.routeStepId` as the tested operation step. Source search confirmed `rs-3089fe36` is not defined in `src/` or `scripts/`; the only exact source occurrence was the previous baseline report.

The tested slot was `r-c8546c78::rs-3089fe36`. The route id is the planning order / route id, and the step id is the operation step attached to the slot. Data synchronization worked: fixed, unit, panel, shift labor modes all propagated into the slot, and legacy slot reload normalization restored work-order labor correctly.

The failure was in the test's DOM selection contract. `scripts/planning-labor-functional-qa.mjs` searched only:

```txt
[data-planning-work-item="step:rs-3089fe36"]
```

Current planning order table rows are rendered by `renderPlanningOrderStepRow` with:

```txt
data-planning-order-row="step:<stepId>"
```

and the production click handler in `bindPlanningEvents` already supports this row contract by writing `ui.planningWorkItem = row.dataset.planningOrderRow`. The selected step was therefore present as a planning order row, but not necessarily as a `data-planning-work-item` button. Some compact/secondary UI nodes still use `data-planning-work-item`, but the main planning order table no longer guarantees that marker for every operation row.

The UI element was not missing by business meaning. The test was looking in the older work-item button layer instead of the current order-row contract. This is related to recent planning order UI/table restructuring, where editable labor controls moved into the table row and the right detail block was removed.

## 3. Root cause category

Primary category: C. production DOM contract changed without QA update.

Secondary category: A. stale QA selector.

The production contract already had a stable semantic marker for planning order rows (`data-planning-order-row`). The functional QA still depended on the older button-only selector (`data-planning-work-item`). No route data, labor calculation, Gantt geometry, hidden row state, or timing issue was required to explain the failure.

## 4. Fix

| file | change | why minimal | risk |
| --- | --- | --- | --- |
| `scripts/planning-labor-functional-qa.mjs` | `selectPlanningStepWorkItem` now tries `data-planning-work-item` first and falls back to `data-planning-order-row` for the same `step:<id>` work item. It also returns diagnostics if neither contract exists. | Only updates the QA selector contract. Production DOM, CSS, layout, calculations, and state logic are untouched. | Low. The fallback still matches the same step id and triggers the existing row click handler. |
| `scripts/shift-operational-flow-functional-qa.mjs` | After the planning fix, full `qa:functional` exposed a downstream stale scenario: workdesk fact saving now requires a deviation reason when fact is below plan by more than 5%. The QA scenario now fills that reason before saving. | Only updates a functional test to match existing product behavior. No production code changed. | Low. It verifies the intended deviation-note path and carryover creation. |
| `scripts/auth-functional-qa.mjs` | After the planning fix, full `qa:functional` also exposed auth QA drift from the temporary PIN bypass. The auth QA now starts from `module=authPrototype`, accepts either PIN mode or temporary unlocked mode, and still verifies topbar session, reload, and logout. | Only updates QA expectations for the current reversible prototype flag `AUTH_PIN_TEMPORARILY_DISABLED = true`. Production code unchanged. | Low. When PIN mode is restored, the original PIN keyboard checks still run. |

## 5. Contract updated

Planning labor old selector:

```txt
[data-planning-work-item="step:<stepId>"]
```

Planning labor new selector sequence:

```txt
[data-planning-work-item="step:<stepId>"]
[data-planning-order-row="step:<stepId>"]
```

The new sequence is more stable because it preserves compatibility with old action-button work items while recognizing the current table row contract used by the main planning order table. It will catch future regressions where neither an action work item nor a planning order row exists for a slot-backed operation step.

Downstream functional contract updates:

- Workdesk fact QA must provide `data-auth-session-deviation-comment` when the entered actual output is below 95% of assigned quantity.
- Auth QA must start from `module=authPrototype` and handle both production PIN flow and temporary PIN-bypass flow.

## 6. Business logic impact

- Planning labor calculations were not changed.
- Slot normalization and labor synchronization logic were not changed.
- Gantt geometry was not changed.
- CSS was not changed.
- Production route data was not changed.
- Visual baselines and visual thresholds were not changed.
- The additional `shift-flow` and `auth` edits are QA-script-only updates needed to keep full `qa:functional` aligned with current product behavior.

## 7. QA results

| command | before | after | status | notes |
| --- | --- | --- | --- | --- |
| `npm run build` | not part of starting failure | pass | pass | Final build regenerated `dist`. |
| `npm run qa:functional` | fail at `qa:planning-labor:inner` | pass | pass | Full chain now passes through planning labor, shift flow, auth, roles, and boot. |
| `npm run qa:planning-labor` | fail | pass | pass | Runs local server and inner planning labor QA. |
| `npm run qa:planning-labor:inner` | fail | pass | pass | Targeted test passes after row-contract fallback. |
| `npm run qa:ui` | not rerun before repair | pass | pass | No new UI contract/token/table violations. |
| `npm run qa:css` | not rerun before repair | pass | pass | No CSS changes; CSS audit and duplicate budget pass. |
| `npm run qa:architecture` | not rerun before repair | pass | pass | Flow, UI, legacy, CSS, structure, boundaries pass. |
| `npm run qa:visual` | not rerun before repair | pass | pass | `macbook-air-15: 48/48 modules passed`. |
| `npm run qa:ui:regression` | not rerun before repair | pass | pass | 95 checks, 0 failed, 11 existing warnings. |
| `git diff --check` | not rerun before repair | pass | pass | No whitespace errors. |

Important intermediate failures uncovered after the planning repair:

1. `qa:shift-flow:inner` initially failed because the test saved a 60% fact without the now-required deviation reason. The test now fills a QA reason and verifies the carryover path.
2. `qa:auth:inner` initially failed because the test expected the PIN step while the current prototype has `AUTH_PIN_TEMPORARILY_DISABLED = true`. The test now supports both current bypass mode and future restored PIN mode.

## 8. Remaining issues

No remaining failures from the required gate list.

Existing warnings that remain documented and outside this task:

- `qa:ui:regression` reports 11 warnings with 0 failures.
- `qa:architecture` flow inventory reports compatibility warnings for legacy aliases (`projectId`, `batchId`) within allowed budgets.
- CSS duplicate selector groups remain within the established budget; this task did not perform CSS cleanup.

## 9. Final verdict

Planning labor functional baseline is repaired. The original failure was not a business or calculation regression. It was a stale QA selector after the planning order table became the primary editable surface.

The full required baseline is green after aligning the functional QA scripts with current runtime contracts:

- planning order row selection contract;
- workdesk deviation-note requirement;
- temporary PIN-bypass authorization mode.

## 10. ChatGPT handoff summary

The planning labor failure `Не найден UI-элемент заказ-наряда для шага rs-3089fe36` was caused by a stale selector in `scripts/planning-labor-functional-qa.mjs`.

The step id `rs-3089fe36` is not a hard-coded fixture. It is a runtime route step selected from the current slot state. The tested data path was healthy: fixed/unit/panel/shift labor synchronization and reload normalization all passed before the DOM selection failed.

The test searched only `[data-planning-work-item="step:<id>"]`, but the current planning order table renders operation rows with `data-planning-order-row="step:<id>"`. The production click handler already supports the row contract. The fix adds a fallback to the current row contract and diagnostics if neither marker exists.

No production planning logic changed. No Gantt geometry changed. No CSS changed.

During full `qa:functional`, two downstream stale QA scripts appeared after the planning failure was unblocked. `shift-operational-flow-functional-qa.mjs` now fills the required deviation reason when it intentionally saves a fact below plan. `auth-functional-qa.mjs` now starts on `module=authPrototype` and supports the current temporary PIN-bypass mode while preserving old PIN checks for when PIN is restored.

Final required gates:

- `npm run build`: pass
- `npm run qa:functional`: pass
- `npm run qa:planning-labor`: pass
- `npm run qa:planning-labor:inner`: pass
- `npm run qa:ui`: pass
- `npm run qa:css`: pass
- `npm run qa:architecture`: pass
- `npm run qa:visual`: pass, 48/48 modules
- `npm run qa:ui:regression`: pass
- `git diff --check`: pass

