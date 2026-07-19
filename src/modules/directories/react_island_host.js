import { createReactIslandHost } from "../react_island_host.js";

const COMPONENT_TYPES_VERSION = "__MES_DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION__";
const OPERATIONS_VERSION = "__MES_DIRECTORY_OPERATIONS_REACT_BUNDLE_VERSION__";
const NOMENCLATURE_TYPES_VERSION = "__MES_DIRECTORY_NOMENCLATURE_TYPES_REACT_BUNDLE_VERSION__";
const STATUSES_VERSION = "__MES_DIRECTORY_STATUSES_REACT_BUNDLE_VERSION__";

function createDirectoryReadIslandHost({
  allowWriteEvaluation = false,
  bundleName,
  bundleVersion,
  className,
  getActivation,
  getPayload,
  getTargetRoot,
  mountExport,
  reportError,
  requestLegacyRender,
  executeCommand,
  scope,
  targetAttribute,
}) {
  const targetSelector = `[${targetAttribute}]`;
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector,
    renderTarget: `<div class="${className}" ${targetAttribute} data-react-island-state="loading" aria-live="polite"></div>`,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.activeSection !== scope) return "unsupported-scope";
      if (activation.accessMode !== "read-only-evaluation" && !(allowWriteEvaluation && activation.accessMode === "write-evaluation")) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL(`./react-islands/${bundleName}.js`, import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      islandUrl.searchParams.set("v", bundleVersion.startsWith("__MES_") ? deployVersion : bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland[mountExport](target, payload, {
        onError,
        onReady,
        onRequestLegacy: () => onRequestLegacy("legacy-directory"),
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
    className: "mes-react-directory-nomenclature-types-island",
    mountExport: "mountNomenclatureTypesReactIsland",
    reportError: options.reportError || ((error) => console.error("[MES] Directory Nomenclature Types React island failed", error)),
    scope: "nomenclatureTypes",
    targetAttribute: "data-react-directory-nomenclature-types-island",
  });
}

export function createDirectoryStatusesReactIslandHost(options = {}) {
  return createDirectoryReadIslandHost({
    ...options,
    bundleName: "statuses", bundleVersion: STATUSES_VERSION,
    className: "mes-react-directory-statuses-island", mountExport: "mountStatusesReactIsland",
    reportError: options.reportError || ((error) => console.error("[MES] Directory Statuses React island failed", error)),
    scope: "statuses", targetAttribute: "data-react-directory-statuses-island",
  });
}
