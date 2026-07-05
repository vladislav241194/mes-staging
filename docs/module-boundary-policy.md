# Module Boundary Policy

Phase 6 introduces a lightweight import boundary instead of relying on convention.

## Allowed Directions

- `src/app.js` is the current composition root and may import UI, contracts and extracted modules.
- `src/modules/*` may import or receive UI helpers, but must not import `src/app.js`.
- `src/ui/*` may import only other UI/pure helper files and contracts.
- `src/ui/contracts/*` must stay data-only and must not import render modules.
- `src/gantt/*` must not import ordinary module renderers.

## Forbidden Directions

- `src/ui/*` -> `src/modules/*`
- `src/ui/*` -> `src/app.js`
- `src/ui/contracts/*` -> `src/modules/*`
- `src/modules/*` -> `src/app.js`
- `src/gantt/*` -> `src/modules/*`

## Audit

Run:

```bash
npm run qa:boundaries
```

Script:

- `scripts/module-boundary-audit.mjs`

The script scans local ES imports/exports/dynamic imports in `src/**/*.js`, checks direction policy and performs simple circular import detection.

## Current Exceptions

No Phase 6 boundary exceptions are registered. If a future extraction needs one, document it here with the file, direction and removal condition.
