import { createReactIslandHost } from "../react_island_host.ts";

const STRUCTURE_EMPLOYEES_REACT_TARGET = "[data-react-structure-employees-island]";
const STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION__";
const STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION__";
const STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION__";
const STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION__";
const STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION__";
const STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION__";
const STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION__";

const STRUCTURE_REGISTRY_FAILURE_REASONS = new Set([
  "evaluation-disabled",
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
  "runtime-policy-disabled",
  "unsupported-scope",
]);

function normalizeStructureRegistryFailureReason(value) {
  const reason = String(value || "");
  return STRUCTURE_REGISTRY_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderStructureRegistryTarget({ activation = {}, failureReason = "", shellState = null }, { attribute, className, label }) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : activation.runtimeMode === "evaluation" ? "evaluation" : "disabled";
  const inactiveReason = activation.featureFlagEnabled === true
    ? ""
    : activation.runtimeMode === "evaluation" ? "evaluation-disabled" : "runtime-policy-disabled";
  const state = failureReason || inactiveReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeStructureRegistryFailureReason(failureReason || shellState?.reason || inactiveReason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : `<section class="mes-react-runtime-status" role="status"><strong>Загружаем ${label}</strong><p>Получаем канонический System Domains read-model…</p></section>`;
  return `<div class="${className}" ${attribute} data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page production-structure-page system-domains-structure-page" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Система · System Domains</p><h1>${label}</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

function createStructureRegistryReactIslandHost({
  attribute,
  bundleVersion,
  className,
  executeCommand,
  getActivation,
  getPayload,
  getTargetRoot,
  islandFile,
  label,
  mountName,
  navigateRegistry,
  reportError,
  surfaceId,
  targetSelector,
} = {}) {
  const targetConfig = { attribute, className, label };
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (activation.featureFlagEnabled !== true) return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeStructureRegistryFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({ surfaceId, runtimeMode: activation.runtimeMode, policyId: activation.policyId }),
    targetSelector,
    renderTarget: (context) => renderStructureRegistryTarget(context, targetConfig),
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      return ["read-only-evaluation", "write-evaluation"].includes(activation.accessMode) ? "" : "write-parity-incomplete";
    },
    loadIsland: async () => {
      const islandUrl = new URL(`./react-islands/${islandFile}.js`, import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      islandUrl.searchParams.set("v", String(bundleVersion).startsWith("__MES_") ? deployVersion : bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland[mountName](target, payload, {
      onError,
      onReady,
      onNavigateRegistry: (registryId) => navigateRegistry?.(registryId),
      onCommand: (command) => executeCommand?.(command),
    }),
  });
}

export function createStructureEmployeesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error) => console.error("[MES] Structure Employees React island failed", error),
} = {}) {
  return createStructureRegistryReactIslandHost({
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
    surfaceId: "structureEmployees",
    targetSelector: STRUCTURE_EMPLOYEES_REACT_TARGET,
    attribute: "data-react-structure-employees-island",
    className: "mes-react-structure-employees-island",
    label: "Сотрудники",
    islandFile: "structure-employees",
    mountName: "mountStructureEmployeesReactIsland",
    bundleVersion: STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION,
  });
}

export function createStructurePositionsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error) => console.error("[MES] Structure Positions React island failed", error),
} = {}) {
  return createStructureRegistryReactIslandHost({
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
    surfaceId: "structurePositions",
    targetSelector: "[data-react-structure-positions-island]",
    attribute: "data-react-structure-positions-island", className: "mes-react-structure-positions-island", label: "Должности",
    islandFile: "structure-positions", mountName: "mountStructurePositionsReactIsland", bundleVersion: STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION,
  });
}

export function createStructureOrgUnitsReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError = (error) => console.error("[MES] Structure Org Units React island failed", error) } = {}) {
  return createStructureRegistryReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError, surfaceId: "structureOrgUnits", targetSelector: "[data-react-structure-org-units-island]", attribute: "data-react-structure-org-units-island", className: "mes-react-structure-org-units-island", label: "Подразделения", islandFile: "structure-org-units", mountName: "mountStructureOrgUnitsReactIsland", bundleVersion: STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION });
}

export function createStructureWorkCentersReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError = (error) => console.error("[MES] Structure Work Centers React island failed", error) } = {}) {
  return createStructureRegistryReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError, surfaceId: "structureWorkCenters", targetSelector: "[data-react-structure-work-centers-island]", attribute: "data-react-structure-work-centers-island", className: "mes-react-structure-work-centers-island", label: "Рабочие центры", islandFile: "structure-work-centers", mountName: "mountStructureWorkCentersReactIsland", bundleVersion: STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION });
}

export function createStructureEquipmentReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError = (error) => console.error("[MES] Structure Equipment React island failed", error) } = {}) {
  return createStructureRegistryReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError, surfaceId: "structureEquipment", targetSelector: "[data-react-structure-equipment-island]", attribute: "data-react-structure-equipment-island", className: "mes-react-structure-equipment-island", label: "Оборудование", islandFile: "structure-equipment", mountName: "mountStructureEquipmentReactIsland", bundleVersion: STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION });
}

export function createStructureResponsibilityPoliciesReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError = (error) => console.error("[MES] Structure Responsibility Policies React island failed", error) } = {}) {
  return createStructureRegistryReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError, surfaceId: "structureResponsibilityPolicies", targetSelector: "[data-react-structure-responsibility-policies-island]", attribute: "data-react-structure-responsibility-policies-island", className: "mes-react-structure-responsibility-policies-island", label: "Зоны ответственности", islandFile: "structure-responsibility-policies", mountName: "mountStructureResponsibilityPoliciesReactIsland", bundleVersion: STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION });
}

const STRUCTURE_MIGRATION_DIAGNOSTICS_FAILURE_REASONS = new Set([
  "evaluation-disabled",
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
  "runtime-policy-disabled",
  "unsupported-scope",
]);

function normalizeStructureMigrationDiagnosticsFailureReason(value) {
  const reason = String(value || "");
  return STRUCTURE_MIGRATION_DIAGNOSTICS_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderStructureMigrationDiagnosticsTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : activation.runtimeMode === "evaluation" ? "evaluation" : "disabled";
  const inactiveReason = activation.featureFlagEnabled === true
    ? ""
    : activation.runtimeMode === "evaluation" ? "evaluation-disabled" : "runtime-policy-disabled";
  const state = failureReason || inactiveReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeStructureMigrationDiagnosticsFailureReason(failureReason || shellState?.reason || inactiveReason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем диагностику миграции</strong><p>Получаем System Domains и исходную legacy-матрицу…</p></section>';
  return `<div class="mes-react-structure-migration-diagnostics-island" data-react-structure-migration-diagnostics-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page production-structure-page system-domains-structure-page" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Система · System Domains</p><h1>Диагностика миграции</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function createStructureMigrationDiagnosticsReactIslandHost({ getActivation, getPayload, getTargetRoot, navigateRegistry, reportTelemetry, reportError = (error) => console.error("[MES] Structure Migration Diagnostics React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (activation.featureFlagEnabled !== true) return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeStructureMigrationDiagnosticsFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({ surfaceId: "structureMigrationDiagnostics", runtimeMode: activation.runtimeMode, policyId: activation.policyId }),
    reportTelemetry,
    targetSelector: "[data-react-structure-migration-diagnostics-island]",
    renderTarget: renderStructureMigrationDiagnosticsTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      return activation.accessMode !== "read-only-evaluation" ? "write-parity-incomplete" : "";
    },
    loadIsland: async () => { const islandUrl = new URL("./react-islands/structure-migration-diagnostics.js", import.meta.url); const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev"); const bundleVersion = STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION; islandUrl.searchParams.set("v", bundleVersion); return import(islandUrl.href); },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountStructureMigrationDiagnosticsReactIsland(target, payload, { onError, onReady, onNavigateRegistry: (registryId) => navigateRegistry?.(registryId) }),
  });
}
