# Gantt Dependency Contract

The dependency layer is a critical Gantt zone. It uses SVG paths, markers, masks and optional edit controls. Phase 5 protects it without changing the routing algorithm.

## Source

- Registry: `src/gantt_ui_contracts.js`
- Renderer: `renderDependencies` and `renderGanttDependencyEditControls` in `src/app.js`
- CSS: `styles/layers/10-shell-directory-gantt-base.css` and `styles/layers/40-gantt-planning-routes.css`
- Browser check: `scripts/gantt-ui-regression-smoke.mjs`

## Protected Components

- `GanttDependencyLayer`
- `GanttDependencyPath`
- `GanttDependencyArrow`
- `GanttDependencySlotMask`
- `GanttDependencySlotMaskRect`

## Registered Classes

- `dependency-path`
- `dependency-path-underlay`
- `dependency-path-muted`
- `has-issue`
- `is-transfer`
- `dependency-arrow`
- `is-muted`
- `dependency-edit-segment`
- `dependency-edit-hit`
- `dependency-edit-handle`

## Token Contract

Dependency visuals use:

- `--mes-ui-gantt-dependency-color`
- `--mes-ui-gantt-dependency-active-color`
- `--mes-ui-gantt-dependency-warning-color`
- `--mes-ui-gantt-dependency-underlay-color`
- `--mes-ui-gantt-dependency-transfer-color`
- `--mes-ui-gantt-dependency-arrow-stroke`

## Regression Checks

`npm run qa:gantt` checks:

- Dependency layer exists.
- Dependency SVG bounds are non-empty.
- Paths exist when dependencies are expected.
- Each protected path has a non-empty `d`.
- Each path has a marker.
- Paths use slot masks when masks are present.
- Markers/arrows exist.
- Slot masks cover current slots.
- Dependency edit controls appear when edit mode is enabled.
- Edit controls expose route/segment/current/base point data attributes.

## Protected Behavior

Phase 5 did not change:

- SVG path algorithm.
- Route point generation.
- Marker geometry.
- Mask geometry.
- Dependency edit mutation logic.
- Drag behavior of dependency edit handles.

## Reports

- `reports/gantt-dependency-contract.json`
- `reports/gantt-overlay-regression.json`
- `reports/gantt-phase-5-regression.json`
