# Phase 7 Visual Polish & Internal UI Kit Result

## 1. Summary

Phase 7 turned the existing runtime contracts into a more explicit internal UI Kit layer. The main result is a shared tokenized polish file, a UI Kit guardrail, a stronger `visualSystem` production-helper showcase, and documentation for how to add buttons, tables, statuses, forms, overlays and Gantt visual states without local CSS patches.

## 2. Baseline

- Branch: `main`.
- Git status before: dirty from Phase 1-6 and previous user work.
- QA before: build, UI, CSS, architecture, functional, UI regression and Gantt passed.
- Visual checks before: `qa:visual` had a known baseline failure in `authPrototype-people`.
- Special runtime before: `gantt`, `visualSystem`.

Details: `docs/phase-7-visual-polish-baseline.md`.

## 3. UI Kit Map

Created:

- `docs/internal-ui-kit-map.md`
- `docs/internal-ui-kit.md`
- `docs/ui-kit-component-catalog.md`

The map defines foundations, components, MES-specific components, layout contracts and special-runtime exceptions.

## 4. Token Normalization

Added semantic aliases:

- surface: `--mes-ui-surface-page`, `--mes-ui-surface-panel`, `--mes-ui-surface-control`;
- border: `--mes-ui-border-soft`, `--mes-ui-border-default`, `--mes-ui-border-strong`;
- focus: `--mes-ui-focus-ring`, `--mes-ui-focus-ring-strong`;
- table group/warning/problem surfaces;
- overlay width/height/shadow tokens.

Compatibility aliases remain. No broad token value redesign was done.

## 5. Typography

The shared polish layer applies the existing typography scale to ModuleHeader, PanelHead, ActionButton, StatusToken, FormField and TableWrap descendants. It does not remove historical module CSS in one risky pass.

## 6. Spacing And Density

The default model remains data-dense:

- compact for tables and table actions;
- default for module panels;
- touch for authorization/workplace/fact-entry zones.

`visualSystem` now documents these density modes.

## 7. Radius, Borders, Surfaces

The shared polish layer uses semantic border and surface tokens. Panels, controls, tables and overlays stay strict industrial rectangles with small radii; pills are reserved for status/demo tokens.

## 8. Tables

`TableWrap` remains the required table wrapper. Phase 7 adds shared table typography, header, row, selected/group row and action-cell normalization through `styles/ui/kit-polish.css`.

TreeTable and document tree behavior were not rewritten.

## 9. Buttons And Action Zones

ActionButton remains the required button contract. Phase 7 adds a guardrail and `visualSystem` examples for primary, secondary, ghost, danger, compact, touch, icon and table-icon tones.

## 10. Statuses And Badges

StatusToken now explicitly recognizes and styles `risk`, `blocked`, `problem`, `manual`, `calc`, `calculated`, `demo` and existing success/warning/danger/info tones.

## 11. Forms

FormField visual normalization is tokenized in the polish layer. Input/select/textarea height, label typography, helper text and focus ring use UI Kit tokens.

## 12. Overlays

Modal, Drawer and Dropdown contracts now use shared overlay tokens for border, surface, max-size and shadow. Special print/Gantt overlays remain governed by their own runtime behavior.

## 13. Gantt Visual Polish

Only token-level typography/color normalization was added for Gantt labels and `GanttBar` contract samples. Slot geometry, scale, drag, resize, left/top/width/height and dependency routing were not touched.

## 14. VisualSystem

`visualSystem` now includes `visual-system-internal-ui-kit`, rendering production helpers directly:

- `renderUiActionButton`;
- `renderUiStatusToken`;
- `renderUiPanel`;
- `renderUiPanelBody`;
- `renderUiTableWrap`;
- `renderUiFormField`;
- overlay helpers;
- `renderUiGanttBar`.

## 15. Desktop / Tablet / Narrow

Created `docs/mobile-limited-support-map.md`. Phase 7 did not implement a full mobile redesign. The target is limited smoke reliability: no blank screens, no unreachable topbar, closable overlays, and TableWrap-owned horizontal overflow.

## 16. Legacy Visual Debt Reduction

The safe reduction metric for this pass is guardrail reduction rather than aggressive deletion:

- compatibility CSS-only classes remain 0;
- exact duplicate CSS rule groups remain controlled at 0 baseline;
- new polish work is centralized in one shared token-only file;
- `qa:ui-kit` prevents new page-specific fixes in the polish layer.

Large deletion of historical selectors remains a separate cleanup task because the cascade is still actively carrying live modules.

## 17. UI Kit Guardrails

Added `scripts/ui-kit-guard-qa.mjs`.

It checks:

- documentation exists;
- `styles/ui/kit-polish.css` is imported and registered in CSS audit;
- required semantic tokens exist in CSS and runtime contracts;
- polish CSS has no raw hex and no `!important`;
- polish CSS does not use module `data-layout-page` selectors;
- `visualSystem` includes production-helper evidence;
- `qa:ui` includes `qa:ui-kit`.

## 18. QA Results

Final verification was run after the polish layer, VisualSystem examples and guardrails were added.

| Command | Status | Notes |
| --- | --- | --- |
| `node --check src/app.js` | pass | runtime syntax OK |
| `node --check src/ui_runtime_contracts.js` | pass | token registry syntax OK |
| `node --check src/ui/html.js` | pass | UI helper syntax OK |
| `node --check src/ui/components.js` | pass | UI component syntax OK |
| `node --check scripts/*.mjs` | pass | all QA/build scripts parse |
| `npm run build` | pass | static build generated successfully |
| `npm run qa:ui-kit` | pass | docs, tokens, polish CSS and VisualSystem evidence checked |
| `npm run qa:ui` | pass | UI contracts, runtime coverage, raw-token baseline, table contract, Gantt inline-style audit |
| `npm run qa:css` | pass | rules 5185, duplicate selector groups 349, exact duplicate rule groups 0 |
| `npm run qa:architecture` | pass | flow warnings remain only for documented `projectId`/`batchId` compatibility debt |
| `npm run qa:functional` | pass | state, shared-state, smoke, regression, planning labor, мастерская, табель, Gantt, auth, roles, boot |
| `npm run qa:visual` | pass | MacBook Air 15: 48/48 modules passed, report in `tmp/design-qa-snapshots-1783226376925/report.md` |
| `npm run qa:ui:tables` | pass | UI regression smoke: 100 checks, 0 failed, 11 warnings |
| `npm run qa:ui:overlays` | pass | UI regression smoke: 100 checks, 0 failed, 11 warnings |
| `npm run qa:gantt:geometry` | pass | geometry 15, scale 15, overlay 5, failures 0 |
| `npm run qa:gantt:scale` | pass | geometry 15, scale 15, overlay 5, failures 0 |
| `git diff --check` | pass | whitespace check OK |

## 19. Remaining Risks

- `gantt` remains special-runtime by design.
- Historical layer CSS still contains many module-specific selectors and raw-token debt. Phase 7 adds guardrails and a token-only polish layer, not a risky full cascade deletion.
- UI regression smoke still reports 11 warnings; they are documented baseline warnings, not failed checks.
- Compatibility aliases `projectId` and `batchId` remain documented architecture warnings.
- Full mobile adaptation is a future phase.

## 20. Next Tasks

1. Do a dedicated legacy CSS deletion pass with per-module screenshots.
2. Continue extracting repeated MES-specific chips/tree components.
3. Run accessibility pass for focus order and labels.
4. Split the remaining large historical CSS layers into smaller ownership files.
5. Export the internal UI Kit to Figma if the design process needs an external library.
