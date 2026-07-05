# Gantt Slot Visual Contract

Slot rendering is protected because `.operation-slot` combines business state, absolute geometry and interaction affordances.

## Source

- Registry: `src/gantt_ui_contracts.js`
- Renderer: `src/app.js`
- Main CSS: `styles/layers/10-shell-directory-gantt-base.css`
- Planning CSS: `styles/layers/40-gantt-planning-routes.css`
- Browser check: `scripts/gantt-ui-regression-smoke.mjs`
- Inline audit: `scripts/gantt-inline-style-audit.mjs`

## Protected Components

- `GanttSlot`
- `GanttWorkingSegment`
- `GanttNonWorkingSegment`
- `GanttOperationalLayer`
- `GanttOperationalSegment`
- `GanttResizeHandle`
- `GanttTransferBatch`

## Slot States

Logical state contract:

- `planned`
- `distributed`
- `in_progress`
- `paused`
- `completed`
- `overdue`
- `problem`
- `transfer`
- `non_working_segment`
- `selected`
- `dragging`
- `resizing`
- `readonly`

Registered class contract:

- `status-planned`
- `status-in_progress`
- `status-paused`
- `status-completed`
- `status-problem`
- `status-overdue`
- `is-selected`
- `is-dragging`
- `is-locked`
- `is-compact`
- `is-tiny`
- `is-segmented`
- `material-transfer-slot`
- `has-warning`
- `critical`
- `warning`
- `slot-working-segment`
- `slot-non-working-segment`
- `slot-operational-layer`
- `slot-operational-segment`
- `slot-transfer-batch-indicator`

## Token Contract

The slot visual layer is now anchored to Gantt tokens:

- `--mes-ui-gantt-slot-radius`
- `--mes-ui-gantt-slot-border`
- `--mes-ui-gantt-slot-planned-bg`
- `--mes-ui-gantt-slot-distributed-bg`
- `--mes-ui-gantt-slot-active-bg`
- `--mes-ui-gantt-slot-completed-bg`
- `--mes-ui-gantt-slot-warning-bg`
- `--mes-ui-gantt-slot-problem-bg`
- `--mes-ui-gantt-slot-paused-bg`
- `--mes-ui-gantt-slot-transfer-bg`
- `--mes-ui-gantt-slot-transfer-border`
- `--mes-ui-gantt-slot-transfer-accent`
- `--mes-ui-gantt-slot-transfer-text`

## Geometry Contract

Allowed inline geometry keys:

- `left`
- `top`
- `width`
- `height`
- `--slot-height`
- `--slot-radius`
- `--segment-left`
- `--segment-width`
- `--slot-validation-progress`
- `--slot-fact-progress`
- `--transfer-width`

Visual inline keys are rejected by `npm run qa:gantt:inline`.

## Phase 5 Safe Migrations

- Slot radius/border/background fallbacks moved to Gantt tokens.
- Working/non-working/transfer slot colors now have token entry points.
- Slot markers are checked by browser regression across 5 viewports and 3 scale modes.

## Boundaries

Phase 5 did not change:

- Slot DOM hierarchy.
- Drag handlers.
- Resize handlers.
- Slot calculation, `left/top/width/height` placement or scale math.
