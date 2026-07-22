import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
  type ReactIslandTelemetryEvent,
} from "../react_island_host.ts";

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

type StructureRegistryId =
  | "employees"
  | "positions"
  | "orgUnits"
  | "workCenters"
  | "equipment"
  | "responsibilityPolicies"
  | "migrationDiagnostics";

type StructureDataRegistryId = Exclude<StructureRegistryId, "migrationDiagnostics">;

type StructureRegistryMountExport =
  | "mountStructureEmployeesReactIsland"
  | "mountStructurePositionsReactIsland"
  | "mountStructureOrgUnitsReactIsland"
  | "mountStructureWorkCentersReactIsland"
  | "mountStructureEquipmentReactIsland"
  | "mountStructureResponsibilityPoliciesReactIsland";

interface StructureRegistryActivation {
  accessMode?: string;
  featureFlagEnabled?: boolean;
  policyId?: unknown;
  runtimeMode?: string;
  serverReadFailure?: unknown;
  serverReadReady?: boolean;
}

interface StructureRegistryRenderContext {
  activation?: StructureRegistryActivation;
  failureReason?: string;
  shellState?: { reason?: unknown; state?: unknown } | null;
}

interface StructureRegistryIslandMountOptions {
  onCommand: (command: unknown) => unknown;
  onError: (error: unknown) => void;
  onNavigateRegistry: (registryId: StructureRegistryId) => void;
  onReady: (result: { revision: unknown }) => void;
}

type StructureRegistryIslandMount = (
  target: HTMLElement,
  payload: unknown,
  options: StructureRegistryIslandMountOptions,
) => ReactIslandHandle<unknown>;

type StructureRegistryIslandModule = {
  readonly [TMount in StructureRegistryMountExport]?: StructureRegistryIslandMount;
};

interface StructureRegistryHostOptions {
  executeCommand?: (command: unknown) => unknown;
  getActivation?: () => StructureRegistryActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  navigateRegistry?: (registryId: StructureRegistryId) => unknown;
  reportError?: (error: Error) => void;
}

type StructureRegistryIslandConfig =
  | {
    attribute: "data-react-structure-employees-island";
    bundleVersion: typeof STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION;
    className: "mes-react-structure-employees-island";
    islandFile: "structure-employees";
    label: "Сотрудники";
    mountName: "mountStructureEmployeesReactIsland";
    registryId: "employees";
    surfaceId: "structureEmployees";
    targetSelector: typeof STRUCTURE_EMPLOYEES_REACT_TARGET;
  }
  | {
    attribute: "data-react-structure-positions-island";
    bundleVersion: typeof STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION;
    className: "mes-react-structure-positions-island";
    islandFile: "structure-positions";
    label: "Должности";
    mountName: "mountStructurePositionsReactIsland";
    registryId: "positions";
    surfaceId: "structurePositions";
    targetSelector: "[data-react-structure-positions-island]";
  }
  | {
    attribute: "data-react-structure-org-units-island";
    bundleVersion: typeof STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION;
    className: "mes-react-structure-org-units-island";
    islandFile: "structure-org-units";
    label: "Подразделения";
    mountName: "mountStructureOrgUnitsReactIsland";
    registryId: "orgUnits";
    surfaceId: "structureOrgUnits";
    targetSelector: "[data-react-structure-org-units-island]";
  }
  | {
    attribute: "data-react-structure-work-centers-island";
    bundleVersion: typeof STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION;
    className: "mes-react-structure-work-centers-island";
    islandFile: "structure-work-centers";
    label: "Рабочие центры";
    mountName: "mountStructureWorkCentersReactIsland";
    registryId: "workCenters";
    surfaceId: "structureWorkCenters";
    targetSelector: "[data-react-structure-work-centers-island]";
  }
  | {
    attribute: "data-react-structure-equipment-island";
    bundleVersion: typeof STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION;
    className: "mes-react-structure-equipment-island";
    islandFile: "structure-equipment";
    label: "Оборудование";
    mountName: "mountStructureEquipmentReactIsland";
    registryId: "equipment";
    surfaceId: "structureEquipment";
    targetSelector: "[data-react-structure-equipment-island]";
  }
  | {
    attribute: "data-react-structure-responsibility-policies-island";
    bundleVersion: typeof STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION;
    className: "mes-react-structure-responsibility-policies-island";
    islandFile: "structure-responsibility-policies";
    label: "Зоны ответственности";
    mountName: "mountStructureResponsibilityPoliciesReactIsland";
    registryId: "responsibilityPolicies";
    surfaceId: "structureResponsibilityPolicies";
    targetSelector: "[data-react-structure-responsibility-policies-island]";
  };

type StructureRegistryIslandConfigMap = {
  readonly [TRegistry in StructureDataRegistryId]: Extract<StructureRegistryIslandConfig, { registryId: TRegistry }>;
};

