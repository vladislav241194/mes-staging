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
    header: MES_MODULE_HEADER_MODES.REQUIRED,
    sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "dispatch-app-shell",
    pageClassName: "dispatch-page",
    contentClassName: "dispatch-content-wrap",
    ariaLabel: "Диспетчерская",
    visualContract: "module-header-table",
  },
  runtime: {
    kind: MES_MODULE_RUNTIME_KINDS.STANDARD,
    contract: MES_MODULE_RUNTIME_CONTRACTS.HARD,
    instanceKey: "dispatch",
    lifecycle: MES_MODULE_RUNTIME_LIFECYCLES.STANDARD_READY,
    chrome: "standard",
  },
  qa: {
    smoke: true,
    visualWave: "reference",
    parity: { family: "operational-table", shell: "standard", page: "full", header: "required" },
    regression: { type: "operational-table", hasTable: true, hasActions: false },
  },
  access: {
    defaultRoleActions: { dispatcher: ["view"] },
  },
  capabilities: {
    table: true,
    tree: false,
    actions: false,
    overlays: [],
  },
  flow: {
    order: 100,
    contract: {
      label: "Диспетчерская",
      group: "Оперативное управление",
      role: "Read-only производственный срез текущей смены: план, назначения, факты, брак и переносы без изменения данных.",
      reads: ["Planning work-order projection", "Shift Execution dispatch projection", "System Domains labels"],
      writes: [],
      ganttImpact: "none",
      ganttVisualChange: "Читает уже размещённые слоты без изменения геометрии Ганта.",
      editPolicy: "Только просмотр; команды назначения, факта и перепланирования остаются в существующих владельцах.",
    },
  },
  sourceFiles: [
    "src/modules/dispatch/blueprint.js",
    "src/modules/dispatch/render.js",
    "src/modules/dispatch/react_island_host.js",
    "src/modules/dispatch/runtime.js",
  ],
  ownership: {
    files: [
      "src/modules/dispatch/blueprint.js",
      "src/modules/dispatch/render.js",
      "src/modules/dispatch/react_island_host.js",
      "src/modules/dispatch/runtime.js",
    ],
    css: [],
    storage: [],
    api: [],
    qa: [],
  },
  prototypeNative: false,
});

export const DISPATCH_MODULE_BLUEPRINT = MODULE_BLUEPRINT;
