# Gantt DOM And Data Contract

The Gantt DOM contract lives in `src/gantt_ui_contracts.js` and is enforced by:

- `scripts/gantt-ui-regression-smoke.mjs`
- `scripts/ui-module-regression-smoke.mjs`

## Required Selectors

These selectors are protected by the Gantt contract:

- `.gantt-shell[data-gantt-shell][data-ui-component='GanttRuntime']`
- `.gantt-canvas[data-ui-component='GanttCanvas']`
- `.timeline-row[data-ui-component='GanttTimeline']`
- `.rows-layer[data-ui-component='GanttRowsLayer']`
- `.gantt-row[data-row-id]`
- `.row-label`
- `.lane[data-lane-row-id]`
- `.operation-slot[data-ui-component='GanttSlot'][data-slot-id]`
- `.resize-handle[data-ui-component='GanttResizeHandle'][data-resize-slot]`
- `.dependencies-layer[data-ui-component='GanttDependencyLayer']`
- `.dependency-path[data-ui-component='GanttDependencyPath']`
- `.dependency-arrow[data-ui-component='GanttDependencyArrow']`
- `[data-gantt-zoom]`
- `[data-ui-component='GanttToolbar']`

Resize handles are required in editable `hours`/`days` views. They are not required in the `weeks` compact rendering because current slot DOM intentionally hides resize handles there.

## Required Data Attributes

Always-on runtime attributes:

- `data-gantt-shell`
- `data-ui-runtime`
- `data-ui-component`
- `data-row-id`
- `data-lane-row-id`
- `data-slot-id`
- `data-resize-slot`
- `data-gantt-zoom`
- `data-scale`
- `data-toggle-all-projects`
- `data-toggle-gantt-quantity`

Open-state or mode-specific attributes:

- `data-gantt-optimize-select`
- `data-dependency-edit-route`
- `data-dependency-segment-index`
- `data-dependency-orientation`
- `data-dependency-start-index`
- `data-dependency-end-index`
- `data-dependency-start-base-x`
- `data-dependency-start-base-y`
- `data-dependency-end-base-x`
- `data-dependency-end-base-y`
- `data-dependency-start-current-x`
- `data-dependency-start-current-y`
- `data-dependency-end-current-x`
- `data-dependency-end-current-y`
- `data-close-drawer`
- `data-close-modal`

Mode-specific attributes are not required in the default closed state. They are checked by safe interaction smoke after opening optimization or enabling dependency-edit mode.

## Checked In Browser

`npm run qa:gantt` checks:

- 5 viewports: desktop, desktop-wide, tablet, tablet-compact, narrow.
- 3 scales: hours, days, weeks.
- Shell/canvas/timeline/rows/slots/dependency layer.
- Slot bounds and non-empty inline geometry.
- Dependency paths, markers and masks.
- Body-level horizontal overflow outside the Gantt container.
- Safe open/close of editor and optimization modal.
- Safe enable/disable of dependency edit mode.

Current generated report:

- `reports/gantt-dom-contract.json`
- `reports/gantt-phase-5-regression.json`

Latest result:

- DOM checks: 15
- Geometry failures: 0
- Scale failures: 0
- Overlay failures: 0
