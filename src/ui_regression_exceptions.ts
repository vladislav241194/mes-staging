import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  getMesModuleBlueprintDefinition,
} from "./module_registry.js";
import type { MesReactCompletionModuleId } from "./react_completion_registry.ts";

export type UiRegressionViewportCategory = "desktop" | "tablet" | "narrow";

export interface UiRegressionViewport {
  readonly id: "desktop" | "tablet" | "tablet-compact" | "narrow" | "narrow-compact";
  readonly width: number;
  readonly height: number;
  readonly category: UiRegressionViewportCategory;
}

export interface UiRegressionModuleProfile {
  readonly type: string;
  readonly hasTable: boolean;
  readonly hasActions: boolean;
  readonly hasTree?: boolean;
  readonly hasGantt?: boolean;
  readonly hasOverlayProbe?: boolean;
  readonly allowedInternalOverflowSelectors?: readonly string[];
  readonly requiredSelectors?: readonly string[];
  readonly futurePhase?: string;
}

export interface UiRegressionException {
  readonly module: "gantt" | "timesheet" | "productionStructureMatrix";
  readonly type: "special-runtime-protected" | "data-dense-limited-mobile";
  readonly reason: string;
  readonly expectedMissingMarkers: readonly string[];
  readonly allowedInternalOverflowSelectors: readonly string[];
  readonly futurePhase: string;
}

interface UiRegressionBlueprint {
  readonly id: string;
  readonly qa: {
    readonly mobileLimitedReason: string;
    readonly regression: UiRegressionModuleProfile;
  };
}

const UI_REGRESSION_BLUEPRINTS = MES_MODULE_BLUEPRINT_REGISTRY as readonly UiRegressionBlueprint[];

export const UI_REGRESSION_VIEWPORTS: readonly UiRegressionViewport[] = [
  { id: "desktop", width: 1440, height: 932, category: "desktop" },
  { id: "tablet", width: 1180, height: 820, category: "tablet" },
  { id: "tablet-compact", width: 1024, height: 768, category: "tablet" },
  { id: "narrow", width: 430, height: 932, category: "narrow" },
  { id: "narrow-compact", width: 390, height: 844, category: "narrow" },
];

export const MOBILE_LIMITED_SUPPORT_MODULES = Object.freeze(Object.fromEntries(UI_REGRESSION_BLUEPRINTS
  .filter((blueprint) => blueprint.qa.mobileLimitedReason)
  .map((blueprint) => [blueprint.id, blueprint.qa.mobileLimitedReason]))) as Readonly<Partial<Record<MesReactCompletionModuleId, string>>>;

export const UI_REGRESSION_MODULE_PROFILES = Object.freeze(Object.fromEntries(UI_REGRESSION_BLUEPRINTS
  .map((blueprint) => [blueprint.id, blueprint.qa.regression]))) as Readonly<Record<MesReactCompletionModuleId, UiRegressionModuleProfile>>;

export const UI_REGRESSION_EXCEPTIONS: readonly UiRegressionException[] = [
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
];

export function getUiRegressionException(moduleId: unknown): UiRegressionException | null {
  return UI_REGRESSION_EXCEPTIONS.find((item) => item.module === moduleId) || null;
}

export function getUiRegressionProfile(moduleId: unknown): UiRegressionModuleProfile {
  const blueprint = getMesModuleBlueprintDefinition(moduleId as string | undefined) as UiRegressionBlueprint | null;
  if (!blueprint) throw new Error(`Unknown MES module regression profile: ${moduleId}`);
  return UI_REGRESSION_MODULE_PROFILES[blueprint.id as MesReactCompletionModuleId];
}
