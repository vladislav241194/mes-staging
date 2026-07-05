# Global UI/UX Stabilization Forensic Audit

Generated: 2026-07-05T05:08:07.380Z

This report audits the factual state of the current project after the claimed Phase 1-7 UI/UX stabilization work. It does not assess intent and does not rely on previous phase reports as proof. Evidence comes from the current filesystem, CSS, runtime code, package scripts, QA logs, generated metrics, and current git diff.

## Executive Summary

- **Overall UI stabilization status:** `partially stabilized prototype`
- **Confidence level:** `high`
- **Biggest mismatch with Phase 1-7:** QA gates and docs are much stronger than before, but runtime decomposition and component migration depth are partial: src/app.js remains 39103 lines with 61 module renderers, and several component families have low helper coverage.
- **Most urgent corrective action:** Align measured browser coverage with runtime registry and start shrinking budgets for monolith/CSS/raw-token/helper coverage rather than only pass/fail gates.
- **Can local UI changes now be trusted without manual full-project review:** `partially`

## Audit Inputs

**Commands executed**

| command | exists | status | exit code | seconds | verdict |
| --- | --- | --- | --- | --- | --- |
| build | yes | pass | 0 | 0s | proven |
| qa:ui | yes | pass | 0 | 3s | proven |
| qa:css | yes | pass | 0 | 0s | proven |
| qa:architecture | yes | pass | 0 | 4s | proven |
| qa:functional | yes | pass | 0 | 198s | proven |
| qa:ui:regression | yes | pass | 0 | 62s | proven |
| qa:ui:tables | yes | pass | 0 | 61s | proven |
| qa:ui:overlays | yes | pass | 0 | 62s | proven |
| qa:ui:gantt | yes | pass | 0 | 61s | proven |
| qa:gantt | yes | pass | 0 | 13s | proven |
| qa:gantt:geometry | yes | pass | 0 | 13s | proven |
| qa:gantt:scale | yes | pass | 0 | 13s | proven |
| qa:ui:helpers | yes | pass | 0 | 0s | proven |
| qa:boundaries | yes | pass | 0 | 0s | proven |
| qa:visual | yes | pass | 0 | 58s | proven |
| qa:ui-kit | yes | pass | 0 | 1s | proven |

**Git baseline**

- Current worktree is dirty before/around this audit. This report treats that as project state, not as proof of finished stabilization.
- Tracked changed files listed by `git status --short`: 39.
- Untracked entries listed by `git status --short`: 67.
- `git diff --stat`: 39 tracked files changed, 3104 insertions, 13254 deletions.
- Important changed areas: `package.json`, `src/app.js`, `src/ui_runtime_contracts.js`, `styles.css`, `styles/layers/*`, `styles/mes-ui-core.css`, QA scripts and docs.

## Core Metrics

| metric | current value | expected after Phase 1-7 | verdict |
| --- | --- | --- | --- |
| src/app.js line count | 39103 | reduced and no longer the main runtime monolith | partial |
| src/ui files | 4 | helpers/contracts extracted | proven |
| src/modules files | 1 | multiple module renderers extracted | partial |
| src/gantt files | 0 | optional if special-runtime is protected | partial |
| imports from src/ui | 5 | real imports from runtime | proven |
| imports from src/modules | 1 | several module imports | partial |
| module renderers still in src/app.js | 61 | small and shrinking | partial |
| extracted module renderers | 1 | several | partial |

## CSS Architecture Metrics

