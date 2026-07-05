# MES UI/UX Deep Audit Report

## 0. Audit Metadata
- date: 2026-07-05T17:49:38.834Z
- branch: main
- commit hash: 7286d0c
- dirty worktree entries: 90
- scope: UI/UX architecture, design-system, CSS, tokens, helpers, tables, forms, buttons, status/badge/chip, icons, Gantt/planning, responsiveness, accessibility, QA coverage.
- production code changes: none performed by this audit. Only docs/reports and temporary audit scripts were created.
- files reviewed: `package.json`, `src/app.js`, `src/ui/*`, `src/ui_runtime_contracts.js`, `src/icons/*`, `styles.css`, `styles/mes-ui-core.css`, `styles/layers/*`, `styles/ui/*`, prior docs/reports, QA scripts.
- limitations: no manual browser screenshot review was performed during this audit; visual validation is represented by available QA commands and static evidence. Metrics parser intentionally over-counts some comma/pseudo selectors; official QA results are reported separately.

### Commands Run
| command |status |exit |seconds |last output |
| --- |--- |--- |--- |--- |
| build |pass |0 |0s |- src/app.js?v=f94806fa73b4-v.1.491 / - favicon.svg?v=cad5712c21dc-v.1.491 /  |
| lint |not available | |0s | |
| typecheck |not available | |0s | |
| qa |not available | |0s | |
| qa:ui |fail |1 |3s |- ...and 5 more /  / Move the value to styles/mes-ui-core.css token layer, reuse an existing token, or intentionally update the baseline after review. |
| qa:css |fail |1 |0s | / Failures: / - Exact duplicate CSS rule groups grew above budget: 1 > 0 |
| qa:architecture |fail |1 |3s |- ...and 5 more /  / Move the value to styles/mes-ui-core.css token layer, reuse an existing token, or intentionally update the baseline after review. |
| qa:visual |fail |1 |0s |    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) /  / Node.js v26.3.0 |
| qa:ui:regression |pass |0 |62s |- json: reports/ui-regression-summary.json / OK: UI Phase 4 regression smoke passed. /  |
| qa:functional |fail |1 |37s |    at assert (file:///Users/vladislav/Documents/Codex/2026-05-30/files-mentioned-by-the-user-mes/scripts/module-smoke-qa.mjs:259:25) /     at runModuleSpecificSmokeChecks (file:///Users/vladislav/Documents/Codex/2026-05 |
| git diff --check |fail |2 |0s |+narrow \| visualSystem \| ok \| 3 \| 2 \| 1 \| 0 \|  / docs/ui-table-regression-report.md:71: trailing whitespace. / +narrow-compact \| visualSystem \| ok \| 3 \| 2 \| 1 \| 0 \| |

## 1. Executive Summary

The current MES UI is a partially stabilized vanilla JS prototype, not a stable design-system implementation. It has real UI helpers, token files, module/page contracts, status/table helpers and a mixed icon registry, but the runtime is still largely an HTML-string monolith and the CSS cascade remains the main behavioral surface.

The most important audit result is that the current baseline is not green. `npm run build` passes, but the live run of `qa:ui`, `qa:css`, `qa:architecture`, `qa:visual`, `qa:functional`, and `git diff --check` fails. Therefore previous reports that claimed pass status are stale for the current working tree.

Source CSS remains large: 18 CSS files, 29154 lines, 3070 !important usages, 1847 raw hex values, 7309 raw px values, and 4019 lines in the legacy tail. The largest risk files are visualSystem, planning/table/matrix, shiftMasterBoard, legacy tail, and operational modules.

The token layer exists (295 definitions), but raw-value adoption is incomplete. Typography is especially fragmented: 796 raw px font-size declarations, 501 numeric font weights, and 505 raw line-height px declarations were counted.

Runtime helpers exist in `src/ui/components.js`, but `src/app.js` is still 40436 lines and contains 293 render helpers. Only 2 module renderer files are extracted. That means UI changes remain difficult to isolate.

The most fragile zones are: Gantt geometry, planning-order table/tree CSS, visualSystem drift, auth icon/style overrides in legacy tail, broad button/sidebar/table selector families, and report-driven QA/doc drift.

## 2. UI/UX Stability Verdict

**Verdict: fragile / partially stabilized.**

The system is not critical because it has a functioning build, many UI helpers, a token layer, regression scripts, and module contracts. It is not stable because several current gates fail, CSS debt is still high, and the UI kit does not yet operate as a hard compiler for interface construction.

Local fixes can still reintroduce old UI patterns because the same visual semantics are controlled by multiple families: helper output, legacy classes, module CSS, `99-legacy-overrides-tail.css`, and runtime-safety overrides.

## 3. Scorecard
| Area |Score 0-5 |Rationale |
| --- |--- |--- |
| Design system |2.5 |Helpers and contracts exist, but legacy classes and raw HTML assembly remain common. |
| Tokens |2.0 |295 token definitions, but raw visual values and zero-use aliases remain high. |
| CSS architecture |1.5 |Large layered CSS with 3070 !important and failing qa:css. |
| Components |2.0 |UI helpers exist; runtime monolith still dominates. |
| Tables |2.5 |TableWrap exists; table-specific selectors and exceptions remain large. |
| Forms |2.0 |FormField helper exists but adoption is low. |
| Buttons |2.0 |ActionButton exists but wraps legacy class contract. |
| Status/badges |2.5 |StatusToken exists; raw status/badge colors remain. |
| Icons |2.5 |Icon asset pipeline exists; runtime adoption still name-based. |
| Gantt/planning |2.0 |Special runtime protected but not normalized. |
| Responsiveness |2.0 |Regression smoke passes, but visual QA and coverage gaps remain. |
| Accessibility |1.5 |No dedicated a11y gate; modal/focus/icon-label policy incomplete. |
| Visual QA |1.5 |qa:visual fails because module list is stale. |
| Developer experience |2.0 |Many scripts exist, but dirty baseline and conflicting reports reduce trust. |

## 4. Top 20 Risks
| ID |severity |area |finding |evidence |impact |recommended next action |
| --- |--- |--- |--- |--- |--- |--- |
| UIUX-001 |critical |qa |Current UI stabilization baseline is not green |reports/ui-ux-deep-audit-metrics.json:qa.commandsRun; scripts/design-qa-snapshots.mjs:21-24; scripts/module-smoke-qa.mjs:1806-1810 |Previous pass claims cannot be used as current proof. Any UI refactor has to start from a failing baseline. |Separate current baseline failures into explicit repair tasks before treating guardrails as reliable release gates. |
| UIUX-002 |critical |css |CSS cascade remains large and high-risk |reports/ui-ux-deep-audit-metrics.json:css; styles/layers/80-visual-system-ui-states.css:1-4244; styles/layers/70-planning-table-and-matrix.css:1-3601 |Changing a visual rule globally is still risky because selector families and raw declarations compete across layers. |Treat CSS debt as budgets per family, not only per file: actions/buttons, tables, shell/sidebar, visualSystem, Gantt. |
| UIUX-003 |high |css |Planning CSS has an exact duplicate rule budget failure |styles/ui/planning-order.css:219-220; styles/ui/planning-order.css:503-504; reports/ui-ux-deep-audit-metrics.json:qa.commandsRun qa:css |The table redesign work reintroduced a simple duplicate despite previous duplicate budgets. |Make duplicate selector budget fail before final reports are accepted, then collapse planning-order duplicate families. |
| UIUX-004 |high |components |Runtime is still dominated by src/app.js |src/app.js:6490-6788; src/modules/dispatch/render.js:1-15; src/modules/nomenclature/render.js:1-185 |UI changes often require editing the monolith, so local fixes can easily affect unrelated modules. |Continue runtime decomposition by extracting high-churn UI modules after audit baseline is green. |
| UIUX-005 |high |tokens |Token layer exists but adoption is partial |src/ui_runtime_contracts.js:176-220; reports/ui-ux-deep-audit-metrics.json:tokens.lowUseTokens; styles/layers/80-visual-system-ui-states.css:3318-3339 |A request like changing spacing or typography globally still reaches only part of the system. |Move from token declaration to adoption budgets: density, typography, control, table, and icon tokens should have minimum usage and raw-value ceilings. |
| UIUX-006 |high |tables |Table contract is present but not universal |src/ui/components.js:201-206; reports/corrective-phase-b-metrics.json:metrics.table; reports/ui-ux-deep-audit-metrics.json:tables |Density, selected row, hover, sticky, and overflow behavior can still differ by module. |Prioritize planning, shiftWorkOrders, routes/products, timesheet, and productionStructureMatrix table families for one table-density contract. |
| UIUX-007 |high |buttons |Button contract wraps legacy classes instead of replacing them |src/ui/components.js:82-99; src/ui_runtime_contracts.js:85-88; reports/ui-ux-deep-audit-metrics.json:components.helperMetrics |Fixing a button bug may still require touching legacy and new selectors together. |Split semantic button API from legacy compatibility classes and shrink direct primary/secondary usage budget. |
| UIUX-008 |high |icons |Icon pipeline is richer than runtime adoption |src/icons/mes-mixed/source/reports/mixed-icon-manifest.json:1-20; src/app.js:40289-40295; src/icons/custom-mes/registry.js:14-24 |Approved icon semantics can drift when runtime calls are still name-based instead of semantic-source validated. |Audit all icon(name) calls into semantic/system/fallback categories and gate unmapped names. |
| UIUX-009 |high |gantt |Gantt remains a special runtime outside normal UI primitives |src/app.js:35175-35190; src/app.js:36505-36620; src/ui/components.js:266-279 |Mass CSS changes can break geometry/hit areas; Gantt needs its own contract and visual guardrails. |Keep Gantt under special-runtime budget and do not migrate geometry through broad CSS cleanup. |
| UIUX-010 |high |visualSystem |Visual system page and smoke expectations are out of sync |scripts/module-smoke-qa.mjs:1806-1814; reports/ui-ux-deep-audit-metrics.json:qa.commandsRun qa:functional; src/app.js:21149-21153 |The internal UI-kit reference cannot be trusted as a complete visual acceptance surface until smoke and page match. |Decide whether visualSystem V2 is intentionally compact, then update smoke or rebuild the sections to the stated contract. |
| UIUX-011 |medium |forms |FormField adoption is low compared with raw controls |src/ui/components.js:209-216; reports/ui-ux-deep-audit-metrics.json:components.helperMetrics; src/app.js:15147-15251 |Control height, label alignment, focus, disabled and validation states remain fragmented. |Introduce form-control coverage budgets per module and migrate high-touch forms first: auth, timesheet, planning labor, roles. |
| UIUX-012 |medium |accessibility |Accessibility coverage is opportunistic, not systematic |src/ui/components.js:94-98; src/ui/components.js:228-242; package.json:scripts |Keyboard and screen-reader regressions can pass current QA. |Add non-invasive a11y audit coverage: focusable controls, icon-button labels, modal focus, form labels, contrast token checks. |
| UIUX-013 |medium |responsiveness |Responsive QA exists but does not cover all current runtime modules |scripts/design-qa-snapshots.mjs:17-24; docs/ui-table-regression-report.md:20-23; reports/ui-ux-deep-audit-metrics.json:qa.commandsRun qa:ui:regression |A green regression smoke does not prove full visual stability for newly added modules. |Require runtime module registry and visual snapshot module list to be generated from the same source. |
| UIUX-014 |medium |status |Status/badge cleanup is incomplete |src/ui/components.js:56-59; src/app.js:34966-34970; docs/corrective-phase-b-result.md:68-84 |Status tone and badge styling can diverge across Gantt, tables, supply, auth, workshop and visual samples. |Continue status migration but track semantic status state, not just class tokenization. |
| UIUX-015 |medium |layout |Shell/sidebar/topbar selectors are repeated across many layers |reports/ui-ux-deep-audit-metrics.json:css.largestDuplicateSelectorGroups; styles/layers/30-module-shell-ui-foundations.css:1-2660; styles/layers/50-nomenclature-routes-directories.css:1279-1519 |Sidebar/topbar fixes can still create per-module drift, as seen in recent manual QA loops. |Move app sidebar/topbar/sidebar-item to a single locked CSS family and block page-specific overrides except explicit contracts. |
| UIUX-016 |medium |docs |Previous pass claims are stale against current command results |docs/ui-stabilization-master-plan.md:112-119; docs/ui-global-forensic-audit.md:21-36; reports/ui-ux-deep-audit-metrics.json:qa.commandsRun |Old docs are useful context but cannot be used as acceptance proof. |Stamp every future report with current git commit, dirty-state, and machine-readable command output. |
| UIUX-017 |medium |legacy |Legacy tail is still used for new high-specificity fixes |styles/layers/99-legacy-overrides-tail.css:3911-3944; reports/ui-ux-deep-audit-metrics.json:css.cssByFile 99-legacy-overrides-tail.css; docs/ui-stabilization-master-plan.md:121-127 |The compatibility layer is still acting as a patch surface, not only a containment layer. |Freeze new writes to legacy tail except documented compatibility, and migrate recent auth/sidebar fixes into tokenized module CSS. |
| UIUX-018 |medium |typography |Typography is not globally controllable |reports/ui-ux-deep-audit-metrics.json:typography; styles/layers/80-visual-system-ui-states.css:3340-3344; styles/ui/planning-order.css:221-229 |Changing type scale globally will only partially affect dense screens. |Create typography budgets by component: topbar/sidebar, table, card, panel, form, gantt. |
| UIUX-019 |medium |inline-style |Inline style usage is extensive and partly intentional |src/app.js:35175-35190; src/app.js:36551-36620; src/app.js:21457-21459 |Inline styles are not all bad, but without classification they weaken token audits and CSS guardrails. |Classify inline styles as geometry-required, CSS-var-only, demo-only, or debt; fail only unclassified usage. |
| UIUX-020 |medium |git |Working tree is too dirty for clean acceptance |reports/ui-ux-deep-audit-metrics.json:git.statusShort; docs/ui-table-regression-report.md:19,32,45,58,71; reports/ui-ux-deep-audit-metrics.json:qa.commandsRun git diff --check |It is hard to distinguish user edits, generated artifacts, and audit changes; acceptance evidence can be contaminated. |Before major UI refactors, create a clean checkpoint or branch, then keep audit/report output isolated. |

## 5. Claims vs Reality
| Claim from previous report |current evidence |status |notes |
| --- |--- |--- |--- |
| styles.css manifest-only |Source styles.css has 19 lines and zero selectors. |true |metrics cssByFile styles.css |
| qa:ui pass |Current qa:ui is fail. |false/currently stale |reports ui-ux metrics |
| qa:css pass |Current qa:css is fail. |false/currently stale |Exact duplicate in planning-order.css. |
| qa:architecture pass |Current qa:architecture is fail. |false/currently stale |Transitive qa:ui failure. |
| qa:visual pass |Current qa:visual is fail. |false/currently stale |weeklyProductionControl missing from visual snapshot list. |
| legacy tail reduced |Current legacy tail is 4019 lines. |partial |Corrective B after was 3961; current source audit sees 4019. |
| duplicate selectors low/shrinking |Current parser sees 1300; official qa:css fails exact duplicate budget. |partial/false |metrics + qa output |
| table contract introduced |TableWrap exists and table audit says 23/33 under wrap. |partial |src/ui/components.js + corrective metrics |
| token layer strengthened |Tokens exist, but raw value violations remain very high. |partial |metrics tokens/css |
| Gantt remains special runtime |Live Gantt still has inline geometry and special renderSlot path. |true |src/app.js renderSlot |
| status/badge/chip cleaned |14 patterns tokenized, but current status/badge debt remains. |partial |docs/corrective-phase-b-result.md |

Previous reports are still useful context, but they are not current acceptance evidence. The strongest stale claims are command-pass claims, because the same commands now fail in this audit run.

## 6. Metrics

### CSS Metrics
| Metric |Value |
| --- |--- |
| CSS files |18 |
| CSS total lines |29154 |
| !important |3070 |
| raw hex |1847 |
| raw px |7309 |
| duplicate selector groups audit parser |1300 |
| exact duplicate rule groups audit parser |147 |
| legacy tail lines |4019 |
| border-radius px declarations |260 |
| media queries |113 |

### Top Risky CSS Files
| file |lines |!important |raw hex |raw px |selectors |
| --- |--- |--- |--- |--- |--- |
| styles/layers/80-visual-system-ui-states.css |4244 |963 |169 |966 |1097 |
| styles/layers/70-planning-table-and-matrix.css |3601 |753 |222 |984 |1083 |
| styles/layers/90-shift-master-board.css |2840 |413 |158 |782 |765 |
| styles/layers/99-legacy-overrides-tail.css |4019 |344 |142 |1070 |1054 |
| styles/layers/60-operational-modules.css |2472 |234 |154 |611 |707 |
| styles/mes-ui-core.css |1261 |149 |73 |219 |327 |
| styles/ui/planning-order.css |734 |128 |19 |210 |178 |
| styles/layers/40-gantt-planning-routes.css |1639 |38 |126 |515 |399 |
| styles/layers/30-module-shell-ui-foundations.css |2660 |22 |168 |621 |832 |
| styles/ui/runtime-safety.css |170 |21 |0 |1 |125 |
| styles/layers/50-nomenclature-routes-directories.css |2444 |4 |205 |600 |616 |
| styles/layers/10-shell-directory-gantt-base.css |1847 |1 |297 |524 |462 |
| styles/layers/20-technology-specifications.css |628 |0 |95 |179 |187 |
| styles/layers/00-foundation-base.css |85 |0 |18 |22 |14 |
| styles/ui/actions.css |67 |0 |1 |2 |19 |
| styles/ui/kit-polish.css |317 |0 |0 |3 |84 |
| styles/ui/status.css |107 |0 |0 |0 |44 |
| styles.css |19 |0 |0 |0 |0 |

### Largest Duplicate Selector Families
| selector |occurrences |files |
| --- |--- |--- |
| .icon-button |33 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/70-planning-table-and-matrix.css, styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css, styles/layers/99-legacy-overrides-tail.css, styles/mes-ui-core.css, styles/ui/runtime-safety.css |
| .secondary-button |30 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/70-planning-table-and-matrix.css, styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css, styles/mes-ui-core.css, styles/ui/runtime-safety.css |
| small) |29 |styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css, styles/layers/99-legacy-overrides-tail.css, styles/mes-ui-core.css, styles/ui/actions.css, styles/ui/kit-polish.css, styles/ui/planning-order.css |
| .directories-page |28 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css |
| .module-data-page |26 |styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css |
| .primary-button |25 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css, styles/mes-ui-core.css, styles/ui/runtime-safety.css |
| select |21 |styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/70-planning-table-and-matrix.css, styles/layers/80-visual-system-ui-states.css, styles/layers/99-legacy-overrides-tail.css, styles/mes-ui-core.css, styles/ui/kit-polish.css |
| .table-icon-button |20 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css, styles/layers/99-legacy-overrides-tail.css, styles/ui/runtime-safety.css |
| .planner-workspace |20 |styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css |
| :root |19 |styles/layers/00-foundation-base.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/70-planning-table-and-matrix.css, styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css |
| body |18 |styles/layers/00-foundation-base.css, styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/80-visual-system-ui-states.css, styles/layers/90-shift-master-board.css |
| .module-tab |18 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/70-planning-table-and-matrix.css, styles/ui/runtime-safety.css |
| .directory-table th |18 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/70-planning-table-and-matrix.css |
| .module-data-workspace |18 |styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/70-planning-table-and-matrix.css |
| .directory-workspace |17 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/70-planning-table-and-matrix.css |
| .directory-table-card |17 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/70-planning-table-and-matrix.css |
| .planning-app-shell |16 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css |
| .directory-sidebar |16 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/70-planning-table-and-matrix.css |
| .topbar |15 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/20-technology-specifications.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/70-planning-table-and-matrix.css |
| .directory-table td |15 |styles/layers/10-shell-directory-gantt-base.css, styles/layers/30-module-shell-ui-foundations.css, styles/layers/50-nomenclature-routes-directories.css, styles/layers/60-operational-modules.css, styles/layers/70-planning-table-and-matrix.css, styles/layers/80-visual-system-ui-states.css |

