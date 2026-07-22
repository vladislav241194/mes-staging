import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const COMPONENT_TYPES_VERSION = "__MES_DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION__";
const OPERATIONS_VERSION = "__MES_DIRECTORY_OPERATIONS_REACT_BUNDLE_VERSION__";
const NOMENCLATURE_TYPES_VERSION = "__MES_DIRECTORY_NOMENCLATURE_TYPES_REACT_BUNDLE_VERSION__";
const STATUSES_VERSION = "__MES_DIRECTORY_STATUSES_REACT_BUNDLE_VERSION__";

const DIRECTORY_FAILURE_REASONS = new Set([
  "disabled",
  "mount-error",
  "render-error",
  "unsupported-scope",
  "write-parity-incomplete",
]);

type DirectorySectionId = "componentTypes" | "operations" | "nomenclatureTypes" | "statuses";
type DirectoryMountExport =
  | "mountComponentTypesReactIsland"
  | "mountOperationsReactIsland"
  | "mountNomenclatureTypesReactIsland"
  | "mountStatusesReactIsland";

interface DirectoryActivation {
  accessMode?: string;
  activeSection?: string;
  featureFlagEnabled?: boolean;
  runtimeMode?: string;
}

interface DirectoryRenderContext {
  activation?: DirectoryActivation;
  failureReason?: string;
  shellState?: { reason?: unknown; state?: unknown } | null;
}

interface DirectoryIslandMountOptions {
  onCommand?: (command: unknown) => unknown;
  onError: (error: unknown) => void;
  onNavigateSection?: (sectionId: DirectorySectionId) => void;
  onReady: (result: { revision: unknown }) => void;
}

type DirectoryIslandMount = (
  target: HTMLElement,
  payload: unknown,
  options: DirectoryIslandMountOptions,
) => ReactIslandHandle<unknown>;

interface DirectoryIslandModule {
  mountComponentTypesReactIsland?: DirectoryIslandMount;
  mountOperationsReactIsland?: DirectoryIslandMount;
  mountNomenclatureTypesReactIsland?: DirectoryIslandMount;
  mountStatusesReactIsland?: DirectoryIslandMount;
}

interface DirectoryHostOptions {
  executeCommand?: (command: unknown) => unknown;
  getActivation?: () => DirectoryActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  navigateSection?: (sectionId: DirectorySectionId) => unknown;
  reportError?: (error: Error) => void;
}

type DirectoryIslandConfig =
  | {
    allowWriteEvaluation: true;
    bundleName: "component-types";
    bundleVersion: typeof COMPONENT_TYPES_VERSION;
    className: "mes-react-directory-component-types-island";
    mountExport: "mountComponentTypesReactIsland";
    scope: "componentTypes";
    targetAttribute: "data-react-directory-component-types-island";
  }
  | {
    allowWriteEvaluation: true;
    bundleName: "operations";
    bundleVersion: typeof OPERATIONS_VERSION;
    className: "mes-react-directory-operations-island";
    mountExport: "mountOperationsReactIsland";
    scope: "operations";
    targetAttribute: "data-react-directory-operations-island";
  }
  | {
    allowWriteEvaluation: true;
    bundleName: "nomenclature-types";
    bundleVersion: typeof NOMENCLATURE_TYPES_VERSION;
    className: "mes-react-nomenclature-island mes-react-directory-nomenclature-types-island";
    mountExport: "mountNomenclatureTypesReactIsland";
    scope: "nomenclatureTypes";
    targetAttribute: "data-react-directory-nomenclature-types-island";
  }
  | {
    allowWriteEvaluation: true;
    bundleName: "statuses";
    bundleVersion: typeof STATUSES_VERSION;
    className: "mes-react-nomenclature-island mes-react-directory-statuses-island";
    mountExport: "mountStatusesReactIsland";
    scope: "statuses";
    targetAttribute: "data-react-directory-statuses-island";
  };

type DirectoryIslandConfigMap = {
  readonly [TSection in DirectorySectionId]: Extract<DirectoryIslandConfig, { scope: TSection }>;
};

const DIRECTORY_ISLAND_CONFIGS = {
  componentTypes: {
    allowWriteEvaluation: true,
    bundleName: "component-types",
    bundleVersion: COMPONENT_TYPES_VERSION,
    className: "mes-react-directory-component-types-island",
    mountExport: "mountComponentTypesReactIsland",
    scope: "componentTypes",
    targetAttribute: "data-react-directory-component-types-island",
  },
  operations: {
    allowWriteEvaluation: true,
    bundleName: "operations",
    bundleVersion: OPERATIONS_VERSION,
    className: "mes-react-directory-operations-island",
    mountExport: "mountOperationsReactIsland",
    scope: "operations",
    targetAttribute: "data-react-directory-operations-island",
  },
  nomenclatureTypes: {
    allowWriteEvaluation: true,
    bundleName: "nomenclature-types",
    bundleVersion: NOMENCLATURE_TYPES_VERSION,
    className: "mes-react-nomenclature-island mes-react-directory-nomenclature-types-island",
    mountExport: "mountNomenclatureTypesReactIsland",
    scope: "nomenclatureTypes",
    targetAttribute: "data-react-directory-nomenclature-types-island",
  },
  statuses: {
    allowWriteEvaluation: true,
    bundleName: "statuses",
    bundleVersion: STATUSES_VERSION,
    className: "mes-react-nomenclature-island mes-react-directory-statuses-island",
    mountExport: "mountStatusesReactIsland",
    scope: "statuses",
    targetAttribute: "data-react-directory-statuses-island",
  },
} as const satisfies DirectoryIslandConfigMap;

