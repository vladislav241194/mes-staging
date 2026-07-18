import { MES_MODULE_BLUEPRINT_REGISTRY } from "../../module_registry.js";

export const UI_VISUAL_UNIFICATION_CONTRACT = "visual-unification-v1";

export const UI_VISUAL_MASTER_STAGES = [
  { id: "baseline", label: "Visual Baseline & Exception Map" },
  { id: "tokens", label: "Tokens, Typography & Density" },
  { id: "composition", label: "Module Page Composition" },
  { id: "forms", label: "Forms, Filters & Actions" },
  { id: "data-surfaces", label: "Tables, Lists, Trees & States" },
  { id: "overlays", label: "Overlays & System States" },
  { id: "module-parity", label: "Module-by-Module Parity Sweep" },
];

const UI_VISUAL_WAVE_DEFINITIONS = [
  { id: "reference", label: "Reference and directory modules", contract: "standard" },
  { id: "operational", label: "Daily operational modules", contract: "standard-with-domain-geometry" },
  { id: "dense-planning", label: "Dense and planning modules", contract: "standard-with-domain-geometry" },
  { id: "protected", label: "Protected visual families", contract: "protected-inner-geometry" },
];

export const UI_VISUAL_MODULE_WAVES = Object.freeze(UI_VISUAL_WAVE_DEFINITIONS.map((wave) => Object.freeze({
  ...wave,
  moduleIds: Object.freeze(MES_MODULE_BLUEPRINT_REGISTRY
    .filter((blueprint) => blueprint.qa.visualWave === wave.id)
    .map((blueprint) => blueprint.id)),
})));

export const UI_VISUAL_HARD_EXCEPTIONS = [
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
];

export function getUiVisualModuleWave(moduleId = "") {
  const id = String(moduleId || "").trim();
  return UI_VISUAL_MODULE_WAVES.find((wave) => wave.moduleIds.includes(id)) || null;
}

export function getUiVisualExceptions(moduleId = "") {
  const id = String(moduleId || "").trim();
  return UI_VISUAL_HARD_EXCEPTIONS.filter((exception) => exception.moduleIds.includes(id));
}