### Component/Helper Metrics
| Metric |Value |
| --- |--- |
| renderHelpersInApp |293 |
| renderHelpersInUiComponents |26 |
| renderUiActionButtonCalls |59 |
| rawPrimaryButtonOccurrences |15 |
| rawSecondaryButtonOccurrences |60 |
| renderUiTableWrapCalls |19 |
| rawTableWrapOccurrences |41 |
| renderUiStatusTokenCalls |63 |
| statusPillOccurrences |22 |
| renderUiFormFieldCalls |9 |
| rawInputTags |92 |
| rawSelectTags |32 |
| rawTextareaTags |5 |
| renderUiModalCalls |15 |
| rawModalClassOccurrences |138 |
| iconHelperCalls |213 |
| inlineStyleAttributes |117 |
| directStyleApiCalls |19 |
| inlineSvgOccurrences |7 |

### Icon Metrics
| Metric |Value |
| --- |--- |
| semanticSlugs |129 |
| customSvgCount |47 |
| lucideMappedCount |82 |
| localFallbackCount |1 |
| runtimeMixedRegistryEntries |3 |
| legacyIconUsages |213 |
| unmappedIconUsages |0 |

## 7. Module-by-module Audit Matrix
| Module |UI consistency |CSS risk |component risk |icon risk |responsive risk |accessibility risk |notes |
| --- |--- |--- |--- |--- |--- |--- |--- |
| authPrototype |2 |3 |3 |2 |3 |2 |Standalone auth has strong visual needs; recent icon fixes live in legacy tail. |
| authSessionPrototype |3 |3 |3 |2 |3 |2 |Tablet workplace is feature-rich; keypad/report flows need a11y and density checks. |
| gantt |2 |4 |4 |2 |4 |2 |Special geometry runtime; do not touch with broad CSS. |
| planning |2 |4 |4 |2 |3 |2 |Planning-order CSS currently fails duplicate rule budget. |
| weeklyProductionControl |2 |3 |3 |2 |3 |2 |New module is in runtime contracts but missing from visual QA module list. |
| shiftMasterBoard |3 |3 |3 |2 |3 |2 |Workshop UI has many cards/forms/loadbars; visually sensitive. |
| shiftWorkOrders |3 |3 |3 |2 |3 |2 |Best recent table/right-card direction, but tree/table CSS still local. |
| products |2 |3 |3 |2 |3 |2 |Older directory/specification layout remains mixed. |
| routes |2 |3 |3 |2 |3 |2 |Print and route table paths have exceptions. |
| nomenclature |3 |2 |3 |2 |3 |2 |Extracted module renderer exists; still has manual table action button. |
| productionStructureMatrix |2 |4 |3 |2 |4 |2 |Very wide matrix; responsive and table density risk. |
| timesheet |2 |4 |3 |1 |4 |2 |Large calendar table and modal form need dedicated contracts. |
| roles |3 |2 |3 |2 |3 |2 |Uses helpers more consistently but permission table remains dense. |
| employees |2 |3 |3 |2 |3 |2 |Hierarchy uses CSS grid/SVG connectors and inline grid placement. |
| visualSystem |1 |4 |3 |3 |2 |2 |Smoke expects sections that current page no longer exposes. |
| dispatch |4 |1 |4 |1 |2 |3 |Small extracted placeholder module. |

