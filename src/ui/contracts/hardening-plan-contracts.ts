import type { MesReactCompletionModuleId } from "../../react_completion_registry.ts";

type UiHardeningKeyRuntimeModuleId = Extract<
  MesReactCompletionModuleId,
  | "planning"
  | "nomenclature"
  | "specifications2"
  | "directories"
  | "shiftMasterBoard"
  | "shiftWorkOrders"
  | "timesheet"
  | "roles"
  | "productionStructureMatrix"
>;

export type UiHardeningPlanStageId =
  | "ui-inventory"
  | "ui-contract-registry"
  | "action-button-contract"
  | "sidebar-header-contract"
  | "panel-spacing-contract"
  | "table-contract"
  | "form-field-contract"
  | "overlay-contract"
  | "key-module-migration"
  | "qa-gates"
  | "verification";

export interface UiHardeningPlanStage {
  readonly order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  readonly id: UiHardeningPlanStageId;
  readonly title: string;
  readonly status: "closed";
  readonly requiredEvidence: readonly [string, string, string, ...string[]];
}

// Keep this list in terms of current Blueprint IDs only. Legacy deep links such
// as `products` and `routes` are compatibility aliases for Specifications 2.0
// and are exercised through the module-smoke alias suite instead of being
// treated as independent runtime pages.
export const UI_HARDENING_KEY_RUNTIME_MODULE_IDS: readonly UiHardeningKeyRuntimeModuleId[] = Object.freeze([
  "planning",
  "nomenclature",
  "specifications2",
  "directories",
  "shiftMasterBoard",
  "shiftWorkOrders",
  "timesheet",
  "roles",
  "productionStructureMatrix",
]);

export const UI_HARDENING_PLAN_STAGES: readonly UiHardeningPlanStage[] = [
  {
    order: 1,
    id: "ui-inventory",
    title: "UI-инвентаризация",
    status: "closed",
    requiredEvidence: ["component-registry", "runtime-coverage-registry", "runtime-class-audit"],
  },
  {
    order: 2,
    id: "ui-contract-registry",
    title: "UI Contract Registry",
    status: "closed",
    requiredEvidence: ["component-contracts", "style-token-contracts", "dom-normalizer-contracts"],
  },
  {
    order: 3,
    id: "action-button-contract",
    title: "ActionButton contract",
    status: "closed",
    requiredEvidence: ["action-button-helper", "action-button-css", "action-button-smoke-gate"],
  },
  {
    order: 4,
    id: "sidebar-header-contract",
    title: "Sidebar/Header contract",
    status: "closed",
    requiredEvidence: ["sidebar-helper", "module-header-helper", "sidebar-width-smoke-gate", "module-background-smoke-gate"],
  },
  {
    order: 5,
    id: "panel-spacing-contract",
    title: "Panel/Spacing contract",
    status: "closed",
    requiredEvidence: ["panel-helper", "panel-body-helper", "panel-padding-tokens", "panel-overlap-smoke-gate"],
  },
  {
    order: 6,
    id: "table-contract",
    title: "Table contract",
    status: "closed",
    requiredEvidence: ["table-helper", "table-horizontal-scroll-contract", "table-vertical-scroll-smoke-gate"],
  },
  {
    order: 7,
    id: "form-field-contract",
    title: "FormField contract",
    status: "closed",
    requiredEvidence: ["form-field-helper", "form-control-height-token", "form-field-smoke-gate"],
  },
  {
    order: 8,
    id: "overlay-contract",
    title: "Modal/Drawer/Dropdown contract",
    status: "closed",
    requiredEvidence: ["modal-helper", "drawer-helper", "dropdown-helper", "opened-overlay-smoke-gates"],
  },
  {
    order: 9,
    id: "key-module-migration",
    title: "Миграция ключевых модулей",
    status: "closed",
    requiredEvidence: ["key-modules-explicit-runtime", "legacy-module-alias-smoke-coverage", "partial-runtime-modules-documented", "no-legacy-runtime-modules"],
  },
  {
    order: 10,
    id: "qa-gates",
    title: "QA-gates",
    status: "closed",
    requiredEvidence: ["qa-ui-script", "qa-syntax-script", "module-smoke-script", "css-layer-audit-script"],
  },
  {
    order: 11,
    id: "verification",
    title: "Проверка",
    status: "closed",
    requiredEvidence: ["qa-stabilize-script", "build-script", "git-diff-check-script"],
  },
];
