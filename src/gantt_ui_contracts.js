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
  "[data-react-gantt-island]",
  ".gantt-react-scroll[data-ui-component='GanttRuntime']",
  ".gantt-react-canvas[data-ui-component='GanttCanvas']",
  ".gantt-react-timeline[data-ui-component='GanttTimeline']",
  ".gantt-react-rows[data-ui-component='GanttRowsLayer']",
  ".gantt-react-row[data-row-id]",
  ".gantt-react-label",
  ".gantt-react-lane[data-gantt-react-drop-lane]",
  "[data-ui-component='GanttSlot'][data-slot-id]",
  "[data-gantt-react-scale-group]",
  "[data-gantt-react-zoom-group]",
  "[data-gantt-react-schedule-form]",
];

export const GANTT_UI_REQUIRED_DATA_ATTRIBUTES = [
  "data-react-gantt-island",
  "data-react-island-state",
  "data-ui-component",
  "data-row-id",
  "data-slot-id",
  "data-gantt-react-drop-lane",
  "data-gantt-react-period",
  "data-gantt-react-scale",
  "data-gantt-react-zoom",
  "data-gantt-react-schedule-form",
  "data-gantt-react-blocked-action",
  "data-gantt-dependency-detail",
];

export const GANTT_UI_SPECIAL_RUNTIME_ZONES = [
  {
    id: "shell",
    label: "Gantt runtime shell",
    selector: "[data-react-gantt-island]",
    risk: "critical",
    allowedChanges: "React mount, state markers and scroll-safe wrapper rules.",
  },
  {
    id: "toolbar",
    label: "Gantt toolbar and filters",
    selector: ".gantt-react-toolbar",
    risk: "medium",
    allowedChanges: "ActionButton markers, wrapping tokens and non-mutating control labels.",
  },
  {
    id: "timeline",
    label: "Timeline scale rows",
    selector: ".gantt-react-timeline, .gantt-react-ticks",
    risk: "high",
    allowedChanges: "Tokenized colors and typography; no scale calculation changes.",
  },
  {
    id: "rows",
    label: "Rows and lane labels",
    selector: ".gantt-react-row, .gantt-react-label, .gantt-react-lane",
    risk: "high",
    allowedChanges: "Typography/tokens and markers; no rowLayout calculation changes.",
  },
  {
    id: "slots",
    label: "Operation slots",
    selector: "[data-ui-component='GanttSlot'][data-slot-id]",
    risk: "critical",
    allowedChanges: "React slot selection, drag command and schedule form state.",
  },
  {
    id: "dependencies",
    label: "Dependency inspector",
    selector: "[data-gantt-dependency-detail]",
    risk: "high",
    allowedChanges: "Read-only dependency selection and detail presentation.",
  },
  {
    id: "overlays",
    label: "Slot detail and schedule command",
    selector: ".gantt-react-detail, [data-gantt-react-schedule-form]",
    risk: "high",
    allowedChanges: "Typed reschedule command fields and result state.",
  },
  {
    id: "interactions",
    label: "Drag and deferred commands",
    selector: "[data-gantt-react-drop-lane], [data-gantt-react-blocked-action]",
    risk: "critical",
    allowedChanges: "Typed slot drag command; unsupported commands remain visibly disabled.",
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
