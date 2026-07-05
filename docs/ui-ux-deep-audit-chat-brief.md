# MES UI/UX Deep Audit - ChatGPT Brief

Audit date: 2026-07-05T17:49:38.834Z
Branch/commit: main / 7286d0c

## Short Verdict

The MES UI is fragile / partially stabilized. It has real helpers and token files, but current QA is not green, CSS debt is high, runtime is still mostly a large HTML-string monolith, and previous pass reports are stale for the current worktree.

## Current Command Results
| command |status |reason |
| --- |--- |--- |
| build |pass |- favicon.svg?v=cad5712c21dc-v.1.491 /  |
| lint |not available | |
| typecheck |not available | |
| qa |not available | |
| qa:ui |fail | / Move the value to styles/mes-ui-core.css token layer, reuse an existing token, or intentionally update the baseline after review. |
| qa:css |fail |Failures: / - Exact duplicate CSS rule groups grew above budget: 1 > 0 |
| qa:architecture |fail | / Move the value to styles/mes-ui-core.css token layer, reuse an existing token, or intentionally update the baseline after review. |
| qa:visual |fail | / Node.js v26.3.0 |
| qa:ui:regression |pass |OK: UI Phase 4 regression smoke passed. /  |
| qa:functional |fail |    at runModuleSpecificSmokeChecks (file:///Users/vladislav/Documents/Codex/2026-05-30/files-mentioned-by-the-user-mes/scripts/module-smoke-qa.mjs:1809:5) /     at async main (file:///Users/vladislav/Documents/Codex/202 |
| git diff --check |fail |docs/ui-table-regression-report.md:71: trailing whitespace. / +narrow-compact \| visualSystem \| ok \| 3 \| 2 \| 1 \| 0 \| |

## Key Metrics
| metric |value |
| --- |--- |
| src/app.js lines |40436 |
| extracted module renderers |2 |
| CSS files |18 |
| CSS total lines |29154 |
| !important |3070 |
| raw hex |1847 |
| raw px |7309 |
| legacy tail lines |4019 |
| duplicate selector groups audit parser |1300 |
| raw table tags |38 |
| renderUiActionButton calls |59 |
| renderUiFormField calls |9 |
| raw form controls |129 |
| semantic icon slugs |129 |

## Top Critical Findings
1. UIUX-001 Current UI stabilization baseline is not green: The current build passes, but qa:ui, qa:css, qa:architecture, qa:visual, qa:functional, and git diff --check fail in the live audit run.
2. UIUX-002 CSS cascade remains large and high-risk: Source CSS has 29154 lines, 3070 !important usages, 1847 raw hex values, 7309 raw px values, and 1300 duplicate selector groups by audit parser.
3. UIUX-003 Planning CSS has an exact duplicate rule budget failure: qa:css fails because an exact duplicate selector exists in styles/ui/planning-order.css for the fifth planning table column.
4. UIUX-004 Runtime is still dominated by src/app.js: src/app.js is 40436 lines with 293 render helper functions in the monolith; only 2 module renderer files are extracted.
5. UIUX-005 Token layer exists but adoption is partial: 295 mes tokens exist and 2875 token references were counted, but 9156 raw visual values remain and multiple density/typography aliases have zero references.
6. UIUX-006 Table contract is present but not universal: Audit found 38 raw table tags, 23 of 33 classified tables under TableWrap, and 2448 table-related CSS selectors.
7. UIUX-007 Button contract wraps legacy classes instead of replacing them: renderUiActionButton exists, but its base class still emits primary-button/secondary-button/icon-button/table-icon-button, and source/runtime still contain 60 secondary-button and 15 primary-button occurrences.
8. UIUX-008 Icon pipeline is richer than runtime adoption: Icon assets include 129 semantic slugs, 47 custom SVGs, 82 open-source mappings and 1 fallback SVG, but runtime still uses a generic icon(name) helper 213 times and runtime mixed registry has 3 entries.
9. UIUX-009 Gantt remains a special runtime outside normal UI primitives: Gantt slots, timeline cells, week boundaries and segmented slot geometry are built with inline style geometry and specialized functions, not normal component primitives.
10. UIUX-010 Visual system page and smoke expectations are out of sync: qa:functional fails because the visualSystem smoke expects >=8 panels, but current runtime returns 1. This means UI-state docs/tests are not aligned with the active UI state module.

## External Review Questions
1. Which baseline failures must be fixed before any design-system migration continues?
2. Should the project keep vanilla JS/HTML-string runtime or migrate incrementally to stronger component boundaries?
3. Which CSS families should become hard contracts first: sidebar/topbar, buttons, tables, forms, status, or Gantt?
4. How should Gantt remain special runtime without blocking global UI stabilization?
5. What is the safest plan to shrink `src/app.js` without breaking business behavior?

Full report: `docs/ui-ux-deep-audit-report.md`.
Evidence index: `reports/ui-ux-deep-audit-evidence-index.md`.