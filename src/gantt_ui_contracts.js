export const GANTT_UI_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 932, category: "desktop" },
  { id: "desktop-wide", width: 1512, height: 982, category: "desktop" },
  { id: "pilot-wide", width: 1967, height: 1192, category: "desktop" },
  { id: "tablet", width: 1180, height: 820, category: "tablet" },
  { id: "tablet-compact", width: 1024, height: 768, category: "tablet" },
  { id: "narrow", width: 430, height: 932, category: "narrow" },
];

export const GANTT_UI_SCALE_MODES = ["hours", "days", "weeks"];

export const GANTT_UI_REQUIRED_SELECTORS = [
  ".gantt-shell[data-gantt-shell][data-ui-component='GanttRuntime']",
  ".gantt-canvas[data-ui-component='GanttCanvas']",
  ".timeline-row[data-ui-component='GanttTimeline']",
  ".rows-layer[data-ui-component='GanttRowsLayer']",
  ".gantt-row[data-row-id]",
  ".row-label",
  ".lane[data-lane-row-id]",
  ".operation-slot[data-ui-component='GanttSlot'][data-slot-id]",
  ".resize-handle[data-ui-component='GanttResizeHandle'][data-resize-slot]",
  ".dependencies-layer[data-ui-component='GanttDependencyLayer']",
  ".dependency-path[data-ui-component='GanttDependencyPath']",
  ".dependency-arrow[data-ui-component='GanttDependencyArrow']",
  ".gantt-zoom-control[role='group']",
  "[data-gantt-zoom]",
  "[data-gantt-toolbar-clock][data-ui-component='GanttClock']",
  "[data-ui-component='GanttToolbar']",
];

export const GANTT_UI_REQUIRED_DATA_ATTRIBUTES = [
  "data-gantt-shell",
  "data-ui-runtime",
  "data-ui-component",
  "data-row-id",
  "data-lane-row-id",
  "data-slot-id",
  "data-resize-slot",
  "data-gantt-zoom",
  "data-scale",
  "data-toggle-all-projects",
  "data-toggle-gantt-quantity",
  "data-gantt-optimize-select",
  "data-dependency-edit-route",
  "data-dependency-segment-index",
  "data-dependency-orientation",
  "data-dependency-start-index",
  "data-dependency-end-index",
  "data-dependency-start-base-x",
  "data-dependency-start-base-y",
  "data-dependency-end-base-x",
  "data-dependency-end-base-y",
  "data-dependency-start-current-x",
  "data-dependency-start-current-y",
  "data-dependency-end-current-x",
  "data-dependency-end-current-y",
  "data-close-drawer",
  "data-close-modal",
];

export const GANTT_UI_SPECIAL_RUNTIME_ZONES = [
  {
    id: "shell",
    label: "Gantt runtime shell",
    selector: ".gantt-shell[data-gantt-shell]",
    risk: "critical",
    allowedChanges: "Markers, tokens and scroll-safe wrapper rules only.",
  },
  {
    id: "toolbar",
    label: "Gantt toolbar and filters",
    selector: "[data-ui-component='GanttToolbar'], .topbar",
    risk: "medium",
    allowedChanges: "ActionButton markers, wrapping tokens and non-mutating control labels.",
  },
  {
    id: "timeline",
    label: "Timeline scale rows",
    selector: ".timeline-row, .timeline-cell",
    risk: "high",
    allowedChanges: "Tokenized colors and typography; no scale calculation changes.",
  },
  {
    id: "rows",
    label: "Rows and lane labels",
    selector: ".gantt-row, .row-label, .lane",
    risk: "high",
    allowedChanges: "Typography/tokens and markers; no rowLayout calculation changes.",
  },
  {
    id: "slots",
    label: "Operation slots",
    selector: ".operation-slot[data-slot-id]",
    risk: "critical",
    allowedChanges: "State classes/tokens/markers; no DOM or drag/resize behavior changes without tests.",
  },
  {
    id: "non-working",
    label: "Non-working layer",
    selector: ".non-working-layer, .non-working-segment",
    risk: "medium",
    allowedChanges: "Tokenized fill/stripe/border only.",
  },
  {
    id: "dependencies",
    label: "SVG dependency layer",
    selector: ".dependencies-layer, .dependency-path, .dependency-arrow",
    risk: "critical",
    allowedChanges: "Stroke/fill tokens and markers; no path routing or marker geometry changes.",
  },
  {
    id: "overlays",
    label: "Drawer/editor/optimization overlays",
    selector: ".slot-drawer, .slot-form-modal, .gantt-optimization-modal",
    risk: "high",
    allowedChanges: "Overlay markers and viewport-fit checks; no form business logic changes.",
  },
  {
    id: "interactions",
    label: "Drag/resize/snap/dependency edit",
    selector: ".gantt-snap-overlay, .gantt-drag-ghost, [data-dependency-edit-route]",
    risk: "critical",
    allowedChanges: "Smoke checks and markers only.",
  },
];

