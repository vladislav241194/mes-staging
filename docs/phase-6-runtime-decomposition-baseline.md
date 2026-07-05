# Phase 6 Runtime Decomposition Baseline

## Snapshot

- Branch: `main`
- Workspace state before Phase 6 edits: dirty, with many pre-existing Phase 1-5 changes.
- `src/app.js` line count before Phase 6 extraction: `39 294`.
- Baseline QA before extraction:
  - `npm run build`: passed
  - `npm run qa:ui`: passed
  - `npm run qa:css`: passed
  - `npm run qa:architecture`: passed
  - `npm run qa:functional`: passed
  - `npm run qa:ui:regression`: passed
  - `npm run qa:gantt`: passed

## Dirty Files At Start

`git status --short` already contained modified docs, scripts, `src/app.js`, `src/ui_runtime_contracts.js`, CSS layers, `styles/mes-ui-core.css`, `package.json` and many untracked Phase 1-5 docs/reports/scripts. Phase 6 work was added on top of this state without reverting unrelated changes.

## Top-Level Runtime Sections

Machine-readable map:

- `reports/app-runtime-map.json`

Human-readable map:

- `docs/app-runtime-decomposition-map.md`

Current map summary:

- functions mapped: `1699`
- safe-to-extract: `107`
- extract-with-tests: `838`
- do-not-extract-phase-6: `464`
- unknown: `290`

## Safe To Move In Phase 6

- Pure HTML helpers: `escapeHtml`, `escapeAttribute`, class joining and tone normalization.
- UI render helpers: panels, actions, status tokens, module shell, table wrapper, form field, dropdown/modal/drawer shells, empty state and GanttBar contract helper.
- Contract registries that are simple arrays/objects and have no runtime side effects.
- Very simple module renderers with no state mutation, DOM access, Gantt geometry, print flow or auth/session flow.

## Forbidden For Mass Move

- Gantt geometry, drag, resize, dependency routing and slot DOM.
- Auth/session business flow.
- Timesheet and production structure calculations.
- Print/export preview DOM.
- Planning labor calculations and route/specification mutation.
- Event delegation and state persistence.

## Phase 6 Baseline Decision

The first extraction target is the UI runtime layer, because it has the highest reuse and the lowest business risk. The first module renderer target is `dispatch`, because it is an intentionally disabled placeholder and does not participate in MES calculations.