Scale: 0 not checked, 1 critical, 2 poor, 3 medium, 4 good, 5 stable.

## 8. CSS Architecture Audit

The project has a layered CSS architecture, but the layers do not yet behave as strict ownership boundaries. `styles.css` is currently import-only, which is good, but the source CSS graph is still large and includes multiple selectors for the same semantics.

| CSS area |current state |risk |evidence |suggested direction |
| --- |--- |--- |--- |--- |
| Entry manifest |styles.css is 19 lines and import-only in source audit. |low |styles.css; metrics css.files |Keep manifest-only guard. |
| Core tokens |styles/mes-ui-core.css has 1261 lines, 149 !important, 219 raw px. |medium |reports metrics cssByFile |Separate pure token definitions from compatibility selectors. |
| Legacy tail |4019 lines, 344 !important, 1070 raw px. |high |styles/layers/99-legacy-overrides-tail.css |Freeze new writes and migrate recent fixes. |
| Visual system CSS |4244 lines, 963 !important; qa:ui raw-token failure source. |high |styles/layers/80-visual-system-ui-states.css |Turn visualSystem into token consumer, not override lab. |
| Planning/table CSS |3601 lines, 753 !important and exact duplicate failure. |high |styles/layers/70 + styles/ui/planning-order.css |Unify planning/table families and collapse duplicates. |
| Gantt CSS |Special runtime with geometry-sensitive CSS and inline positioning. |high |src/app.js renderSlot + styles/layers/40 |Only change through Gantt contracts and screenshots. |

