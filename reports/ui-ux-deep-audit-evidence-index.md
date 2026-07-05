# UI/UX Deep Audit Evidence Index

Generated: 2026-07-05T17:49:38.834Z

## Machine Reports
- `reports/ui-ux-deep-audit-metrics.json` - generated metrics, command output, git dirty state, top CSS files/selectors.
- `reports/ui-ux-deep-audit-findings.json` - structured findings with file/line evidence.
- `reports/tmp/ui-ux-deep-audit.mjs` - temporary source audit script.
- `reports/tmp/write-ui-ux-deep-audit-docs.mjs` - temporary document writer.

## High-value Evidence
### UIUX-001 Current UI stabilization baseline is not green
- reports/ui-ux-deep-audit-metrics.json:qa.commandsRun - qa.commandsRun: Current command results collected during this audit.
- scripts/design-qa-snapshots.mjs:21-24 - missingVisualRuntimeModuleIds: Visual QA fails when runtime module registry contains a module not listed in visual snapshot module IDs.
- scripts/module-smoke-qa.mjs:1806-1810 - visualSystem panelCount: Functional smoke expects visualSystem >= 8 panels, current smoke observed 1.

### UIUX-002 CSS cascade remains large and high-risk
- reports/ui-ux-deep-audit-metrics.json:css - css metrics: Current CSS counters.
- styles/layers/80-visual-system-ui-states.css:1-4244 - visual system CSS layer: Top risky CSS file by current audit: high important/raw value pressure.
- styles/layers/70-planning-table-and-matrix.css:1-3601 - planning/table CSS layer: Second-highest risk CSS file and current weekly/planning/table concentration.

### UIUX-003 Planning CSS has an exact duplicate rule budget failure
- styles/ui/planning-order.css:219-220 - planning-order-table nth-child(5): First width declaration for fifth column.
- styles/ui/planning-order.css:503-504 - planning-order-table nth-child(5): Second exact duplicate width declaration.
- reports/ui-ux-deep-audit-metrics.json:qa.commandsRun qa:css - qa:css: qa:css failure reason records the duplicate rule.

### UIUX-004 Runtime is still dominated by src/app.js
- src/app.js:6490-6788 - render(options): Main render switch still owns module routing/render binding.
- src/modules/dispatch/render.js:1-15 - renderDispatchModulePage: One small extracted module renderer exists.
- src/modules/nomenclature/render.js:1-185 - renderNomenclatureModulePage: Second extracted module renderer exists.

### UIUX-005 Token layer exists but adoption is partial
- src/ui_runtime_contracts.js:176-220 - UI_RUNTIME_STYLE_TOKENS: Token registry exists.
- reports/ui-ux-deep-audit-metrics.json:tokens.lowUseTokens - lowUseTokens: Control/density/font aliases with zero references are listed.
- styles/layers/80-visual-system-ui-states.css:3318-3339 - .visual-system-section-head: Current qa:ui raw-token failure lines use local px/rgba values.

### UIUX-006 Table contract is present but not universal
- src/ui/components.js:201-206 - renderUiTableWrap: Shared TableWrap helper exists.
- reports/corrective-phase-b-metrics.json:metrics.table - table audit metrics: Prior table budget reports 33 tables and 23 under TableWrap.
- reports/ui-ux-deep-audit-metrics.json:tables - tables metrics: Current raw table and selector counts.

### UIUX-007 Button contract wraps legacy classes instead of replacing them
- src/ui/components.js:82-99 - renderUiActionButton: Shared ActionButton maps tone to legacy button classes.
- src/ui_runtime_contracts.js:85-88 - ActionButton contract: Contract itself includes legacy class selectors.
- reports/ui-ux-deep-audit-metrics.json:components.helperMetrics - raw button occurrences: Current direct class counts.

### UIUX-008 Icon pipeline is richer than runtime adoption
- src/icons/mes-mixed/source/reports/mixed-icon-manifest.json:1-20 - mixed-icon-manifest: Manifest declares custom/open-source/fallback policy and entries.
- src/app.js:40289-40295 - icon(name): Runtime icon rendering is still a generic helper path.
- src/icons/custom-mes/registry.js:14-24 - MES_CUSTOM_ICON_*: Custom icon registry exists.

### UIUX-009 Gantt remains a special runtime outside normal UI primitives
- src/app.js:35175-35190 - renderGanttTimelineWeekGroup/renderGanttTimelineDayCell: Timeline geometry is inline left/width px.
- src/app.js:36505-36620 - renderSlot: Slot geometry uses inline left/top/width/height and CSS vars.
- src/ui/components.js:266-279 - renderUiGanttBar: Shared GanttBar is a demo/contract sample, not the live Gantt renderer.

