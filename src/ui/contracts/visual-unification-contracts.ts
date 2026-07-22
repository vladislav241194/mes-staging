import { MES_MODULE_BLUEPRINT_REGISTRY } from "../../module_registry.js";
import type { MesReactCompletionModuleId } from "../../react_completion_registry.ts";

export const UI_VISUAL_UNIFICATION_CONTRACT = "visual-unification-v1";

export type UiVisualMasterStageId =
  | "baseline"
  | "tokens"
  | "composition"
  | "forms"
  | "data-surfaces"
  | "overlays"
  | "module-parity";

export type UiVisualWaveId = "reference" | "operational" | "dense-planning" | "protected";
export type UiVisualWaveContract = "standard" | "standard-with-domain-geometry" | "protected-inner-geometry";

export interface UiVisualMasterStage {
  readonly id: UiVisualMasterStageId;
  readonly label: string;
}

interface UiVisualWaveDefinition {
  readonly id: UiVisualWaveId;
  readonly label: string;
  readonly contract: UiVisualWaveContract;
}

export interface UiVisualModuleWave extends UiVisualWaveDefinition {
  readonly moduleIds: readonly MesReactCompletionModuleId[];
}

export interface UiVisualHardException {
  readonly id: "gantt-geometry" | "specifications2-geometry" | "auth-flow" | "contour-admin" | "print-geometry";
  readonly moduleIds: readonly MesReactCompletionModuleId[];
  readonly scope: "inner-runtime" | "diagram-and-import" | "auth-and-touch-flow" | "admin-only" | "print-subtree";
  readonly protectedAreas: readonly string[];
}

interface UiVisualBlueprint {
  readonly id: string;
  readonly qa: {
    readonly visualWave: string;
  };
}

export const UI_VISUAL_MASTER_STAGES: readonly UiVisualMasterStage[] = [
  { id: "baseline", label: "Visual Baseline & Exception Map" },
  { id: "tokens", label: "Tokens, Typography & Density" },
  { id: "composition", label: "Module Page Composition" },
  { id: "forms", label: "Forms, Filters & Actions" },
  { id: "data-surfaces", label: "Tables, Lists, Trees & States" },
  { id: "overlays", label: "Overlays & System States" },
  { id: "module-parity", label: "Module-by-Module Parity Sweep" },
];

const UI_VISUAL_WAVE_DEFINITIONS: readonly UiVisualWaveDefinition[] = [
  { id: "reference", label: "Reference and directory modules", contract: "standard" },
  { id: "operational", label: "Daily operational modules", contract: "standard-with-domain-geometry" },
  { id: "dense-planning", label: "Dense and planning modules", contract: "standard-with-domain-geometry" },
  { id: "protected", label: "Protected visual families", contract: "protected-inner-geometry" },
];

const UI_VISUAL_BLUEPRINTS = MES_MODULE_BLUEPRINT_REGISTRY as readonly UiVisualBlueprint[];

export const UI_VISUAL_MODULE_WAVES: readonly UiVisualModuleWave[] = Object.freeze(UI_VISUAL_WAVE_DEFINITIONS.map((wave) => Object.freeze({
  ...wave,
  moduleIds: Object.freeze(UI_VISUAL_BLUEPRINTS
    .filter((blueprint) => blueprint.qa.visualWave === wave.id)
    .map((blueprint) => blueprint.id as MesReactCompletionModuleId)),
})));

export const UI_VISUAL_HARD_EXCEPTIONS: readonly UiVisualHardException[] = [
  {
    id: "gantt-geometry",
    moduleIds: ["gantt"],
    scope: "inner-runtime",
    protectedAreas: [
      "timeline",
      "slot-positioning",
      "dependencies",
      "drag-drop",
      "resize",
      "scale-math",
      "sticky-scroll",
    ],
  },
  {
    id: "specifications2-geometry",
    moduleIds: ["specifications2"],
    scope: "diagram-and-import",
    protectedAreas: ["xlsx-parsing", "import-data", "continuity", "source-rows", "block-scheme"],
  },
  {
    id: "auth-flow",
    moduleIds: ["authPrototype", "authSessionPrototype"],
    scope: "auth-and-touch-flow",
    protectedAreas: ["department-person-selection", "pin", "session", "touch-targets"],
  },
  {
    id: "contour-admin",
    moduleIds: ["contourAdmin"],
    scope: "admin-only",
    protectedAreas: ["host-isolation", "perimeter-auth", "destructive-guards", "ops-actions"],
  },
  {
    id: "print-geometry",
    // Standalone `routes` is no longer an enrolled runtime module. Its retired
    // print subtree must not keep a hard-exception entry outside the visual
    // waves; the active shift-work-order print view remains protected here.
    moduleIds: ["shiftWorkOrders"],
    scope: "print-subtree",
    protectedAreas: ["print-table", "print-page", "print-breaks"],
  },
];

export const UI_VISUAL_STANDARD_COMPONENTS = [
  "ModulePage",
  "ModuleHeader",
  "ModuleSidebar",
  "ModuleWorkspace",
  "ModuleContent",
  "Panel",
  "PanelHead",
  "PanelBody",
  "PanelFooter",
  "FormSection",
  "FormGrid",
  "FormRow",
  "FormField",
  "FormActions",
  "Toolbar",
  "FilterBar",
  "ActionBar",
  "ActionButton",
  "TableWrap",
  "TableControl",
  "StatusToken",
  "EmptyState",
  "SystemState",
  "Modal",
  "Drawer",
  "Dropdown",
] as const;

export type UiVisualStandardComponent = typeof UI_VISUAL_STANDARD_COMPONENTS[number];

export function getUiVisualModuleWave(moduleId: unknown = ""): UiVisualModuleWave | null {
  const id = String(moduleId || "").trim();
  return UI_VISUAL_MODULE_WAVES.find((wave) => (wave.moduleIds as readonly string[]).includes(id)) || null;
}

export function getUiVisualExceptions(moduleId: unknown = ""): readonly UiVisualHardException[] {
  const id = String(moduleId || "").trim();
  return UI_VISUAL_HARD_EXCEPTIONS.filter((exception) => (exception.moduleIds as readonly string[]).includes(id));
}