Current CSS risk is not just file size. The bigger issue is overlapping responsibility: `.icon-button`, `.secondary-button`, `.primary-button`, `.module-tab`, `.directory-sidebar`, `.directory-table th`, `.directory-table td`, `.module-data-page`, `.directory-workspace`, and Gantt/planning selectors occur across many layers. This is why isolated visual fixes can create side effects.

## 9. Token Audit

Token adoption score: **2/5**. Tokens exist, but they are not yet the only practical way to change UI. There are 295 definitions and 2875 references, but 9156 raw visual-value violations by the audit count.

| Token type |status |usage |violations |evidence |recommendation |
| --- |--- |--- |--- |--- |--- |
| Color/surface |partial |Declared and used, but raw hex/rgba remains high. |1847 raw hex |Budget raw colors by layer. |
| Spacing/density |weak |Aliases exist but several have zero refs. |lowUseTokens includes density/control aliases |Adoption budget for page/panel/table/control spacing. |
| Typography |weak |Many raw px/numeric declarations. |796 raw font-size px; 501 numeric weights |Move table/sidebar/panel typography to semantic tokens. |
| Radius/elevation |partial |Tokens exist, but raw border-radius px remains. |260 border-radius px declarations |Budget radii by component family. |
| Status |partial |Status tokens exist, but raw local colors remain. |Corrective Phase B reported 107 raw local status colors. |Semantic status registry and source audit. |
| Gantt |partial/special |Gantt tokens exist, but geometry stays inline/special. |renderSlot inline geometry |Separate color tokens from geometry invariants. |

