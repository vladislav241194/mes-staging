# UI/UX Green Baseline Lock & QA Contract Integrity Check

## 0. Metadata

- Date: 2026-07-05
- Branch: `main`
- Commit at check time: `7286d0c`
- Task scope: lock the current green UI/UX QA baseline and verify that recent functional QA script updates did not weaken the contract.
- Log directory for this run: `/tmp/mes-green-baseline-lock.VrvyPW`
- Files reviewed:
  - `scripts/planning-labor-functional-qa.mjs`
  - `scripts/shift-operational-flow-functional-qa.mjs`
  - `scripts/auth-functional-qa.mjs`
  - `src/app.js`
  - `package.json`
- Files changed by this task:
  - `reports/ui-ux-green-baseline-lock.md`

No product UI, CSS, Gantt geometry, icon, business-logic, or component code was intentionally changed during this lock pass.

## 1. Executive summary

Baseline status: green.

The required command set was run and passed: build, UI audits, CSS audits, architecture, visual snapshots, UI regression, functional suite, planning labor, shift flow, auth, and `git diff --check`.

The three recently edited functional QA scripts were reviewed. The `planning-labor` selector fallback remains exact and semantic. The `shift-flow` update adapts to the real deviation-comment requirement and still verifies saved fact, transfer contract, carryover, and Gantt operational layers. The `auth` update preserves the session/topbar/reload/logout contract under the temporary PIN bypass and keeps the original PIN assertions in the branch that will execute when PIN mode is restored.

Recommendation: accept this as a checkpoint only after committing or otherwise freezing the current dirty worktree. Starting a new UI/UX phase without a checkpoint would make the baseline hard to trust later.

## 2. Command baseline

| Command | Status | Duration | Notes | Artifact generated |
|---|---:|---:|---|---|
| `npm run build` | pass | 1s | Static staging build created successfully. | `dist/` |
| `npm run qa:ui` | pass | 3s | UI contracts, runtime coverage, raw-token audit, table audit, Gantt inline style audit, helper/extracted/ui-kit checks passed. | audit outputs in `docs/` / `reports/` |
| `npm run qa:css` | pass | 1s | CSS audit passed. Duplicate selector groups: 346; exact duplicate rule groups: 0. | CSS budget output |
| `npm run qa:architecture` | pass | 5s | Flow, UI, legacy, CSS, production structure, and module boundaries passed. | architecture/audit outputs |
| `npm run qa:visual` | pass | 60s | `macbook-air-15: 48/48 modules passed`. | `tmp/design-qa-snapshots-1783282560179/report.md` |
| `npm run qa:ui:regression` | pass | 79s | 95 checks, 0 failed, 11 warnings. | `docs/ui-module-regression-smoke-report.md`, `reports/ui-regression-summary.json` |
| `npm run qa:functional` | pass | 236s | Full functional chain passed through boot performance. | functional/runtime reports |
| `npm run qa:planning-labor` | pass | 12s | Planning labor updates drive Gantt slot calculations. | browser/server run |
| `npm run qa:planning-labor:inner` | pass | 11s | Inner planning-labor scenario passed against running local service. | none dedicated |
| `npm run qa:shift-flow` | pass | 11s | Shift operational flow passed. | browser/server run |
| `npm run qa:shift-flow:inner` | pass | 9s | Inner shift-flow scenario passed against running local service. | none dedicated |
| `npm run qa:auth` | pass | 6s | Auth functional QA passed with temporary PIN bypass active. | browser/server run |
| `npm run qa:auth:inner` | pass | 4s | Inner auth scenario passed against running local service. | none dedicated |
| `git diff --check` | pass | 0s | No whitespace/error markers in current diff. | none |

## 3. Functional QA script integrity review

### 3.1 `planning-labor-functional-qa.mjs`

Old contract:

- Select the planning order UI element by exact `data-planning-work-item="step:<stepId>"`.
- Fail if the element is not found.
- Then verify that work-order labor modes and values drive the Gantt slot.

New contract:

- First try exact `data-planning-work-item="step:<stepId>"`.
- Fallback to exact `data-planning-order-row="step:<stepId>"`.
- If neither exists, fail with diagnostics listing available work item and order row IDs.

Assertions preserved:

- Mode field exists.
- Labor field exists.
- UI element for the exact `step:<stepId>` exists.
- Gantt slot receives `laborSource = work_order`.
- Fixed, unit, panel, and shift labor modes sync to the Gantt slot.
- Reload normalization restores work-order labor source/mode/duration.
- UI mode changes and manual input preserve scroll/focus.
- Console/dialog checks remain.

Assertions added or strengthened:

