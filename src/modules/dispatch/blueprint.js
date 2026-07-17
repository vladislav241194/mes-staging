import {
  MES_MODULE_HEADER_MODES,
  MES_MODULE_LAYOUT_PATTERNS,
  MES_MODULE_NAVIGATION_SCOPES,
  MES_MODULE_RUNTIME_CONTRACTS,
  MES_MODULE_RUNTIME_KINDS,
  MES_MODULE_RUNTIME_LIFECYCLES,
  MES_MODULE_SIDEBAR_MODES,
  defineMesModuleBlueprint,
} from "../../module_blueprint.js";

export const MODULE_BLUEPRINT = defineMesModuleBlueprint({
  id: "dispatch",
  label: "Диспетчерская",
  icon: "monitor",
  navigation: {
    groupId: "operations",
    order: 10,
    scope: MES_MODULE_NAVIGATION_SCOPES.USER,
  },
  layout: {
    pattern: MES_MODULE_LAYOUT_PATTERNS.FULL_WIDTH,
    header: MES_MODULE_HEADER_MODES.ABSENT,
    sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "dispatch-app-shell",
    pageClassName: "dispatch-page dispatch-placeholder-page",
    contentClassName: "dispatch-placeholder-content-wrap",
    ariaLabel: "Диспетчерская",
    visualContract: "headerless-module",
  },
  runtime: {
    kind: MES_MODULE_RUNTIME_KINDS.STANDARD,
    contract: MES_MODULE_RUNTIME_CONTRACTS.HARD,
    instanceKey: "dispatch",
    lifecycle: MES_MODULE_RUNTIME_LIFECYCLES.BLUEPRINT_NATIVE,
    chrome: "standard",
  },
  qa: {
    smoke: true,
    visualWave: "reference",
    parity: { family: "full-headerless", shell: "standard", page: "full", header: "absent" },
    regression: { type: "placeholder", hasTable: false, hasActions: false },
  },
  access: {
    defaultRoleActions: { dispatcher: ["view"] },
  },
  capabilities: {
    table: false,
    tree: false,
    actions: false,
    overlays: [],
  },
  flow: {
    order: 100,
    contract: {
      label: "Диспетчерская",
      group: "Оперативное управление",
      role: "Модуль-заглушка: диспетчерская выведена из рабочего контура и сейчас не влияет на планирование, Гант, мастерскую и заказ-наряды.",
      reads: [],
      writes: [],
      ganttImpact: "none",
      ganttVisualChange: "—",
      editPolicy: "Не принимает факт, не хранит аналитику и не пересчитывает Гант до нового ТЗ.",
    },
  },
  sourceFiles: [
    "src/modules/dispatch/blueprint.js",
    "src/modules/dispatch/render.js",
    "src/modules/dispatch/runtime.js",
  ],
  ownership: {
    files: [
      "src/modules/dispatch/blueprint.js",
      "src/modules/dispatch/render.js",
      "src/modules/dispatch/runtime.js",
    ],
    css: [],
    storage: [],
    api: [],
    qa: [],
  },
  prototypeNative: true,
});

export const DISPATCH_MODULE_BLUEPRINT = MODULE_BLUEPRINT;