The most important token gap is not declaration but adoption. Several aliases added for future control/density/typography work have zero references, while module layers still contain raw px, rgba and numeric font weights.

## 10. Component/render Helper Audit

The project has a real helper layer in `src/ui/components.js`: Panel, ModulePage, ModuleSidebar, ModuleHeader, ActionButton, TableWrap, FormField, Modal, Drawer, Dropdown, StatusToken and demo markers. The limitation is that helpers coexist with legacy class names and direct HTML assembly.

| Component/helper |purpose |centralized? |bypasses found |risk |evidence |
| --- |--- |--- |--- |--- |--- |
| renderUiActionButton |Buttons/actions |partial |raw primary/secondary/icon/table button classes remain |high |src/ui/components.js:82-99; metrics raw button counts |
| renderUiTableWrap |Table scroll wrapper |partial |raw table tags and print/sample exceptions remain |high |src/ui/components.js:201-206; metrics tables |
| renderUiStatusToken |Status token |partial |status-pill/local badge classes remain |medium |src/ui/components.js:56-59; src/app.js:34966-34970 |
| renderUiFormField |Label/control wrapper |low adoption |raw input/select/textarea tags remain |high |src/ui/components.js:209-216; metrics raw controls |
| renderUiModalFrame/Shell |Modal shell |partial |raw modal classes/backdrops remain |medium |src/ui/components.js:228-245; metrics rawModalClassOccurrences |
| renderUiGanttBar |Gantt sample component |not live Gantt |live Gantt uses renderSlot and inline geometry |high |src/ui/components.js:266-279; src/app.js:36505-36620 |
| icon(name) |Icon renderer |central but generic |semantic source validation incomplete at runtime |medium |src/app.js:40289-40295 |

