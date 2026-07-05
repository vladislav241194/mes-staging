export const UI_REGRESSION_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 932, category: "desktop" },
  { id: "tablet", width: 1180, height: 820, category: "tablet" },
  { id: "tablet-compact", width: 1024, height: 768, category: "tablet" },
  { id: "narrow", width: 430, height: 932, category: "narrow" },
  { id: "narrow-compact", width: 390, height: 844, category: "narrow" },
];

export const MOBILE_LIMITED_SUPPORT_MODULES = {
  gantt: "Gantt is an absolute-positioned timeline; narrow smoke checks blank/runtime/guardrails, not full mobile UX.",
  productionStructureMatrix: "Production structure matrix is a wide matrix editor; narrow smoke allows internal table scroll.",
  timesheet: "Timesheet is a dense calendar grid; narrow smoke allows internal table scroll.",
  planning: "Planning order labor table is data-dense; narrow smoke allows internal table scroll.",
  planningTable: "Planning table is a dense analytical table; narrow smoke allows internal table scroll.",
  routes: "Route tree editing is data-dense; narrow smoke verifies render and table contract only.",
  products: "Specification tree editing is data-dense; narrow smoke verifies render and table contract only.",
  supply: "Supply timeline/table can require internal horizontal scroll on narrow screens.",
};

export const UI_REGRESSION_MODULE_PROFILES = {
  gantt: {
    type: "special-runtime-protected",
    hasTable: false,
    hasActions: true,
    hasGantt: true,
    allowedInternalOverflowSelectors: [".gantt-shell", ".planner-workspace"],
    requiredSelectors: [".gantt-shell", ".timeline-row", ".rows-layer", ".operation-slot", "[data-ui-component='GanttToolbar']"],
    futurePhase: "Phase 6 Gantt drag/resize/dependency routing interaction depth",
  },
  planning: { type: "contract", hasTable: true, hasActions: true, requiredSelectors: [".planning-order-page"] },
  shiftWorkOrders: { type: "contract", hasTable: true, hasActions: true, hasTree: true, hasOverlayProbe: true },
  routes: { type: "contract", hasTable: true, hasActions: true, hasTree: true, hasOverlayProbe: true },
  products: { type: "contract", hasTable: true, hasActions: true, hasTree: true },
  nomenclature: { type: "contract", hasTable: true, hasActions: true },
  directories: { type: "contract", hasTable: true, hasActions: true },
  timesheet: { type: "special-runtime", hasTable: true, hasActions: true, hasOverlayProbe: true },
  productionStructureMatrix: { type: "special-runtime", hasTable: true, hasActions: true },
  shiftMasterBoard: { type: "contract", hasTable: false, hasActions: true, hasOverlayProbe: true },
  authPrototype: {
    type: "special-runtime",
    hasTable: false,
    hasActions: true,
    requiredSelectors: ["[data-visual-qa-target='auth-prototype-header']", ".auth-prototype-department-grid"],
  },
  authSessionPrototype: { type: "contract", hasTable: false, hasActions: true, hasOverlayProbe: true },
  roles: { type: "contract", hasTable: true, hasActions: true },
  planningTable: { type: "contract", hasTable: true, hasActions: true },
  matrix: { type: "contract", hasTable: true, hasActions: true },
  supply: { type: "contract", hasTable: true, hasActions: true },
  shopMap: { type: "special-runtime", hasTable: true, hasActions: true },
  visualSystem: {
    type: "special-runtime",
    hasTable: true,
    hasActions: true,
    requiredSelectors: ["[data-ui-component='VisualSystemRuntime']", ".visual-system-page"],
  },
  employees: { type: "placeholder", hasTable: false, hasActions: true },
  dispatch: { type: "placeholder", hasTable: false, hasActions: true },
};

export const UI_REGRESSION_EXCEPTIONS = [
  {
    module: "gantt",
    type: "special-runtime-protected",
    reason: "Absolute geometry timeline with SVG dependencies and drag/resize behavior; protected by Gantt Phase 5 contract and regression suite.",
    expectedMissingMarkers: ["ModulePage", "TableWrap"],
    allowedInternalOverflowSelectors: [".gantt-shell", ".planner-workspace"],
    futurePhase: "Phase 6 Gantt drag/resize/dependency routing interaction depth",
  },
  {
    module: "visualSystem",
    type: "special-runtime",
    reason: "Living UI contract gallery; it intentionally renders multiple sample patterns.",
    expectedMissingMarkers: ["ModuleHeader"],
    allowedInternalOverflowSelectors: [".visual-system-page"],
    futurePhase: "Keep as contract gallery, not a normal data module.",
  },
  {
    module: "timesheet",
    type: "data-dense-limited-mobile",
    reason: "Dense calendar table uses internal table scroll; narrow viewport is smoke-only.",
    expectedMissingMarkers: ["ModuleHeader"],
    allowedInternalOverflowSelectors: [".timesheet-table-wrap", ".ui-table-wrap"],
    futurePhase: "Tablet-first timesheet adaptation",
  },
  {
    module: "productionStructureMatrix",
    type: "data-dense-limited-mobile",
    reason: "Wide organizational matrix editor requires internal horizontal table scroll.",
    expectedMissingMarkers: [],
    allowedInternalOverflowSelectors: [".production-structure-table-wrap", ".ui-table-wrap"],
    futurePhase: "Matrix editing ergonomics phase",
  },
  {
    module: "dispatch",
    type: "placeholder",
    reason: "Dispatcher module is intentionally a stub and should not expose live workflow UI.",
    expectedMissingMarkers: ["TableWrap"],
    allowedInternalOverflowSelectors: [],
    futurePhase: "Replace placeholder only when dispatcher workflow returns",
  },
  {
    module: "employees",
    type: "placeholder",
    reason: "Legacy employees module was renamed/repositioned; current visible module is a compatibility placeholder.",
    expectedMissingMarkers: ["TableWrap"],
    allowedInternalOverflowSelectors: [],
    futurePhase: "Remove alias or rebuild as real staff view",
  },
];

export function getUiRegressionException(moduleId) {
  return UI_REGRESSION_EXCEPTIONS.find((item) => item.module === moduleId) || null;
}

export function getUiRegressionProfile(moduleId) {
  return UI_REGRESSION_MODULE_PROFILES[moduleId] || {
    type: "unknown",
    hasTable: false,
    hasActions: false,
  };
}