const STRUCTURE_REGISTRY_ISLAND_CONFIGS = {
  employees: {
    attribute: "data-react-structure-employees-island",
    bundleVersion: STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION,
    className: "mes-react-structure-employees-island",
    islandFile: "structure-employees",
    label: "Сотрудники",
    mountName: "mountStructureEmployeesReactIsland",
    registryId: "employees",
    surfaceId: "structureEmployees",
    targetSelector: STRUCTURE_EMPLOYEES_REACT_TARGET,
  },
  positions: {
    attribute: "data-react-structure-positions-island",
    bundleVersion: STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION,
    className: "mes-react-structure-positions-island",
    islandFile: "structure-positions",
    label: "Должности",
    mountName: "mountStructurePositionsReactIsland",
    registryId: "positions",
    surfaceId: "structurePositions",
    targetSelector: "[data-react-structure-positions-island]",
  },
  orgUnits: {
    attribute: "data-react-structure-org-units-island",
    bundleVersion: STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION,
    className: "mes-react-structure-org-units-island",
    islandFile: "structure-org-units",
    label: "Подразделения",
    mountName: "mountStructureOrgUnitsReactIsland",
    registryId: "orgUnits",
    surfaceId: "structureOrgUnits",
    targetSelector: "[data-react-structure-org-units-island]",
  },
  workCenters: {
    attribute: "data-react-structure-work-centers-island",
    bundleVersion: STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION,
    className: "mes-react-structure-work-centers-island",
    islandFile: "structure-work-centers",
    label: "Рабочие центры",
    mountName: "mountStructureWorkCentersReactIsland",
    registryId: "workCenters",
    surfaceId: "structureWorkCenters",
    targetSelector: "[data-react-structure-work-centers-island]",
  },
  equipment: {
    attribute: "data-react-structure-equipment-island",
    bundleVersion: STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION,
    className: "mes-react-structure-equipment-island",
    islandFile: "structure-equipment",
    label: "Оборудование",
    mountName: "mountStructureEquipmentReactIsland",
    registryId: "equipment",
    surfaceId: "structureEquipment",
    targetSelector: "[data-react-structure-equipment-island]",
  },
  responsibilityPolicies: {
    attribute: "data-react-structure-responsibility-policies-island",
    bundleVersion: STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION,
    className: "mes-react-structure-responsibility-policies-island",
    islandFile: "structure-responsibility-policies",
    label: "Зоны ответственности",
    mountName: "mountStructureResponsibilityPoliciesReactIsland",
    registryId: "responsibilityPolicies",
    surfaceId: "structureResponsibilityPolicies",
    targetSelector: "[data-react-structure-responsibility-policies-island]",
  },
} as const satisfies StructureRegistryIslandConfigMap;

function normalizeStructureRegistryFailureReason(value: unknown): string {
  const reason = String(value || "");
  return STRUCTURE_REGISTRY_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderStructureRegistryTarget(
  { activation = {}, failureReason = "", shellState = null }: StructureRegistryRenderContext,
  { attribute, className, label }: Pick<StructureRegistryIslandConfig, "attribute" | "className" | "label">,
): string {
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

function mountStructureRegistryIsland(
  loadedIsland: StructureRegistryIslandModule,
  mountName: StructureRegistryMountExport,
  target: HTMLElement,
  payload: unknown,
  options: StructureRegistryIslandMountOptions,
): ReactIslandHandle<unknown> {
  switch (mountName) {
    case "mountStructureEmployeesReactIsland":
      return loadedIsland.mountStructureEmployeesReactIsland!(target, payload, options);
    case "mountStructurePositionsReactIsland":
      return loadedIsland.mountStructurePositionsReactIsland!(target, payload, options);
    case "mountStructureOrgUnitsReactIsland":
      return loadedIsland.mountStructureOrgUnitsReactIsland!(target, payload, options);
    case "mountStructureWorkCentersReactIsland":
      return loadedIsland.mountStructureWorkCentersReactIsland!(target, payload, options);
    case "mountStructureEquipmentReactIsland":
      return loadedIsland.mountStructureEquipmentReactIsland!(target, payload, options);
    case "mountStructureResponsibilityPoliciesReactIsland":
      return loadedIsland.mountStructureResponsibilityPoliciesReactIsland!(target, payload, options);
  }
}

function createStructureRegistryReactIslandHost({
  attribute,
  bundleVersion,
  className,
  islandFile,
  label,
  mountName,
  surfaceId,
  targetSelector,
}: StructureRegistryIslandConfig, {
  executeCommand,
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  reportError,
}: StructureRegistryHostOptions) {
  const targetConfig = { attribute, className, label };
  return createReactIslandHost<StructureRegistryActivation, unknown, StructureRegistryIslandModule>({
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
      return (["read-only-evaluation", "write-evaluation"] as readonly unknown[]).includes(activation.accessMode) ? "" : "write-parity-incomplete";
    },
    loadIsland: async () => {
      const islandUrl = new URL(`./react-islands/${islandFile}.js`, import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      islandUrl.searchParams.set("v", String(bundleVersion).startsWith("__MES_") ? deployVersion : bundleVersion);
      return import(islandUrl.href) as Promise<StructureRegistryIslandModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<StructureRegistryIslandModule, unknown>) => (
      mountStructureRegistryIsland(loadedIsland!, mountName, target, payload, {
        onError,
        onReady,
        onNavigateRegistry: (registryId) => navigateRegistry?.(registryId),
        onCommand: (command) => executeCommand?.(command),
      })
    ),
  });
}

export function createStructureEmployeesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Structure Employees React island failed", error),
}: StructureRegistryHostOptions = {}) {
  return createStructureRegistryReactIslandHost(STRUCTURE_REGISTRY_ISLAND_CONFIGS.employees, {
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
  });
}