## 11. Tables/forms/buttons/status Audit

### Tables

There is a TableWrap helper and a table contract, but tables are still one of the densest risk areas. The audit found raw table tags, many table-specific CSS selectors, and an exact duplicate failure in planning-order CSS. Table density cannot be safely changed globally yet.

### Forms

FormField exists but adoption is low. Auth, timesheet, planning labor, roles and modal forms still include raw controls or local layout. Focus, disabled, validation and placeholder policies are not centrally enforced.

### Buttons

ActionButton exists but its implementation maps tones to legacy class names. This is acceptable as compatibility but not as a hard design-system boundary. A future button bug can still require changes in `.primary-button`, `.secondary-button`, `.icon-button`, `.table-icon-button`, `.ui-action-button`, and module overrides.

### Status / Badge / Chip

StatusToken exists and Corrective Phase B tokenized multiple patterns, but Gantt and other modules still combine StatusToken with `status-pill` compatibility classes. Status cleanup should continue by semantic state, not only class migration.

## 12. Icons Audit

The icon system is in transition. The mixed icon package is present in `src/icons/mes-mixed/source`, with custom SVG, open-source mappings and a local fallback. The active runtime imports custom MES registry helpers, and the generic `icon(name)` helper renders SVG from that registry. However, runtime usage is still name-based and widespread.

