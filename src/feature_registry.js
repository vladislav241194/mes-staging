import {
  MES_MODULE_FLOW_CONTRACTS,
  MES_MODULE_FLOW_SEQUENCE,
} from "./mes_contracts.js";
import { getMesModuleBlueprintDefinition } from "./module_registry.js";
import { getUiRuntimeCoverageStatus } from "./ui_runtime_contracts.js";

const CORE_STATE_STORAGE_KEYS = [
  "mes-planning-prototype-state-v2",
  "mes-planning-prototype-ui-v1",
];

const DIRECTORY_STORAGE_KEYS = [
  "mes-planning-prototype-directories-v2",
  "mes-planning-prototype-directories-defaults-restored-v1",
];

const MODULE_QA_BASELINE = [
  "scripts/ui-module-regression-smoke.mjs",
  "scripts/ui-contract-qa.mjs",
];

const MODULE_FEATURE_OVERRIDES = {
  nomenclature: {
    css: ["styles/layers/60-operational-modules.css"],
    files: ["src/modules/nomenclature/render.js"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    qa: ["scripts/ui-table-contract-audit.mjs"],
  },
  products: {
    css: ["styles/layers/20-technology-specifications.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    qa: ["scripts/ui-table-contract-audit.mjs"],
  },
  specifications2: {
    css: ["styles/layers/20-technology-specifications.css"],
    files: ["src/modules/specifications2/render.js", "src/modules/specifications2/publication.js"],
    storage: ["mes-specifications-2-registry-v1", "mes-specifications-2-tab-v1"],
    qa: ["scripts/specifications2-publication-qa.mjs", "scripts/ui-table-contract-audit.mjs", "scripts/module-smoke-qa.mjs"],
    domains: ["xlsx-import-sandbox", "technology-preview", "explicit-production-release"],
    removalContract: "Drafts stay isolated. Production data may change only through an explicit append-only release; never mutate historical specifications, routes, work orders, slots or facts in place.",
  },
  routes: {
    css: ["styles/layers/50-nomenclature-routes-directories.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    qa: ["scripts/ui-table-contract-audit.mjs"],
  },
  planning: {
    css: ["styles/ui/planning-order.css", "styles/layers/70-planning-table-and-matrix.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    qa: ["scripts/planning-labor-functional-qa.mjs", "scripts/ui-table-contract-audit.mjs"],
    removalContract: "Do not remove or rename planning order fields without planning-labor functional QA and Gantt transfer checks.",
  },
  gantt: {
    css: ["styles/layers/10-shell-directory-gantt-base.css", "styles/layers/40-gantt-planning-routes.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, "ganttDependencyRoutes"],
    qa: [
      "scripts/gantt-ui-regression-smoke.mjs",
      "scripts/gantt-runtime-guardrails-qa.mjs",
      "scripts/gantt-operational-layer-qa.mjs",
    ],
    domains: ["special-geometry"],
    removalContract: "Treat as protected geometry. Exclude from broad table/layout collapses unless a Gantt-specific QA pass is planned.",
  },
  weeklyProductionControl: {
    css: ["styles/layers/60-operational-modules.css"],
    files: ["src/modules/weekly_production_control/render.js"],
    storage: CORE_STATE_STORAGE_KEYS,
    qa: ["scripts/ui-table-contract-audit.mjs"],
    removalContract: "Read-only module; refactors must not write to planning, shift facts, reports, or shared-state.",
  },
  shiftMasterBoard: {
    css: ["styles/layers/90-shift-master-board.css"],
    storage: [
      ...CORE_STATE_STORAGE_KEYS,
      "shiftMasterBoardAssignments",
      "shiftMasterBoardFacts",
      "shiftMasterBoardCarryovers",
      "shiftMasterBoardLaneBySlot",
    ],
    api: ["/api/shared-state"],
    qa: ["scripts/shift-master-board-functional-qa.mjs", "scripts/shift-operational-flow-functional-qa.mjs"],
  },
  shiftWorkOrders: {
    css: ["styles/layers/60-operational-modules.css"],
    storage: CORE_STATE_STORAGE_KEYS,
    api: ["/api/shared-state"],
    qa: ["scripts/shift-operational-flow-functional-qa.mjs", "scripts/ui-table-contract-audit.mjs"],
  },
  productionStructureMatrix: {
    css: ["styles/layers/70-planning-table-and-matrix.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    files: [
      "src/modules/production_structure_matrix/render.js",
      "src/production_structure_matrix_data.js",
      "src/production_structure_service.js",
    ],
    qa: ["scripts/production-structure-matrix-qa.mjs"],
  },
  timesheet: {
    css: ["styles/layers/60-operational-modules.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    qa: ["scripts/timesheet-functional-qa.mjs", "scripts/ui-table-contract-audit.mjs"],
  },
  roles: {
    css: ["styles/layers/60-operational-modules.css"],
    files: ["src/modules/access_roles/render.js"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
    qa: ["scripts/roles-functional-qa.mjs"],
  },
  contourAdmin: {
    css: ["styles/layers/60-operational-modules.css"],
    api: ["/api/contour-admin/action"],
    files: [
      "scripts/contour-admin-endpoint.mjs",
      "scripts/deploy-contour.mjs",
      "scripts/promote-contour.mjs",
      "scripts/admin-auth-guard.mjs",
      "scripts/admin-route-guard.mjs",
      "server.js",
    ],
    qa: ["scripts/security-route-qa.mjs"],
    domains: ["admin-host", "deployment"],
    removalContract: "Admin host safety depends on this module. Keep route guard, Basic Auth, and Ops API contracts together.",
  },
  directories: {
    css: ["styles/layers/60-operational-modules.css"],
    storage: [...CORE_STATE_STORAGE_KEYS, ...DIRECTORY_STORAGE_KEYS],
  },
  authPrototype: {
    css: ["styles/layers/60-operational-modules.css", "styles/ui/runtime-safety.css"],
    storage: ["mes-planning-prototype-auth-session-v1", ...CORE_STATE_STORAGE_KEYS],
    qa: ["scripts/auth-functional-qa.mjs"],
    domains: ["auth"],
  },
  authSessionPrototype: {
    css: ["styles/layers/60-operational-modules.css"],
    storage: ["mes-planning-prototype-auth-session-v1", ...CORE_STATE_STORAGE_KEYS],
    api: ["/api/shared-state"],
    qa: ["scripts/auth-functional-qa.mjs", "scripts/shift-operational-flow-functional-qa.mjs"],
    domains: ["auth", "worker-desktop"],
  },
  marking: {
    css: ["styles/react-marking-island.css"],
    files: ["src/modules/marking/react_island_host.js", "experiments/react-migration/src/modules/marking/MarkingScenario.tsx"],
    storage: [],
    api: [],
    qa: ["scripts/marking-module-qa.mjs", "scripts/marking-module-functional-qa.mjs", "scripts/module-smoke-qa.mjs"],
    domains: ["worker-desktop", "mock-memory-only"],
    removalContract: "Фаза 1 не создаёт серверные данные. Удаление модуля не должно затрагивать рабочие столы, СЗН, маршруты или историю производства.",
  },
};

const SYSTEM_FEATURES = [
  {
    id: "bootstrapSnapshot",
    label: "Bootstrap snapshot",
    status: "external-compatibility-artifact",
    purpose: "Contour-owned emergency restore artifact for protected environments and an optional local QA seed; never a working domain source.",
    domains: ["data-seed", "localStorage", "build", "qa"],
    ui: [],
    storage: [
      "mes-planning-prototype-bootstrap-snapshot-v1",
      ...CORE_STATE_STORAGE_KEYS,
      ...DIRECTORY_STORAGE_KEYS,
    ],
    api: [],
    files: [
      "bootstrap-snapshot.json",
      "src/modules/bootstrap_snapshot/service.js",
      "src/app.js",
      "scripts/build.mjs",
      "scripts/deploy-contour.mjs",
      "scripts/run-with-local-server.mjs",
      "scripts/bump-app-version.mjs",
    ],
    externalFiles: ["bootstrap-snapshot.json"],
    qa: [
      "scripts/flow-contract-qa.mjs",
      "scripts/ui-contract-qa.mjs",
      "scripts/module-smoke-qa.mjs",
      "scripts/gantt-ui-regression-smoke.mjs",
      "scripts/ui-module-regression-smoke.mjs",
    ],
    removalContract: "Keep only as a verified external compatibility artifact until the documented disaster-recovery contour no longer needs it; protected environments must not restore it automatically.",
  },
  {
    id: "workflowPresetUi",
    label: "Workflow/UI presets",
    status: "removed",
    purpose: "Former user-facing sidebar preset controls. The visible UI and API endpoint are removed.",
    domains: ["removed-ui", "removed-api"],
    ui: [],
    storage: [],
    api: [],
    files: [],
    qa: ["scripts/feature-registry-qa.mjs"],
    removalContract: "No render blocks, API endpoints, CSS classes, or deploy source entries may use workflow-preset.",
  },
  {
    id: "sharedState",
    label: "Shared state sync",
    status: "active-contour-data",
    purpose: "Persistent shared-state for pilot/staging user data and contour data operations.",
    domains: ["server-api", "shared-state", "contour-data", "audit"],
    ui: ["src/app.js"],
    storage: [
      "MES_SHARED_STATE_DIR",
      "MES_SHARED_STATE_KEY",
      "MES_BACKUP_DIR",
      "MES_AUDIT_LOG_PATH",
    ],
    api: ["/api/shared-state"],
    files: [
      "scripts/shared-state-endpoint.mjs",
      "scripts/shared-state-storage.mjs",
      "scripts/backup-shared-state.mjs",
      "scripts/list-shared-state-backups.mjs",
      "scripts/restore-shared-state.mjs",
      "scripts/sync-shared-state-contours.mjs",
      "server.js",
    ],
    qa: ["scripts/shared-state-functional-qa.mjs", "scripts/server-preflight.mjs"],
    removalContract: "Never remove as UI cleanup. Requires data migration, backup, restore drill, and contour plan.",
  },
  {
    id: "contourAdmin",
    label: "Contour admin ops",
    status: "active-admin-ops",
    purpose: "Admin-only operational surface for pilot/stage data sync, promote and rollback.",
    domains: ["admin-ui", "server-api", "deployment"],
    ui: ["src/app.js", "styles/layers/60-operational-modules.css"],
    storage: [],
    api: ["/api/contour-admin/action"],
    files: [
      "scripts/contour-admin-endpoint.mjs",
      "scripts/deploy-contour.mjs",
      "scripts/promote-contour.mjs",
      "scripts/admin-auth-guard.mjs",
      "scripts/admin-route-guard.mjs",
      "server.js",
    ],
    qa: ["scripts/security-route-qa.mjs"],
    removalContract: "Admin host safety depends on this feature. Keep route guard and Basic Auth contracts together.",
  },
];

export const MES_MODULE_FEATURE_REGISTRY = MES_MODULE_FLOW_SEQUENCE.map((moduleId) => {
  const contract = MES_MODULE_FLOW_CONTRACTS[moduleId] || {};
  const blueprint = getMesModuleBlueprintDefinition(moduleId);
  const override = MODULE_FEATURE_OVERRIDES[moduleId] || {};
  const runtimeStatus = getUiRuntimeCoverageStatus(moduleId);
  const css = unique([...(blueprint?.ownership.css || []), ...(override.css || [])]);
  const files = unique(["src/app.js", ...(blueprint?.ownership.files || []), ...css, ...(override.files || [])]);
  const storage = Object.hasOwn(override, "storage")
    ? override.storage
    : blueprint?.prototypeNative
      ? blueprint.ownership.storage
      : CORE_STATE_STORAGE_KEYS;
  const api = unique([...(blueprint?.ownership.api || []), ...(override.api || [])]);

  return {
    id: `module:${moduleId}`,
    moduleId,
    label: contract.label || moduleId,
    status: runtimeStatus === "special" ? "active-special-module" : "active-mes-module",
    purpose: contract.role || "Runtime MES module.",
    domains: unique([
      "module-ui",
      `runtime:${runtimeStatus}`,
      `group:${contract.group || "unknown"}`,
      ...(contract.ganttImpact && contract.ganttImpact !== "none" ? [`gantt:${contract.ganttImpact}`] : []),
      ...(override.domains || []),
    ]),
    ui: unique(["src/app.js", ...css, ...(override.ui || [])]),
    storage: unique(storage),
    api,
    files,
    qa: unique([...MODULE_QA_BASELINE, ...(blueprint?.ownership.qa || []), ...(override.qa || [])]),
    flowContract: moduleId,
    removalContract: override.removalContract
      || "Keep this module aligned with MES_MODULE_FLOW_CONTRACTS, UI runtime coverage, storage ownership, and module smoke QA.",
  };
});

export const MES_FEATURE_REGISTRY = [
  ...SYSTEM_FEATURES,
  ...MES_MODULE_FEATURE_REGISTRY,
];

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