- Selector diagnostics now include both selector families and available IDs.
- The selected contract is logged as either `planning-work-item` or `planning-order-row`.

Assertions removed:

- None found. The old boolean assertion was replaced by a diagnostic object assertion, not removed.

Risk analysis:

- The fallback selector is not broad. It still requires the same `step:<stepId>` value.
- It can only select the wrong element if the DOM contains a duplicated/stale row with the same `step:<stepId>`, which would be a page data integrity issue, not a broad-selector issue.
- The fallback has the same business meaning because `src/app.js` binds both `data-planning-work-item` and `data-planning-order-row` to `ui.planningWorkItem`.

Verdict: preserved.

### 3.2 `shift-operational-flow-functional-qa.mjs`

Old contract:

- Create or select a real Gantt slot.
- Save a workshop assignment.
- Open the worker desktop.
- Enter fact below assignment quantity.
- Verify saved fact, transfer contract, carryover, and Gantt operational layer.

New contract:

- Same flow, but when `actualQuantity < assignedQuantity * 0.95`, the script fills the required worker deviation comment before saving.

Assertions preserved:

- Workshop sees available employees from timesheet.
- Assignment stores slot ID, sheet contract, transfer contract, assigned quantity, and executor.
- Workshop fact panel remains removed.
- The selected source slot is real, not a board fallback.
- Worker desktop shows assigned task and fact panel.
- Save action exists.
- Worker fact draft and shared operation fact are saved.
- Transfer contract contains remaining quantity.
- Fact remains below assigned quantity for the QA deficit scenario.
- Carryover is created.
- Carryover contains `partial_carryover_required` and source slot ID.
- Gantt operational layer shows master validation, fact, assignment deficit, fact deficit, and non-overlapping segments.

Assertions added or behavior adapted:

- The test now fills a real deviation reason for the below-plan fact path.
- This follows the current product rule in `src/app.js`: if fact is more than 5% below plan, save is blocked until a reason is present.

Assertions removed:

- None found.

Risk analysis:

- The comment text is not an assertion bypass by itself. It is required input for the current business rule.
- If the script stopped filling the reason, the click could still occur, but the later assertions for `draft.updatedAt`, shared `fact.updatedAt`, transfer remaining quantity, and carryover would fail.
- Future improvement: add an explicit assertion that `deviationCommentFilled === true` when the test intentionally enters a below-95% fact. Current downstream assertions already protect the data path.

Verdict: preserved.

### 3.3 `auth-functional-qa.mjs`

Old contract:

- Start from a protected module.
- Complete auth selection.
- Show PIN panel.
- Verify keypad geometry, randomized ten unique digits, no `C/С`, backspace, wrong PIN failure, correct PIN success.
- Verify standard app shell, topbar session summary, same-day reload persistence, and logout.

New contract:

- Default URL starts from `module=authPrototype`.
- Complete auth selection.
- Wait for either:
  - PIN mode, if PIN is active; or
  - unlocked session, while `AUTH_PIN_TEMPORARILY_DISABLED = true`.
- If PIN mode is active, run the old wrong/correct PIN keyboard assertions.
- Always verify unlocked app shell, topbar session summary, persisted session, reload persistence, removed sidebar role/session cards, and logout.

Assertions preserved:

- One-step back contract is still checked.
- Auth header geometry is still checked.
- Department icon tone is still checked.
- Master role marker contract is still checked.
- App shell/topbar/menu/logout/session assertions are still checked.
- Reload persistence is still checked.
- Logout clears session and returns to auth screen.
- PIN keypad assertions remain in the `mode === "pin"` branch.

Assertions skipped only in temporary mode:

- Wrong PIN failure.
- Correct PIN success.
- PIN keypad geometry/keyboard visual checks.

Temporary PIN bypass handling:

- Runtime flag: `src/app.js` has `AUTH_PIN_TEMPORARILY_DISABLED = true`.
- On person selection, runtime calls `completeAuthPrototypeLogin("pin-ok", { personId })`.
- The test does not pretend PIN is active. It labels the path as `Temporary PIN bypass auth` and asserts unlocked session behavior.

Risk analysis:

- Auth QA is preserved for the current temporary product mode, but it is not a full PIN enforcement test while the bypass flag is true.
- When PIN is restored, the existing `mode === "pin"` branch should execute the original keypad, wrong PIN, and correct PIN assertions again.
- Before re-enabling PIN permanently, run `npm run qa:auth` with the flag false or equivalent test configuration and confirm the PIN branch executes.

Verdict: preserved under temporary bypass; needs a dedicated re-check when PIN is restored.

## 4. Selector/data contract review