| semanticSlug |current source |expected source |status |evidence |
| --- |--- |--- |--- |--- |
| search |open-source mapping |system UI icon |needs runtime mapping audit |src/icons/mes-mixed/source/mappings/opensource-system-icon-map.json |
| filter |open-source mapping |system UI icon |needs runtime mapping audit |same |
| save |open-source mapping |system UI icon |needs runtime mapping audit |same |
| copy |open-source mapping |system UI icon |needs runtime mapping audit |same |
| calendar |open-source mapping |system UI icon |needs runtime mapping audit |same |
| gantt |open-source/system semantic |system UI icon |needs runtime mapping audit |src/app.js icon calls |
| missing-print |manifest/mapping expected |system missing-state icon |unknown without manual source audit |mixed icon manifest |
| missing-users |manifest/mapping expected |system missing-state icon |unknown without manual source audit |mixed icon manifest |
| department-smt |custom SVG |custom-approved |needs visual review |src/icons/mes-mixed/source/custom-approved/svg/by-semantic |
| department-manual-assembly |custom SVG |custom-approved |needs visual review |same |
| department-coating |custom SVG |custom-approved |needs visual review |same |
| production-floor-plan |local fallback SVG |local fallback |covered as fallback |src/icons/mes-mixed/source/local-fallback-svg/by-semantic |

