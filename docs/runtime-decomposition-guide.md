# Runtime Decomposition Guide

## New Runtime Structure

```text
src/ui/
  html.js
  components.js
  contracts/
    runtime-contracts.js
    hardening-plan-contracts.js

src/modules/
  dispatch/
    render.js

styles/ui/
  actions.css
  status.css
```

## Where To Put New Code

- Universal HTML escaping, class joining and tone normalization: `src/ui/html.js`.
- Universal UI render helpers: `src/ui/components.js`.
- Contract registries and static classifications: `src/ui/contracts/*`.
- Module-specific pure renderers: `src/modules/<module>/render.js`.
- Component contract CSS: `styles/ui/*`.
- App composition, state, router and event delegation: `src/app.js` until a dedicated phase moves them safely.

## Adding A UI Helper

1. Add it to `createUiRenderers` in `src/ui/components.js` or a smaller UI file if the family already exists.
2. Preserve `data-ui-component`.
3. Add output assertions to `scripts/ui-render-helper-smoke.mjs`.
4. Run `npm run qa:ui:helpers`.

## Adding A Module Renderer

1. Pick a renderer with no DOM access, state mutation, auth/session flow, print flow or Gantt geometry.
2. Move only render code into `src/modules/<module>/render.js`.
3. Leave a `PHASE-6-COMPAT` wrapper in `src/app.js` if the render switch still calls the old function name.
4. Add smoke to `scripts/extracted-module-render-smoke.mjs`.
5. Run `npm run qa:modules:extracted` and `npm run qa:boundaries`.

## Do Not Move In Phase 6

- Gantt slot geometry and interactions.
- Auth/session flow.
- Timesheet/production structure calculations.
- Print/export DOM.
- State persistence and event delegation.

## Required Checks

```bash
npm run qa:syntax
npm run qa:boundaries
npm run qa:ui:helpers
npm run qa:modules:extracted
npm run qa:ui
npm run qa:css
npm run qa:architecture
```
