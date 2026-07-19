import { createReactIslandHost } from "../react_island_host.js";

const STRUCTURE_EMPLOYEES_REACT_TARGET = "[data-react-structure-employees-island]";
const STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION__";
const STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION__";

export function createStructureEmployeesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Structure Employees React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: STRUCTURE_EMPLOYEES_REACT_TARGET,
    renderTarget: '<div class="mes-react-structure-employees-island" data-react-structure-employees-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") {
        return "write-parity-incomplete";
      }
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-employees.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland.mountStructureEmployeesReactIsland(target, payload, {
        onError,
        onReady,
        onRequestLegacy,
      })
    ),
  });
}

export function createStructurePositionsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Structure Positions React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: "[data-react-structure-positions-island]",
    renderTarget: '<div class="mes-react-structure-positions-island" data-react-structure-positions-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-positions.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland.mountStructurePositionsReactIsland(target, payload, { onError, onReady, onRequestLegacy })
    ),
  });
}