The audit does not approve icon visual quality. It only verifies that sources and registries exist. Visual approval still requires PNG/reference vs SVG review.

## 13. Gantt/planning Audit

Gantt is not fully inside the design system. It is a special runtime with its own geometry, inline positioning, dependency drawing, segmented bars, resize handles, transfer visuals, and operational layers. This is reasonable for a Gantt, but it means Gantt must be protected by its own contracts and screenshots.

Do not mass-change Gantt geometry via CSS cleanup. Safe areas are colors, typography labels, selected/hover states and status tokens only when guarded by Gantt-specific smoke and visual QA.

Planning order UI is closer to the newer table/tree direction but currently has exact duplicate CSS and high-specificity selectors. It should be treated as a priority table-contract migration target after baseline QA is green.

## 14. Accessibility Audit

| Area |issue |severity |evidence |recommendation |
| --- |--- |--- |--- |--- |
| Icon buttons |No hard rule that icon-only actions must have aria-label. |medium |renderUiActionButton allows empty label + iconName. |Add helper-level validation or QA scan. |
| Modals |role=dialog exists but no focus trap evidence in helper. |medium |src/ui/components.js:228-245. |Add focus-trap/initial-focus contract or smoke. |
| Forms |Raw controls outnumber FormField usage. |high |metrics rawInputTags/rawSelectTags/rawTextareaTags. |Require labels and focus-visible by helper. |
| Tables |Dense tables may have keyboard/focus gaps. |medium |large table families and tree rows. |Audit row keyboard selection and aria-expanded. |
| Status |Color/status coupling not centrally guaranteed. |medium |StatusToken partial adoption. |Require text equivalents for status icons/badges. |

There is no dedicated lint/a11y/typecheck command in package scripts. Therefore accessibility stability is currently inferred from markup patterns, not proven by a gate.

## 15. Visual QA and Regression Coverage Audit

Why current QA may be insufficient:

- `qa:ui:regression` passed, but `qa:visual` failed before taking snapshots because `weeklyProductionControl` exists in runtime registry but not in `design-qa-snapshots.mjs` module lists.
- `qa:functional` failed on visualSystem panel assumptions, meaning the internal UI reference and test expectation are out of sync.
- `git diff --check` failed on generated docs, so even generated report artifacts are not clean.
- Visual QA commands are valuable but currently prove only subsets. They do not replace manual inspection of new modules until coverage is synced with runtime contracts.

## 16. Evidence Index

See `reports/ui-ux-deep-audit-evidence-index.md` for a finding-by-finding evidence map. Machine metrics are in `reports/ui-ux-deep-audit-metrics.json`; structured findings are in `reports/ui-ux-deep-audit-findings.json`.

## 17. Recommended Remediation Roadmap

### Phase A - Baseline repair, no redesign
- Fix current `git diff --check` trailing whitespace.
- Fix exact duplicate rule in `styles/ui/planning-order.css`.
- Sync `weeklyProductionControl` into visual QA module lists or generate lists from runtime contracts.
- Align `visualSystem` smoke expectations with the active V2 page.
- Re-run build, qa:ui, qa:css, qa:architecture, qa:visual, qa:functional, qa:ui:regression.

### Phase B - Hard UI contract budgets
- Introduce budgets for raw button classes, raw tables, raw form controls, unclassified inline styles.
- Split Gantt geometry inline styles into allowed category and fail unclassified inline style usage.
- Lock sidebar/topbar/button/table duplicate selector families.

### Phase C - Component migration by module
- Migrate planning, timesheet, productionStructureMatrix, auth/workplace forms, and shiftWorkOrders tables under stricter helpers.
- Extract high-churn render modules from `src/app.js` after baseline is green.
- Move recent legacy-tail patches into module-owned tokenized CSS.

### Phase D - Visual system as source of truth
- Rebuild visualSystem around current production UI states only.
- Keep icon visual approval separate from runtime icon packaging.
- Generate visual QA scenarios from runtime registry.

## 18. What to Send to ChatGPT

Use `docs/ui-ux-deep-audit-chat-brief.md`. It contains the short summary, command failures, metrics and the remediation questions for external review.