### UIUX-010 Visual system page and smoke expectations are out of sync
- scripts/module-smoke-qa.mjs:1806-1814 - runModuleSpecificSmokeChecks visualSystem: Smoke expectations for visual system page.
- reports/ui-ux-deep-audit-metrics.json:qa.commandsRun qa:functional - qa:functional: Current failure reason: visualSystem expected panels got 1.
- src/app.js:21149-21153 - renderVisualSystemPage/renderVisualSystemPageV2: Active visualSystem route delegates to V2 page.

### UIUX-011 FormField adoption is low compared with raw controls
- src/ui/components.js:209-216 - renderUiFormField: Shared form helper exists.
- reports/ui-ux-deep-audit-metrics.json:components.helperMetrics - rawInputTags/rawSelectTags/rawTextareaTags: Current raw control counts.
- src/app.js:15147-15251 - renderTimesheetEditorModal: Example of modal form controls/actions assembled locally.

### UIUX-012 Accessibility coverage is opportunistic, not systematic
- src/ui/components.js:94-98 - renderUiActionButton: Button helper has data-ui-component but no required aria-label policy for icon-only labels.
- src/ui/components.js:228-242 - renderUiModalFrame/renderUiModalShell: Modal helper sets role/dialog but no focus trap evidence.
- package.json:scripts - scripts: No lint/a11y script is available in current package scripts.

### UIUX-013 Responsive QA exists but does not cover all current runtime modules
- scripts/design-qa-snapshots.mjs:17-24 - moduleIds/missingVisualRuntimeModuleIds: weeklyProductionControl is missing from visual snapshot module IDs.
- docs/ui-table-regression-report.md:20-23 - tablet rows: Tablet report rows record overflow values for planning/routes and products missing tables.
- reports/ui-ux-deep-audit-metrics.json:qa.commandsRun qa:ui:regression - qa:ui:regression: Regression smoke passes but visual QA fails separately.

### UIUX-014 Status/badge cleanup is incomplete
- src/ui/components.js:56-59 - renderUiStatusToken: Shared status token helper exists.
- src/app.js:34966-34970 - status-strip: Gantt combines StatusToken with legacy status-pill class names.
- docs/corrective-phase-b-result.md:68-84 - Phase B metrics: Previous report still listed 107 raw local status colors.

### UIUX-015 Shell/sidebar/topbar selectors are repeated across many layers
- reports/ui-ux-deep-audit-metrics.json:css.largestDuplicateSelectorGroups - largestDuplicateSelectorGroups: Shows repeated layout selectors and files.
- styles/layers/30-module-shell-ui-foundations.css:1-2660 - module shell CSS: Primary shell layer.
- styles/layers/50-nomenclature-routes-directories.css:1279-1519 - legacy sidebar variables/selectors: Older sidebar layout variables coexist with newer shell tokens.

### UIUX-016 Previous pass claims are stale against current command results
- docs/ui-stabilization-master-plan.md:112-119 - Итоговые проверки: Previous report claims qa:ui/css/architecture/functional/git diff pass.
- docs/ui-global-forensic-audit.md:21-36 - Commands executed: Previous forensic report claims qa:visual and others pass.
- reports/ui-ux-deep-audit-metrics.json:qa.commandsRun - current command results: Current live run contradicts those claims.

### UIUX-017 Legacy tail is still used for new high-specificity fixes
- styles/layers/99-legacy-overrides-tail.css:3911-3944 - auth-prototype icon overrides: Recent auth icon fixes live in legacy tail with !important.
- reports/ui-ux-deep-audit-metrics.json:css.cssByFile 99-legacy-overrides-tail.css - legacy tail metrics: Legacy tail has 4019 lines, 344 !important, 1070 raw px.
- docs/ui-stabilization-master-plan.md:121-127 - remaining debt: Previous plan already identified legacy tail as risky.

### UIUX-018 Typography is not globally controllable
- reports/ui-ux-deep-audit-metrics.json:typography - typography metrics: Current typography counters.
- styles/layers/80-visual-system-ui-states.css:3340-3344 - .visual-system-section-head h2: Local font-size/font-weight values in visualSystem.
- styles/ui/planning-order.css:221-229 - planning-order-table th: Local table header typography with !important.

### UIUX-019 Inline style usage is extensive and partly intentional
- src/app.js:35175-35190 - timeline inline styles: Gantt timeline uses inline geometry.
- src/app.js:36551-36620 - slot inline styles: Gantt slot segments use inline geometry.
- src/app.js:21457-21459 - visual tree sample: Visual samples use inline --level styles.

### UIUX-020 Working tree is too dirty for clean acceptance
- reports/ui-ux-deep-audit-metrics.json:git.statusShort - git status: Current dirty worktree count and files.
- docs/ui-table-regression-report.md:19,32,45,58,71 - trailing whitespace: git diff --check failure lines.
- reports/ui-ux-deep-audit-metrics.json:qa.commandsRun git diff --check - git diff --check: Current failure output.