function normalizeFailureReason(value: unknown): string {
  const reason = String(value || "");
  return DIRECTORY_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderDirectoryTarget(
  { activation = {}, failureReason = "", shellState = null }: DirectoryRenderContext = {},
  { className, targetAttribute }: Pick<DirectoryIslandConfig, "className" | "targetAttribute">,
): string {
  const runtimeMode = activation.runtimeMode === "react"
    ? "react"
    : activation.runtimeMode === "evaluation"
      ? "evaluation"
      : "disabled";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : "";
  return `<div class="${className}" ${targetAttribute} data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite">${content}</div>`;
}

function mountDirectoryIsland(
  loadedIsland: DirectoryIslandModule,
  mountExport: DirectoryMountExport,
  target: HTMLElement,
  payload: unknown,
  options: DirectoryIslandMountOptions,
): ReactIslandHandle<unknown> {
  switch (mountExport) {
    case "mountComponentTypesReactIsland":
      return loadedIsland.mountComponentTypesReactIsland!(target, payload, options);
    case "mountOperationsReactIsland":
      return loadedIsland.mountOperationsReactIsland!(target, payload, options);
    case "mountNomenclatureTypesReactIsland":
      return loadedIsland.mountNomenclatureTypesReactIsland!(target, payload, options);
    case "mountStatusesReactIsland":
      return loadedIsland.mountStatusesReactIsland!(target, payload, options);
  }
}

function createDirectoryReadIslandHost({
  allowWriteEvaluation,
  bundleName,
  bundleVersion,
  className,
  mountExport,
  scope,
  targetAttribute,
}: DirectoryIslandConfig, {
  getActivation,
  getPayload,
  getTargetRoot,
  navigateSection,
  reportError,
  executeCommand,
}: DirectoryHostOptions) {
  const targetSelector = `[${targetAttribute}]`;
  const getIneligibilityReason = (activation: DirectoryActivation): string => {
    if (!activation.featureFlagEnabled) return "disabled";
    if (activation.activeSection !== scope) return "unsupported-scope";
    if (activation.accessMode !== "read-only-evaluation"
      && !(allowWriteEvaluation && activation.accessMode === "write-evaluation")
      && activation.accessMode !== "react") return "write-parity-incomplete";
    return "";
  };
  return createReactIslandHost<DirectoryActivation, unknown, DirectoryIslandModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      const reason = getIneligibilityReason(activation);
      return reason ? { state: "error", stage: "runtime", reason } : null;
    },
    targetSelector,
    renderTarget: (context) => renderDirectoryTarget(context, { className, targetAttribute }),
    getIneligibilityReason,
    loadIsland: async () => {
      const islandUrl = new URL(`./react-islands/${bundleName}.js`, import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      islandUrl.searchParams.set("v", bundleVersion.startsWith("__MES_") ? deployVersion : bundleVersion);
      return import(islandUrl.href) as Promise<DirectoryIslandModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<DirectoryIslandModule, unknown>) => (
      mountDirectoryIsland(loadedIsland!, mountExport, target, payload, {
        onError,
        onReady,
        onNavigateSection: typeof navigateSection === "function"
          ? (sectionId) => navigateSection(sectionId)
          : undefined,
        onCommand: executeCommand ? (command) => executeCommand(command) : undefined,
      })
    ),
  });
}

export function createDirectoryComponentTypesReactIslandHost(options: DirectoryHostOptions = {}) {
  return createDirectoryReadIslandHost(DIRECTORY_ISLAND_CONFIGS.componentTypes, {
    ...options,
    reportError: options.reportError || ((error) => console.error("[MES] Directory Component Types React island failed", error)),
  });
}

export function createDirectoryOperationsReactIslandHost(options: DirectoryHostOptions = {}) {
  return createDirectoryReadIslandHost(DIRECTORY_ISLAND_CONFIGS.operations, {
    ...options,
    reportError: options.reportError || ((error) => console.error("[MES] Directory Operations React island failed", error)),
  });
}

export function createDirectoryNomenclatureTypesReactIslandHost(options: DirectoryHostOptions = {}) {
  return createDirectoryReadIslandHost(DIRECTORY_ISLAND_CONFIGS.nomenclatureTypes, {
    ...options,
    reportError: options.reportError || ((error) => console.error("[MES] Directory Nomenclature Types React island failed", error)),
  });
}

export function createDirectoryStatusesReactIslandHost(options: DirectoryHostOptions = {}) {
  return createDirectoryReadIslandHost(DIRECTORY_ISLAND_CONFIGS.statuses, {
    ...options,
    reportError: options.reportError || ((error) => console.error("[MES] Directory Statuses React island failed", error)),
  });
}
