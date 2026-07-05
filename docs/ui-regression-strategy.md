# UI Regression Strategy

## Decision

Phase 4 uses existing browser-based DOM/layout smoke through headless Chrome CDP. Playwright was not added.

## Why

- The repo already runs browser smoke through `scripts/run-with-local-server.mjs`.
- Existing QA can seed localStorage from `workflow-preset.json`.
- Adding Playwright would add another runner and dependency surface without solving the immediate UI-contract problem.
- Current UI is data-rich and partly date/state-dependent, so DOM/layout invariants are safer than broad pixel snapshot diffs.

## What Is Checked Now

- Main module render and blank-screen protection.
- `AppShell`, header and content bounds.
- UI-contract markers: ModulePage, Panel, TableWrap, ActionButton, StatusToken, Toolbar, FilterBar, overlays.
- Desktop, tablet and narrow viewport categories.
- Body-level horizontal overflow with a 16px threshold.
- Table wrappers, headers, rows, action button dimensions and tree markers.
- Safe overlay probes for selected modules.
- Gantt shell, timeline, rows, slots, dependency layer and slot ids.
- Console/runtime errors.

## What Is Not Pixel-Perfect Yet

- Fine typography judgement.
- Exact screenshot diff for all modules.
- Gantt drag/resize/dependency editing interactions.
- Print preview visual fidelity.
- Full mobile UX.

## Future Additions

- Stable snapshot diff for a small set of non-date-sensitive modules.
- Opened-state dropdown smoke.
- Deeper Gantt interaction guardrails in Phase 5.
- Print preview PDF/image comparison after print DOM stabilizes.