| metric | current value | expected after Phase 1-7 | verdict |
| --- | --- | --- | --- |
| styles.css manifest-only | yes, 14 imports / 0 non-import lines | yes | proven |
| CSS layer files | 15 | layered structure with component CSS | proven |
| styles/mes-ui-core.css | present | present | proven |
| styles/ui/* | styles/ui/actions.css, styles/ui/kit-polish.css, styles/ui/status.css | present and used | proven |
| legacy tail | 4821 lines | shrinking / not main change sink | partial |
| !important usages | 3047 | small and exceptional | partial |
| duplicate selector groups | 349 | low and shrinking | partial |
| exact duplicate rule groups | 0 | 0 | proven |
| unique hex colors | 223 | semantic palette | partial |
| spacing/position px declarations | 2094 | tokenized scale | partial |
| raw font-weight declarations | 484 | semantic typography tokens | partial |

## Token Groups

| token group | declared count | state | verdict |
| --- | --- | --- | --- |
| surface | 12 | declared | partial |
| text | 22 | declared | partial |
| border | 31 | declared | partial |
| accent | 12 | declared | partial |
| status | 54 | declared | partial |
| spacing | 0 | missing/weak | missing |
| typography | 0 | missing/weak | missing |
| radius | 27 | declared | partial |
| control | 14 | declared | partial |
| icon | 7 | declared | partial |
| table | 45 | declared | partial |
| form | 1 | declared | partial |
| overlay | 3 | declared | partial |
| layout | 0 | missing/weak | missing |
| gantt | 49 | declared | partial |
| density | 8 | declared | partial |
| z | 1 | declared | partial |

## Project structure

**Verdict:** `partial`  
**Risk level:** `high`  
**Related phase expectations:** Phase 6, Phase 7

**What exists now**
- Vanilla ES-module frontend with index.html, src/app.js and custom build server/scripts; no React/Tailwind/shadcn/Radix evidence in package.json.
- src/ui/ exists with helper and contract files.
- src/modules/ exists with dispatch renderer only.
- styles/ui/ exists with actions/status/kit-polish CSS.
- reports/ and docs/ contain extensive audit artifacts.

**Evidence**
- src/app.js line count: 39103
- src/ui file count: 4
- src/modules file count: 1
- src/gantt file count: 0
- imports from src/ui: 5
- imports from src/modules: 1
- module renderers still in src/app.js: 61
- Boundary audit exists and qa:boundaries passed.

**What is missing**
- No src/gantt/ folder.
- Most module rendering remains in src/app.js.
- Only one extracted module renderer is present.

## CSS architecture

**Verdict:** `partial`  
**Risk level:** `high`  
**Related phase expectations:** Phase 1, Phase 2, Phase 3, Phase 7

**What exists now**
- styles.css is manifest-only with 14 imports.
- styles/mes-ui-core.css exists.
- styles/ui/actions.css, styles/ui/status.css and styles/ui/kit-polish.css exist.
- npm run qa:css passes and reports exact duplicate rule groups = 0.

**Evidence**
- CSS files scanned: 15
- duplicate selector groups: 349
- largest duplicate selector group: 12
- exact duplicate rule groups: 0
- legacy tail lines: 4821
- !important usages: 3047
- unique hex colors: 223

**What is missing**
- Duplicate selector pressure remains high.
- Legacy tail remains large.
- Baseline-aware raw-token audit prevents new debt but does not remove current debt.

## Token system

**Verdict:** `partial`  
**Risk level:** `high`  
**Related phase expectations:** Phase 1, Phase 2, Phase 7

**What exists now**
- styles/mes-ui-core.css declares semantic tokens.
- Token references are broadly used in CSS.
- Raw-token audit exists and passes in baseline-aware mode.

**Evidence**
- tokens declared: 297
- token references: 2457
- registry mentions in JS: 271
- token groups with zero count: spacing, typography, layout
- raw hex usages: 1894
- font-size px declarations: 779
- border-radius px declarations: 294

**What is missing**
- Spacing, typography and layout tokens are not represented as first-class groups in the measured token map.
- Direct visual values remain common outside the core layer.

## Runtime helpers

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 2, Phase 3, Phase 6, Phase 7

**What exists now**
- src/ui/components.js defines reusable renderUi helpers with data-ui-component markers.
- Helpers are imported in src/app.js and used by VisualSystem and several modules.
- qa:ui:helpers passes.

**Evidence**
- renderUiActionButton: 50 calls
- renderUiStatusToken: 57 calls
- renderUiPanel: 52 calls
- renderUiPanelHead: 13 calls
- renderUiPanelBody: 67 calls
- renderUiPanelFooter: 6 calls
- renderUiTableWrap: 16 calls
- renderUiFormField: 6 calls
- renderUiDropdownFrame: 1 calls
- renderUiModalFrame: 2 calls
- renderUiModalShell: 12 calls
- renderUiDrawerFrame: 1 calls
- renderUiDrawerShell: 1 calls
- renderUiEmptyState: 15 calls
- renderUiModulePage: 19 calls
- renderUiModuleHeader: 15 calls
- renderUiActionBar: 2 calls
- renderUiToolbar: 1 calls

**What is missing**
- Helper existence is stronger than helper coverage; forms and overlays have especially low call counts relative to direct markup counts.
- Most helper use still happens inside src/app.js rather than decomposed module files.

## UI contracts

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 2, Phase 3, Phase 4

**What exists now**
- src/ui/contracts/runtime-contracts.js and hardening-plan-contracts.js exist.
- qa:ui reports UI helpers, CSS selectors and component markers are guarded.
- ui-hardening-plan-qa marks 11 stages closed with executable checks.

**Evidence**
- UI helpers: 27
- CSS selectors: 27
- UI component markers: 24
- Runtime coverage registry: hard 18, special 2, partial 0, legacy 0
- Browser coverage report: 14 contract, 2 special-runtime, 4 partial

**What is missing**
- Registry status and measured browser component coverage differ for several modules.
- The hardening plan can prove gates exist, but not complete migration depth.

## Module coverage

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 3, Phase 4, Phase 6

**What exists now**
- 20 modules are covered by ui-regression smoke.
- Every module has a runtime status in contracts.
- No module is unknown/legacy in runtime coverage QA.

**Evidence**
- coverage summary: {"contract":14,"special-runtime":2,"partial":4,"legacy":0,"unknown":0}
- regression modules: 20
- partial by browser coverage: dispatch, shiftWorkOrders, employees, timesheet

**What is missing**
- Partial modules still miss ModuleHeader/ActionBar/TableWrap/StatusToken combinations.
- Exception reasons sometimes describe next migration, not a final contract.

## Tables and TreeTables

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 2, Phase 3, Phase 4, Phase 7

**What exists now**
- renderUiTableWrap exists.
- ui-table-contract-audit passes.
- Tree patterns and table-like classes are checked.

**Evidence**
- tables found: 34
- renderUiTableWrap calls: 16
- qa table audit: 34 tables, 24 under TableWrap, 10 documented exceptions, 0 violations
- tree signal mentions: 131

**What is missing**
- TableWrap is not universal.
- TreeTable behavior is still more a set of patterns than a standalone component contract.

## Buttons/actions/toolbars/filters

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 3, Phase 7

**What exists now**
- renderUiActionButton exists and is used.
- styles/ui/actions.css is token-based and has no !important.
- ActionButton smoke is part of qa:ui.

**Evidence**
- renderUiActionButton calls: 50
- raw primary-button class occurrences: 16
- raw secondary-button class occurrences: 57
- raw icon-button class occurrences: 48
- ActionButton runtime markers/classes: 122
- renderUiToolbar calls: 1
- renderUiFilterBar calls: 2

**What is missing**
- Toolbar and FilterBar helpers have very low call counts.
- Raw button classes remain because ActionButton intentionally emits legacy-compatible classes and old local markup still exists.

## Statuses/badges/chips

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 3, Phase 7

**What exists now**
- renderUiStatusToken exists.
- styles/ui/status.css exists and is token-based.
- StatusToken is used in VisualSystem and production modules.

**Evidence**
- renderUiStatusToken calls: 57
- status-pill occurrences: 39
- deadline-badge occurrences: 18
- mes-signal occurrences: 107
- planning-order-state-token: 11
- supply-status-pill: 11

**What is missing**
- Domain chips/statuses remain visually and semantically distributed.
- StatusToken markers are not sufficient to prove all statuses are unified.

## Forms

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 3, Phase 7

**What exists now**
- renderUiFormField exists.
- Form field QA gate exists in hardening plan.
- Control height token is checked by qa:ui.

**Evidence**
- renderUiFormField calls: 6
- input tags: 98
- select tags: 27
- textarea tags: 5
- form field markers: 4
- dense select classes: 55

**What is missing**
- Most live inputs/selects/textareas are still direct markup.
- PIN, inline table controls and dense selects need explicit standard vs exception classification.

## Overlays

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 3, Phase 4, Phase 7

**What exists now**
- Modal/Drawer/Dropdown helpers exist.
- Overlay regression command passes.
- Opened overlay smoke is part of qa:ui hardening plan.

**Evidence**
- renderUiModalFrame calls: 2
- renderUiModalShell calls: 12
- renderUiDrawerFrame calls: 1
- renderUiDropdownFrame calls: 1
- modal class runtime mentions: 136
- drawer runtime mentions: 50
- dropdown runtime mentions: 10
- overlay probes in regression: 25

**What is missing**
- Many overlays remain local/special.
- Frame helper usage is low compared with modal/drawer/dropdown class pressure.

## Gantt

**Verdict:** `proven`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 5

**What exists now**
- Gantt is special-runtime rather than ordinary ModulePage.
- src/gantt_ui_contracts.js exists.
- Gantt regression/geometry/scale commands pass.
- Gantt inline style audit reports 20 classified entries and 0 visual violations.

**Evidence**
- src/gantt file count: 0
- data-gantt attributes found: data-gantt-optimize-select, data-gantt-overlay, data-gantt-overlay-component, data-gantt-shell, data-gantt-zoom
- gantt tokens declared: 49
- gantt token refs: 74
- inline style entries from report: 20
- qa:gantt, qa:gantt:geometry and qa:gantt:scale passed

**What is missing**
- No src/gantt/ decomposition folder.
- Gantt remains high-impact special runtime; visual changes should stay behind its dedicated contracts.

## Regression QA

**Verdict:** `proven`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 4

**What exists now**
- All requested QA commands exist and passed in this audit run.
- Reports are generated for coverage, regression, Gantt and visual snapshots.
- Regression includes desktop/tablet/narrow viewports and overlay probes.

**Evidence**
- build: pass (0s)
- qa:ui: pass (3s)
- qa:css: pass (0s)
- qa:architecture: pass (4s)
- qa:functional: pass (198s)
- qa:ui:regression: pass (62s)
- qa:ui:tables: pass (61s)
- qa:ui:overlays: pass (62s)
- qa:ui:gantt: pass (61s)
- qa:gantt: pass (13s)
- qa:gantt:geometry: pass (13s)
- qa:gantt:scale: pass (13s)
- qa:ui:helpers: pass (0s)
- qa:boundaries: pass (0s)
- qa:visual: pass (58s)
- qa:ui-kit: pass (1s)

**What is missing**
- Automated QA reduces manual checks but does not fully cover visual semantics/taste/complex user journeys.
- Regression warnings remain: 11

## VisualSystem / internal UI Kit

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 7

**What exists now**
- renderVisualSystemPage exists in src/app.js.
- VisualSystem has data-ui-component="VisualSystemRuntime".
- The VisualSystem slice calls production helpers for buttons, panels, tables, statuses, form field, modal, dropdown, toolbar and filter bar examples.
- qa:ui-kit reports production helper evidence present.

**Evidence**
- renderVisualSystemPage starts near src/app.js:20813
- VisualSystem helper counts: renderUiPanel 5, renderUiActionButton 11, renderUiTableWrap 3, renderUiStatusToken 14, renderUiFormField 2, renderUiModalFrame 1, renderUiDropdownFrame 1
- styles/layers/80-visual-system-ui-states.css: 3762 lines, 963 !important usages

**What is missing**
- It is a partial showcase, not a full Storybook/contract compiler.
- Its CSS layer is one of the largest visual-debt files.

## Runtime decomposition

**Verdict:** `partial`  
**Risk level:** `high`  
**Related phase expectations:** Phase 6

**What exists now**
- src/ui helpers extracted.
- src/ui/contracts extracted.
- src/modules/dispatch/render.js extracted.
- module-boundary-audit and extracted-module-render-smoke pass.

**Evidence**
- src/app.js line count: 39103
- renderUi functions still in app.js: 2
- module renderers in app.js: 61
- extracted module renderers: 1
- imports from src/modules: 1

**What is missing**
- The runtime is still dominated by src/app.js.
- Decomposition is real but shallow.

## Legacy debt

**Verdict:** `partial`  
**Risk level:** `high`  
**Related phase expectations:** Phase 1, Phase 2, Phase 7

**What exists now**
- Legacy inventory runs and hard forbidden patterns are at 0.
- CSS-only runtime classes are at 0 unexpected.
- Exact duplicate CSS rules are at 0.

**Evidence**
- legacy tail line count: 4821
- duplicate selector groups: 349
- !important count: 3047
- deprecated alias mentions: 7
- flow QA warnings: projectId legacy alias 70 rows, batchId alias 6 rows

**What is missing**
- Legacy debt is controlled by baseline and reports, not removed.
- Large legacy CSS and alias compatibility remain.

## Mobile/tablet/narrow support

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 4

**What exists now**
- Regression smoke covers desktop, tablet, tablet-compact, narrow and narrow-compact.
- Visual QA passed 48/48 modules in MacBook-oriented snapshots.

**Evidence**
- viewports: desktop 1440x932, tablet 1180x820, tablet-compact 1024x768, narrow 430x932, narrow-compact 390x844
- regression checks: 100
- failed: 0
- warnings: 11

**What is missing**
- Narrow warnings remain.
- This is limited smoke coverage, not proof that all workflows are ergonomic on tablet/mobile.

## Visual polish consistency

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 7

**What exists now**
- styles/ui/kit-polish.css is token-only, no !important, no page-specific selectors per qa:ui-kit.
- VisualSystem demonstrates internal UI-kit examples.
- MacBook visual snapshots pass.

**Evidence**
- styles/ui/kit-polish.css: 317 lines, 0 hex, 0 !important, 132 var refs
- raw radius declarations: 294
- raw font-size declarations: 779
- duplicate selector groups: 349

**What is missing**
- Systemic polish is not complete while raw typography/radius/spacing and legacy cascade remain high.
- Visual consistency still needs component-family budgets.

## Manual-check reduction

**Verdict:** `partial`  
**Risk level:** `medium`  
**Related phase expectations:** Phase 4, Phase 7

**What exists now**
- Build, UI, CSS, architecture, functional, visual and specialized Gantt/UI commands pass.
- Machine-readable reports exist for coverage and regression.

**Evidence**
- qa:ui:regression pass: 100 checks, 0 failed, 11 warnings
- qa:visual pass: 48/48 modules
- qa:functional pass
- qa:gantt pass

**What is missing**
- Manual full-project review is reduced, not eliminated.
- Visual-semantic choices like grouping readability, selected-row emphasis and modal content hierarchy still need human QA.

## Remaining risks

**Verdict:** `partial`  
**Risk level:** `high`  
**Related phase expectations:** Phase 1-7

**What exists now**
- There is much more automated coverage than before: scripts, reports and runtime markers exist.
- Gantt has dedicated special-runtime guardrails.

**Evidence**
- Dirty worktree has 39 tracked changed files and many untracked docs/reports/scripts/src/ui/styles/ui artifacts.
- package.json changed; reports/scripts are not all committed in current working tree.
- src/app.js still 39103 lines.

**What is missing**
- Until changes are committed and budgets tightened, future agents can still make local CSS/DOM changes that pass broad gates but fail product expectations.


## Runtime Helper Coverage

| helper | defined in | call count | modules using it | has data-ui-component | covered by QA | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| renderUiActionButton | src/ui/components.js | 50 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiStatusToken | src/ui/components.js | 57 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiPanel | src/ui/components.js | 52 | src/app.js, src/modules/dispatch/render.js, src/ui/components.js | yes | yes | partial |
| renderUiPanelHead | src/ui/components.js | 13 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiPanelBody | src/ui/components.js | 67 | src/app.js, src/modules/dispatch/render.js, src/ui/components.js | yes | yes | partial |
| renderUiPanelFooter | src/ui/components.js | 6 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiTableWrap | src/ui/components.js | 16 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiFormField | src/ui/components.js | 6 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiDropdownFrame | src/ui/components.js | 1 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiModalFrame | src/ui/components.js | 2 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiModalShell | src/ui/components.js | 12 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiDrawerFrame | src/ui/components.js | 1 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiDrawerShell | src/ui/components.js | 1 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiEmptyState | src/ui/components.js | 15 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiModulePage | src/ui/components.js | 19 | src/app.js, src/modules/dispatch/render.js, src/ui/components.js | yes | yes | partial |
| renderUiModuleHeader | src/ui/components.js | 15 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiActionBar | src/ui/components.js | 2 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiToolbar | src/ui/components.js | 1 | src/app.js, src/ui/components.js | yes | yes | partial |
| renderUiFilterBar | src/ui/components.js | 2 | src/app.js, src/ui/components.js | yes | yes | partial |

## Module Coverage Matrix

| module | current status | expected status | markers/components found | exception reason | next migration | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| gantt | special-runtime | contract or documented special-runtime | AppShell, ActionButton, StatusToken, Dropdown, GanttRuntime | gantt-v1: GanttRuntime | special guardrails only | proven |
| planning | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| dispatch | partial | contract or documented special-runtime | AppShell, ModulePage, Panel, ActionButton, Dropdown | - | ModuleHeader, ActionBar/Toolbar | partial |
| shiftMasterBoard | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| authSessionPrototype | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, ActionButton, Dropdown | layout/data-dense module: TableWrap may be absent or specialized on some states | ActionBar/Toolbar | proven |
| shiftWorkOrders | partial | contract or documented special-runtime | AppShell, ModulePage, Panel, ActionButton, Dropdown | - | ModuleHeader, ActionBar/Toolbar, TableWrap, StatusToken | partial |
| matrix | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, Dropdown | - | ActionBar/Toolbar | proven |
| routes | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, ActionBar, Dropdown | - | StatusToken | proven |
| products | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, ActionButton, ActionBar, Dropdown | - | TableWrap | proven |
| nomenclature | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| productionStructureMatrix | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| employees | partial | contract or documented special-runtime | AppShell, ModulePage, Panel, ActionButton, Dropdown | - | ModuleHeader, ActionBar/Toolbar | partial |
| timesheet | partial | contract or documented special-runtime | AppShell, ModulePage, Panel, TableWrap, ActionButton, StatusToken, Dropdown | - | ModuleHeader, ActionBar/Toolbar | partial |
| roles | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| directories | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, ActionBar, Dropdown | - | covered | proven |
| visualSystem | special-runtime | contract or documented special-runtime | AppShell, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Modal, Dropdown, VisualSystemRuntime | visual-system-v1: VisualSystemRuntime | special guardrails only | proven |
| authPrototype | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, ActionButton | layout/data-dense module: TableWrap may be absent or specialized on some states | ActionBar/Toolbar | proven |
| planningTable | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| supply | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, StatusToken, ActionBar, Dropdown | - | covered | proven |
| shopMap | contract | contract or documented special-runtime | AppShell, ModulePage, ModuleHeader, Panel, TableWrap, ActionButton, ActionBar, Dropdown | - | covered | proven |

## Gap Severity Register

| severity | area | verdict | problem | evidence | corrective task |
| --- | --- | --- | --- | --- | --- |
| high | Runtime decomposition | partial | Phase 6 created real src/ui and one extracted module, but most UI runtime is still monolithic. | src/app.js: 39103 lines; module renderers still in src/app.js: 61; src/modules files: 1; extracted module renderers: 1 | Extract one module family per pass from src/app.js into src/modules/<module>/render.js while keeping public handlers unchanged. |
| high | CSS architecture | partial | CSS entrypoint is cleaned, but selector pressure and legacy tail remain large enough to keep cascade fragile. | styles.css manifest-only: yes; duplicate selector groups: 349; styles/layers/99-legacy-overrides-tail.css: 4821 lines; !important usages: 3047 baseline-aware | Shrink 99-legacy-overrides-tail.css by moving only stable generic rules into token/component layers and deleting shadowed duplicates with css-layer-audit after each batch. |
| high | Token system | partial | Raw-token audit is present and passing only against baseline; it prevents new debt but does not prove existing debt was normalized. | raw hex usages: 1894; unique hex colors: 223; font-size px declarations: 779; spacing/position px declarations: 2094; spacing/typography/layout token group counts: 0 | Add shrinking budgets per token category and migrate one visual family at a time to semantic variables. |
| medium | Forms | partial | Form helper exists, but most form controls are still authored directly or through local classes. | renderUiFormField calls: 6; input tags in src/app.js: 98; select tags: 27; textarea tags: 5 | Migrate modal/table/sidebar forms to renderUiFormField or explicitly register exceptions for dense cells and PIN keypad. |
| medium | Overlays | partial | Overlay helpers and smoke probes exist, but many overlay implementations still use local markup/classes. | modal class mentions: 136; modal backdrop mentions: 28; drawer mentions: 50; dropdown mentions: 10; renderUiModalFrame calls: 2; renderUiDropdownFrame calls: 1 | Create overlay inventory with standard/special classification and migrate live modal shells first, keeping content DOM stable. |
| medium | Statuses/badges/chips | partial | StatusToken exists but domain-specific status/chip classes continue to carry independent visual meaning. | renderUiStatusToken calls: 57; status-pill occurrences: 39; mes-signal occurrences: 107; planning-order-state-token: 11; supply-status-pill: 11 | Separate semantic status data from visual tokens and migrate domain chips to StatusToken wrappers or named MES chip helpers. |
| medium | Module coverage | partial | Runtime registry says no partial modules, while browser coverage report still finds partial component coverage in several modules. | ui-contract-coverage summary: 14 contract, 2 special-runtime, 4 partial; partial modules: dispatch, shiftWorkOrders, employees, timesheet | Use browser coverage report as authoritative for nextMigration and align runtime registry status with measured component coverage. |
| medium | Tables and TreeTables | partial | Table contract is real and guarded, but not universal; print/visual exceptions and local tree patterns remain. | tables found: 34; tables under TableWrap: 24; documented exceptions: 10; renderUiTableWrap calls: 16 | Split production TableWrap from PrintTable/VisualSample exceptions and add TreeTable helper for hierarchy lines/selection. |
| medium | Mobile/tablet/narrow support | partial | Narrow support is smoke-tested, but warnings show it is not a complete product-ready mobile/tablet design guarantee. | ui regression viewports include 430x932 and 390x844; warnings: 11; examples: gantt header bounds limited, timesheet action zone overflow | Convert recurrent narrow warnings into either explicit limited-support exceptions or failing budgets for target tablet screens. |
| medium | Visual polish consistency | partial | Polish layer is constrained, but global consistency still depends on many older module CSS rules. | styles/ui/kit-polish.css is token-only and qa:ui-kit passes; duplicate selector groups remain 349; raw font/radius/spacing declarations remain high | Define measurable typography/radius/spacing budgets and migrate high-pressure layers by component family. |
| medium | Regression QA | partial | Automated checks reduce manual review, but do not fully replace manual product/UX review after broad visual changes. | build and all QA commands pass; visual QA covers 48/48 modules; ui regression reports 100 checks / 0 failed / 11 warnings; open states and semantics are not exhaustive | Introduce per-component golden states for open overlays, selected table rows, filled forms, and Gantt slot states. |

## Cross-Phase Compliance Matrix

| phase | expected outcome | project evidence | status | gaps | corrective action |
| --- | --- | --- | --- | --- | --- |
| Phase 1 | manifest-only CSS, exact duplicates handled, token layer strengthened, baseline QA documented, UI runtime contract documented | styles.css manifest-only with 14 imports; exact duplicate CSS rules: 0; tokens declared: 297; qa:css pass; runtime contract docs/scripts present | partial | duplicate selector groups remain 349; raw token baseline remains high; legacy tail remains 4821 lines | Convert baseline from allow-list into shrinking budgets per layer. |
| Phase 2 | qa:functional fixed, real table migration started, compatibility reduced, raw-token/table/Gantt guardrails added | qa:functional pass; table audit pass: 34 tables / 24 wrapped / 10 exceptions; raw-token audit pass baseline-aware; gantt inline style audit pass | partial | TableWrap not universal; raw-token audit protects baseline but not debt removal | Turn documented exceptions into explicit print/visual components and reduce raw-token budget. |
| Phase 3 | module coverage report, data modules migrated, toolbar/filter/action/status consolidation, duplicate selector pressure reduced, regression smoke started | ui-contract-coverage.json exists; qa:ui:regression pass; ActionButton/StatusToken helpers exist; runtime registry says hard 18 / special 2 | partial | browser coverage still shows 4 partial modules; Toolbar/FilterBar helper usage is low; status zoo remains | Use browser coverage nextMigration as failing criteria for contract modules. |
| Phase 4 | UI regression smoke, desktop/tablet/narrow checks, overflow/table/overlay/Gantt regression, exception registry, manual-check reduction report | qa:ui:regression, qa:ui:tables, qa:ui:overlays, qa:ui:gantt all pass; viewports include 1440, 1180, 1024, 430, 390 widths; overlay probes: 25; warnings: 11 | proven | manual review is reduced but not eliminated; warnings remain accepted | Promote recurring warnings to failing budgets or explicit limited-support exceptions. |
| Phase 5 | Gantt runtime map, DOM/data contract, geometry invariants, inline style classification, tokens, slot/dependency contract, regression scripts, practical migrations | src/gantt_ui_contracts.js exists; gantt reports/docs exist; qa:gantt/geometry/scale pass; data-gantt attributes present; inline style audit: 20 entries / 0 visual violations | proven | No src/gantt/ decomposition folder; Gantt remains special-runtime | Keep dedicated Gantt gates and only later split Gantt internals behind unchanged data-gantt contracts. |
| Phase 6 | runtime decomposition, extracted helpers/contracts/modules, boundary audit, helper smoke, reduced src/app.js or measurable extraction | src/ui extracted; src/ui/contracts extracted; src/modules/dispatch/render.js extracted; qa:boundaries/qa:modules:extracted pass | partial | src/app.js still 39103 lines; 61 module renderers remain in src/app.js; only 1 extracted module renderer | Extract modules incrementally with boundary gates and measurable app.js line/render count budgets. |
| Phase 7 | internal UI Kit map, VisualSystem real helper showcase, final token normalization, polish consistency, component polish, Gantt polish without geometry changes, guardrails, reduced legacy debt | VisualSystem uses production helpers; qa:ui-kit pass; styles/ui/kit-polish.css token-only; visual QA pass | partial | VisualSystem CSS is high-debt; token normalization not final; forms/overlays/statuses partial; legacy visual debt remains high | Move from showcase to strict component budget: forms, overlays, statuses, tables, actions. |

## Corrective Roadmap

| priority | problem | evidence | corrective task | expected files | expected QA | risk |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Phase 6 created real src/ui and one extracted module, but most UI runtime is still monolithic. | src/app.js: 39103 lines; module renderers still in src/app.js: 61; src/modules files: 1; extracted module renderers: 1 | Extract one module family per pass from src/app.js into src/modules/<module>/render.js while keeping public handlers unchanged. | src/modules/<module>/render.js, src/app.js, scripts/extracted-module-render-smoke.mjs | npm run qa:syntax, npm run qa:modules:extracted, npm run qa:functional | medium |
| P0 | CSS entrypoint is cleaned, but selector pressure and legacy tail remain large enough to keep cascade fragile. | styles.css manifest-only: yes; duplicate selector groups: 349; styles/layers/99-legacy-overrides-tail.css: 4821 lines; !important usages: 3047 baseline-aware | Shrink 99-legacy-overrides-tail.css by moving only stable generic rules into token/component layers and deleting shadowed duplicates with css-layer-audit after each batch. | styles/layers/99-legacy-overrides-tail.css, styles/layers/30-module-shell-ui-foundations.css, styles/ui/*.css | npm run qa:css, npm run qa:ui, npm run qa:visual | medium |
| P0 | Raw-token audit is present and passing only against baseline; it prevents new debt but does not prove existing debt was normalized. | raw hex usages: 1894; unique hex colors: 223; font-size px declarations: 779; spacing/position px declarations: 2094; spacing/typography/layout token group counts: 0 | Add shrinking budgets per token category and migrate one visual family at a time to semantic variables. | styles/mes-ui-core.css, scripts/ui-raw-token-baseline.json, styles/layers/*.css | npm run qa:ui, npm run qa:css | medium |
| P1 | Form helper exists, but most form controls are still authored directly or through local classes. | renderUiFormField calls: 6; input tags in src/app.js: 98; select tags: 27; textarea tags: 5 | Migrate modal/table/sidebar forms to renderUiFormField or explicitly register exceptions for dense cells and PIN keypad. | src/app.js, src/ui/components.js, scripts/ui-contract-qa.mjs | npm run qa:ui, npm run qa:ui:overlays, npm run qa:functional | medium |
| P1 | Overlay helpers and smoke probes exist, but many overlay implementations still use local markup/classes. | modal class mentions: 136; modal backdrop mentions: 28; drawer mentions: 50; dropdown mentions: 10; renderUiModalFrame calls: 2; renderUiDropdownFrame calls: 1 | Create overlay inventory with standard/special classification and migrate live modal shells first, keeping content DOM stable. | src/app.js, src/ui/components.js, src/ui_regression_exceptions.js | npm run qa:ui:overlays, npm run qa:functional | high |
| P1 | StatusToken exists but domain-specific status/chip classes continue to carry independent visual meaning. | renderUiStatusToken calls: 57; status-pill occurrences: 39; mes-signal occurrences: 107; planning-order-state-token: 11; supply-status-pill: 11 | Separate semantic status data from visual tokens and migrate domain chips to StatusToken wrappers or named MES chip helpers. | src/ui/components.js, src/app.js, styles/ui/status.css | npm run qa:ui, npm run qa:ui-kit | medium |
| P1 | Runtime registry says no partial modules, while browser coverage report still finds partial component coverage in several modules. | ui-contract-coverage summary: 14 contract, 2 special-runtime, 4 partial; partial modules: dispatch, shiftWorkOrders, employees, timesheet | Use browser coverage report as authoritative for nextMigration and align runtime registry status with measured component coverage. | src/ui/contracts/runtime-contracts.js, scripts/ui-contract-coverage-report.mjs, reports/ui-contract-coverage.json | npm run qa:ui-contract-coverage, npm run qa:ui | medium |
| P1 | Table contract is real and guarded, but not universal; print/visual exceptions and local tree patterns remain. | tables found: 34; tables under TableWrap: 24; documented exceptions: 10; renderUiTableWrap calls: 16 | Split production TableWrap from PrintTable/VisualSample exceptions and add TreeTable helper for hierarchy lines/selection. | src/ui/components.js, src/app.js, scripts/ui-table-contract-audit.mjs | npm run qa:ui:tables, npm run qa:ui | medium |
| P2 | Narrow support is smoke-tested, but warnings show it is not a complete product-ready mobile/tablet design guarantee. | ui regression viewports include 430x932 and 390x844; warnings: 11; examples: gantt header bounds limited, timesheet action zone overflow | Convert recurrent narrow warnings into either explicit limited-support exceptions or failing budgets for target tablet screens. | scripts/ui-module-regression-smoke.mjs, src/ui_regression_exceptions.js, docs/mobile-limited-support-map.md | npm run qa:ui:regression, npm run qa:visual | medium |
| P2 | Polish layer is constrained, but global consistency still depends on many older module CSS rules. | styles/ui/kit-polish.css is token-only and qa:ui-kit passes; duplicate selector groups remain 349; raw font/radius/spacing declarations remain high | Define measurable typography/radius/spacing budgets and migrate high-pressure layers by component family. | styles/mes-ui-core.css, styles/ui/kit-polish.css, scripts/ui-raw-token-audit.mjs | npm run qa:ui-kit, npm run qa:css, npm run qa:visual | medium |
| P2 | Automated checks reduce manual review, but do not fully replace manual product/UX review after broad visual changes. | build and all QA commands pass; visual QA covers 48/48 modules; ui regression reports 100 checks / 0 failed / 11 warnings; open states and semantics are not exhaustive | Introduce per-component golden states for open overlays, selected table rows, filled forms, and Gantt slot states. | scripts/ui-module-regression-smoke.mjs, docs/ui-regression-strategy.md, reports/*.json | npm run qa:ui:regression, npm run qa:visual | medium |

## Final Verdict

The project is not an unstable blank slate: it has real UI helper extraction, runtime contracts, CSS layering, token foundations, regression scripts, Gantt guardrails, VisualSystem helper evidence, machine-readable reports, and passing QA. That part is `proven`.

The project is also not a finished hard UI runtime. The most important gaps are measurable: `src/app.js` is still a 39103-line runtime monolith, only one module renderer is extracted, four modules are still partial in browser component coverage, legacy CSS pressure remains high, forms/overlays/statuses are only partially normalized, and raw visual values remain accepted by baseline. That makes the honest status: `partially stabilized prototype`, with high confidence.