| Area | Old selector/data | New selector/data | Why valid | Risk | Future guard |
|---|---|---|---|---|---|
| Planning labor step selection | `[data-planning-work-item="step:<id>"]` | first `data-planning-work-item`, then `[data-planning-order-row="step:<id>"]` | Both carry exact `step:<id>` and both update `ui.planningWorkItem` in `src/app.js`. | Duplicate DOM rows with same `step:<id>` could hide a data issue. | Assert selected row text/operation ID after click if this becomes flaky. |
| Planning row event | button-only click | row click ignores nested controls and sets `ui.planningWorkItem` | Makes table row itself a semantic selection surface. | If nested controls are not filtered, row click could steal interaction; current handler filters controls. | Keep `event.target.closest("button, input, select, textarea, a, label")` guard. |
| Shift fact deviation | save below plan without reason | fill `data-auth-session-deviation-comment="<taskId>"` before save | Runtime blocks below-95% fact without reason, so test follows product rule. | Test does not directly assert `deviationCommentFilled`. | Add explicit assert in next functional-hardening pass. |
| Auth terminal step | PIN panel only | PIN panel or unlocked session | Current runtime has explicit temporary PIN bypass. | PIN UI can drift while bypass is active. | Re-run auth QA with PIN restored before accepting auth production behavior. |

## 5. Generated artifacts review

| File or family | Generated/manual | Command/source | Should commit? | Notes |
|---|---|---|---|---|
| `dist/` | generated | `npm run build`, `qa:visual` | no, if ignored build output | Build was regenerated during checks. |
| `tmp/design-qa-snapshots-1783282560179/report.md` | generated | `npm run qa:visual` | no | Temporary visual snapshot artifact. |
| `docs/ui-module-regression-smoke-report.md` | generated | `npm run qa:ui:regression` | yes, if baseline docs are tracked intentionally | Existing tracked report updated by smoke run. |
| `reports/ui-regression-summary.json` | generated | `npm run qa:ui:regression` | yes, if JSON baselines are tracked intentionally | Large diff already present in worktree. |
| `docs/gantt-*.md`, `reports/gantt-*.json` | generated | Gantt/UI audits and functional suites | yes, if baseline docs/reports are part of checkpoint | They are already modified in dirty worktree. |
| `scripts/planning-labor-functional-qa.mjs` | manual source | prior functional repair | yes | Reviewed in this lock pass. |
| `scripts/shift-operational-flow-functional-qa.mjs` | manual source | prior functional repair | yes | Reviewed in this lock pass. |
| `scripts/auth-functional-qa.mjs` | manual source | prior auth test update | yes | Reviewed in this lock pass. |
| `reports/ui-ux-green-baseline-lock.md` | manual report | this task | yes | New lock report. |

## 6. Dirty worktree classification

Current dirty summary before this report was created:

| Category | Files/count | Recommendation |
|---|---:|---|
| Docs tracked | 8 modified | Commit with the UI/QA baseline if the generated report contents are accepted. |
| Reports tracked | 18 modified | Commit with baseline artifacts or regenerate once before final checkpoint. |
| QA scripts tracked | 15 modified | Review and commit as test-contract changes. The three critical scripts were reviewed here. |
| Source tracked | 6 modified | Commit with feature/runtime changes only after product review. |
| Styles tracked | 12 modified plus `styles.css` | Commit with UI stabilization changes; do not mix with a new redesign phase. |
| Package tracked | `package.json` modified | Commit with QA script additions/changes. |
| Assets untracked | `assets/icon-references/` | Commit only if icon reference workflow is accepted. |
| Docs untracked | 9 files | Decide whether these are final phase docs or scratch reports. |
| Reports untracked | 18 files | Commit accepted evidence reports; discard or ignore temporary/generated-only files. |
| Scripts untracked | 7 files | Commit only if wired into `package.json` and QA baseline. |
| Source untracked | `src/icons/`, `src/modules/nomenclature/` | Product/code review required before checkpoint. |
| Styles untracked | `styles/ui/planning-order.css`, `styles/ui/runtime-safety.css` | Commit if referenced by runtime build and accepted by CSS baseline. |
| Lockfile | `package-lock.json` untracked | Commit if dependency/install state is now intended to be locked. |

Checkpoint recommendation:

1. Do not start the next UI/UX phase until this dirty state is frozen.
2. Prefer one explicit checkpoint commit after review: source + styles + QA scripts + accepted docs/reports together, because the current baseline is cross-cutting.
3. If a single commit is too large for review, split into:
   - runtime/source/styles;
   - QA scripts/package;
   - generated docs/reports/evidence.