export function createStructurePositionsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Structure Positions React island failed", error),
}: StructureRegistryHostOptions = {}) {
  return createStructureRegistryReactIslandHost(STRUCTURE_REGISTRY_ISLAND_CONFIGS.positions, {
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
  });
}

export function createStructureOrgUnitsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Structure Org Units React island failed", error),
}: StructureRegistryHostOptions = {}) {
  return createStructureRegistryReactIslandHost(STRUCTURE_REGISTRY_ISLAND_CONFIGS.orgUnits, {
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
  });
}

export function createStructureWorkCentersReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Structure Work Centers React island failed", error),
}: StructureRegistryHostOptions = {}) {
  return createStructureRegistryReactIslandHost(STRUCTURE_REGISTRY_ISLAND_CONFIGS.workCenters, {
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
  });
}

export function createStructureEquipmentReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Structure Equipment React island failed", error),
}: StructureRegistryHostOptions = {}) {
  return createStructureRegistryReactIslandHost(STRUCTURE_REGISTRY_ISLAND_CONFIGS.equipment, {
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
  });
}

export function createStructureResponsibilityPoliciesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Structure Responsibility Policies React island failed", error),
}: StructureRegistryHostOptions = {}) {
  return createStructureRegistryReactIslandHost(STRUCTURE_REGISTRY_ISLAND_CONFIGS.responsibilityPolicies, {
    getActivation, getPayload, getTargetRoot, navigateRegistry, executeCommand, reportError,
  });
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

interface StructureMigrationDiagnosticsActivation {
  accessMode?: string;
  featureFlagEnabled?: boolean;
  policyId?: unknown;
  runtimeMode?: string;
  serverReadFailure?: unknown;
  serverReadReady?: boolean;
}

interface StructureMigrationDiagnosticsRenderContext {
  activation?: StructureMigrationDiagnosticsActivation;
  failureReason?: string;
  shellState?: { reason?: unknown; state?: unknown } | null;
}

interface StructureMigrationDiagnosticsIslandMountOptions {
  onError: (error: unknown) => void;
  onNavigateRegistry: (registryId: StructureRegistryId) => void;
  onReady: (result: { revision: unknown }) => void;
}

interface StructureMigrationDiagnosticsIslandModule {
  mountStructureMigrationDiagnosticsReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: StructureMigrationDiagnosticsIslandMountOptions,
  ): ReactIslandHandle<unknown>;
}

interface StructureMigrationDiagnosticsHostOptions {
  getActivation?: () => StructureMigrationDiagnosticsActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  navigateRegistry?: (registryId: StructureRegistryId) => unknown;
  reportTelemetry?: ((event: Readonly<ReactIslandTelemetryEvent>) => void) | null;
  reportError?: (error: Error) => void;
}

function normalizeStructureMigrationDiagnosticsFailureReason(value: unknown): string {
  const reason = String(value || "");
  return STRUCTURE_MIGRATION_DIAGNOSTICS_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderStructureMigrationDiagnosticsTarget({
  activation = {},
  failureReason = "",
  shellState = null,
}: StructureMigrationDiagnosticsRenderContext = {}): string {
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

export function createStructureMigrationDiagnosticsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateRegistry,
  reportTelemetry,
  reportError = (error: Error) => console.error("[MES] Structure Migration Diagnostics React island failed", error),
}: StructureMigrationDiagnosticsHostOptions = {}) {
  return createReactIslandHost<StructureMigrationDiagnosticsActivation, unknown, StructureMigrationDiagnosticsIslandModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
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
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-migration-diagnostics.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<StructureMigrationDiagnosticsIslandModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<StructureMigrationDiagnosticsIslandModule, unknown>) => (
      loadedIsland!.mountStructureMigrationDiagnosticsReactIsland(target, payload, {
        onError,
        onReady,
        onNavigateRegistry: (registryId) => navigateRegistry?.(registryId),
      })
    ),
  });
}