export const GANTT_UI_GEOMETRY_INLINE_STYLE_KEYS = [
  "left",
  "top",
  "width",
  "height",
  "transform",
  "grid-template-columns",
  "--left-width",
  "--timeline-width",
  "--total-height",
  "--cell-width",
  "--snap-width",
  "--dependency-clip-left",
  "--slot-height",
  "--slot-radius",
  "--segment-left",
  "--segment-width",
  "--slot-validation-progress",
  "--slot-fact-progress",
  "--transfer-width",
];

export const GANTT_UI_VISUAL_INLINE_STYLE_KEYS = [
  "background",
  "background-color",
  "color",
  "border",
  "border-color",
  "border-radius",
  "box-shadow",
  "opacity",
  "fill",
  "stroke",
];

export const GANTT_UI_VISUAL_STATE_CLASS_PREFIXES = [
  "status-",
  "is-",
  "has-warning",
  "critical",
  "warning",
  "material-transfer-slot",
  "aggregate-slot",
  "week-slot",
  "slot-operational-",
  "dependency-path",
  "dependency-arrow",
];

export const GANTT_SLOT_STATE_CLASSES = [
  "status-planned",
  "status-in_progress",
  "status-paused",
  "status-completed",
  "status-problem",
  "status-overdue",
  "is-selected",
  "is-dragging",
  "is-locked",
  "is-compact",
  "is-tiny",
  "is-segmented",
  "material-transfer-slot",
  "has-warning",
  "critical",
  "warning",
  "slot-working-segment",
  "slot-non-working-segment",
  "slot-operational-layer",
  "slot-operational-segment",
  "slot-transfer-batch-indicator",
];

export const GANTT_DEPENDENCY_STATE_CLASSES = [
  "dependency-path",
  "dependency-path-underlay",
  "dependency-path-muted",
  "has-issue",
  "is-transfer",
  "dependency-arrow",
  "is-muted",
  "dependency-edit-segment",
  "dependency-edit-hit",
  "dependency-edit-handle",
];

export const GANTT_UI_REQUIRED_TOKENS = [
  "--mes-ui-gantt-row-height",
  "--mes-ui-gantt-timeline-height",
  "--mes-ui-gantt-left-width",
  "--mes-ui-gantt-slot-radius",
  "--mes-ui-gantt-slot-border",
  "--mes-ui-gantt-slot-planned-bg",
  "--mes-ui-gantt-slot-distributed-bg",
  "--mes-ui-gantt-slot-active-bg",
  "--mes-ui-gantt-slot-completed-bg",
  "--mes-ui-gantt-slot-warning-bg",
  "--mes-ui-gantt-slot-problem-bg",
  "--mes-ui-gantt-slot-paused-bg",
  "--mes-ui-gantt-slot-transfer-bg",
  "--mes-ui-gantt-non-working-bg",
  "--mes-ui-gantt-dependency-color",
  "--mes-ui-gantt-dependency-active-color",
  "--mes-ui-gantt-dependency-warning-color",
  "--mes-ui-gantt-grid-line",
  "--mes-ui-gantt-timeline-bg",
  "--mes-ui-gantt-row-hover-bg",
  "--mes-ui-gantt-row-selected-bg",
];

export const GANTT_UI_OVERLAY_COMPONENTS = [
  { id: "drawer", selector: ".slot-drawer[data-gantt-overlay='drawer']", marker: "GanttDrawer" },
  { id: "editor", selector: ".slot-form-modal[data-gantt-overlay='editor']", marker: "GanttEditorModal" },
  { id: "optimization", selector: ".gantt-optimization-modal[data-gantt-overlay='optimization']", marker: "GanttOptimizationModal" },
  { id: "split", selector: ".gantt-split-modal[data-gantt-overlay='split']", marker: "GanttSplitModal", optional: true },
];

export const GANTT_UI_PRACTICAL_MIGRATIONS = [
  "Gantt toolbar receives data-ui-component=GanttToolbar.",
  "Gantt overlay shells receive data-gantt-overlay markers.",
  "Slot colors/borders/radius use Gantt tokens.",
  "Dependency colors use Gantt dependency tokens.",
  "Non-working zones use Gantt non-working tokens.",
];

export function getGanttRequiredTokenSet() {
  return new Set(GANTT_UI_REQUIRED_TOKENS);
}