4. Avoid committing `tmp/` and build output unless the repository intentionally tracks them.

## 7. Baseline gates for future phases

Minimum gate before a small UI change:

```sh
npm run build
npm run qa:ui
npm run qa:css
npm run qa:ui:regression
git diff --check
```

Full gate before accepting a UI/UX phase:

```sh
npm run build
npm run qa:ui
npm run qa:css
npm run qa:architecture
npm run qa:visual
npm run qa:ui:regression
npm run qa:functional
git diff --check
```

Targeted gates by changed area:

```sh
npm run qa:planning-labor
npm run qa:shift-flow
npm run qa:auth
npm run qa:gantt
npm run qa:icons
```

Package script map:

- Core baseline: `build`, `qa:ui`, `qa:css`, `qa:architecture`, `qa:visual`, `qa:ui:regression`, `qa:functional`, `git diff --check`.
- Functional area gates: `qa:planning-labor`, `qa:shift-flow`, `qa:auth`, `qa:shift-master-board`, `qa:timesheet`, `qa:gantt-operational`, `qa:gantt-guardrails`, `qa:gantt`, `qa:roles`, `qa:boot`.
- Heavy/optional full runs: `qa:night`, `qa:nonvisual`, `qa:visual`, `qa:functional`.
- Budget/contract helpers: `qa:ui:status-budget`, `qa:ui:table-budget`, `qa:css:duplicate-budget`, `qa:phase-b-budget`, `qa:ui-kit`, `qa:modules:extracted`, `qa:ui:helpers`.
- Alias/legacy-style entries to keep explicit: `qa:ui-regression` and `qa:ui:regression` both route to UI module regression; `qa:gantt:geometry`, `qa:gantt:scale`, and `qa:gantt:interactions` route to the same Gantt inner smoke; `qa:legacy` is debt inventory, not a redesign permission.

## 8. Remaining risks

- The auth flow is currently in temporary PIN-bypass mode. This is acceptable for prototype testing, but not equivalent to production PIN enforcement.
- PIN visual/keypad assertions are present but not exercised while the bypass flag is true.
- `shift-flow` should eventually assert `deviationCommentFilled` directly for the below-plan scenario, even though downstream saved fact/carryover assertions already protect the path.
- The worktree is large and dirty. The green baseline is reproducible now, but it is not safe as a long-lived reference until committed or tagged.
- `qa:ui:regression` still reports 11 warnings. They do not block the green baseline, but they should be watched during the next UI phase.

## 9. Final verdict

Baseline accepted.

The current project state passes the required command gates, and the reviewed QA-script changes do not appear to achieve green status by deleting assertions or broadening selectors unsafely. The next recommended task is not another redesign pass; it is checkpoint discipline: commit or otherwise freeze this green baseline, then begin the next bounded stabilization topic.

Recommended next topic after checkpoint acceptance: choose exactly one of `Icon runtime adoption`, `Button/action contract hardening`, `Table density contract hardening`, or `Form field adoption`.

## 10. ChatGPT handoff summary

Green baseline lock was completed on 2026-07-05 for the MES prototype on branch `main`, commit `7286d0c`.

Required commands all passed:

- `npm run build`
- `npm run qa:ui`
- `npm run qa:css`
- `npm run qa:architecture`
- `npm run qa:visual`
- `npm run qa:ui:regression`
- `npm run qa:functional`
- `npm run qa:planning-labor`
- `npm run qa:planning-labor:inner`
- `npm run qa:shift-flow`
- `npm run qa:shift-flow:inner`
- `npm run qa:auth`
- `npm run qa:auth:inner`
- `git diff --check`

Important command evidence:

- `qa:visual`: 48/48 modules passed.
- `qa:ui:regression`: 95 checks, 0 failed, 11 warnings.
- `qa:css`: duplicate selector groups 346, exact duplicate rule groups 0.
- `qa:functional`: passed through boot performance.

Functional QA integrity review:

- `planning-labor-functional-qa.mjs`: preserved. Fallback selector remains exact: `step:<id>` via `data-planning-work-item` or `data-planning-order-row`.
- `shift-operational-flow-functional-qa.mjs`: preserved. It now fills a required deviation reason for below-95% fact and still verifies fact, transfer contract, carryover, and Gantt operational layers.
- `auth-functional-qa.mjs`: preserved for temporary PIN-bypass mode. It still validates session, topbar, reload persistence, and logout. The old PIN checks remain in the PIN branch and must be re-run when PIN is restored.

Dirty worktree is large and must be checkpointed before the next UI/UX phase. Recommended action: create a green baseline checkpoint commit or split into source/styles, QA/package, and docs/reports commits.
