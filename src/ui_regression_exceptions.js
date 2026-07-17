import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  getMesModuleBlueprintDefinition,
} from "./module_registry.js";

export const UI_REGRESSION_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 932, category: "desktop" },
  { id: "tablet", width: 1180, height: 820, category: "tablet" },
  { id: "tablet-compact", width: 1024, height: 768, category: "tablet" },
  { id: "narrow", width: 430, height: 932, category: "narrow" },
  { id: "narrow-compact", width: 390, height: 844, category: "narrow" },
];

export const MOBILE_LIMITED_SUPPORT_MODULES = Object.freeze(Object.fromEntries(MES_MODULE_BLUEPRINT_REGISTRY
  .filter((blueprint) => blueprint.qa.mobileLimitedReason)
  .map((blueprint) => [blueprint.id, blueprint.qa.mobileLimitedReason])));

export const UI_REGRESSION_MODULE_PROFILES = Object.freeze(Object.fromEntries(MES_MODULE_BLUEPRINT_REGISTRY
  .map((blueprint) => [blueprint.id, blueprint.qa.regression])));

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
];

export function getUiRegressionException(moduleId) {
  return UI_REGRESSION_EXCEPTIONS.find((item) => item.module === moduleId) || null;
}

export function getUiRegressionProfile(moduleId) {
  const blueprint = getMesModuleBlueprintDefinition(moduleId);
  if (!blueprint) throw new Error(`Unknown MES module regression profile: ${moduleId}`);
  return UI_REGRESSION_MODULE_PROFILES[blueprint.id];
}
