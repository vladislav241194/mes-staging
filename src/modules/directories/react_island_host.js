import { createReactIslandHost } from "../react_island_host.js";

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

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return DIRECTORY_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderDirectoryTarget({ activation = {}, failureReason = "", shellState = null } = {}, {
  className,
  targetAttribute,
}) {
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

function createDirectoryReadIslandHost({
  allowWriteEvaluation = false,
  bundleName,
  bundleVersion,
  className,
  getActivation,
  getPayload,
  getTargetRoot,
  mountExport,
  navigateSection,
  reportError,
  executeCommand,
  scope,
  targetAttribute,
}) {
  const targetSelector = `[${targetAttribute}]`;
  const getIneligibilityReason = (activation) => {
    if (!activation.featureFlagEnabled) return "disabled";
    if (activation.activeSection !== scope) return "unsupported-scope";
    if (activation.accessMode !== "read-only-evaluation"
      && !(allowWriteEvaluation && activation.accessMode === "write-evaluation")
      && activation.accessMode !== "react") return "write-parity-incomplete";
    return "";
  };
  return createReactIslandHost({
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
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland[mountExport](target, payload, {
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

export function createDirectoryComponentTypesReactIslandHost(options = {}) {
  return createDirectoryReadIslandHost({
    ...options,
    allowWriteEvaluation: true,
    bundleName: "component-types",
    bundleVersion: COMPONENT_TYPES_VERSION,
    className: "mes-react-directory-component-types-island",
    mountExport: "mountComponentTypesReactIsland",
    reportError: options.reportError || ((error) => console.error("[MES] Directory Component Types React island failed", error)),
    scope: "componentTypes",
    targetAttribute: "data-react-directory-component-types-island",
  });
}

export function createDirectoryOperationsReactIslandHost(options = {}) {
  return createDirectoryReadIslandHost({
    ...options,
    allowWriteEvaluation: true,
    bundleName: "operations",
    bundleVersion: OPERATIONS_VERSION,
    className: "mes-react-directory-operations-island",
    mountExport: "mountOperationsReactIsland",
    reportError: options.reportError || ((error) => console.error("[MES] Directory Operations React island failed", error)),
    scope: "operations",
    targetAttribute: "data-react-directory-operations-island",
  });
}

export function createDirectoryNomenclatureTypesReactIslandHost(options = {}) {
  return createDirectoryReadIslandHost({
    ...options,
    allowWriteEvaluation: true,
    bundleName: "nomenclature-types",
    bundleVersion: NOMENCLATURE_TYPES_VERSION,
    className: "mes-react-nomenclature-island mes-react-directory-nomenclature-types-island",
    mountExport: "mountNomenclatureTypesReactIsland",
    reportError: options.reportError || ((error) => console.error("[MES] Directory Nomenclature Types React island failed", error)),
    scope: "nomenclatureTypes",
    targetAttribute: "data-react-directory-nomenclature-types-island",
  });
}

export function createDirectoryStatusesReactIslandHost(options = {}) {
  return createDirectoryReadIslandHost({
    ...options,
    allowWriteEvaluation: true,
    bundleName: "statuses", bundleVersion: STATUSES_VERSION,
    className: "mes-react-nomenclature-island mes-react-directory-statuses-island", mountExport: "mountStatusesReactIsland",
    reportError: options.reportError || ((error) => console.error("[MES] Directory Statuses React island failed", error)),
    scope: "statuses", targetAttribute: "data-react-directory-statuses-island",
  });
}
