import { createReactIslandHost } from "../react_island_host.js";

const DIRECTORY_COMPONENT_TYPES_REACT_TARGET = "[data-react-directory-component-types-island]";
const DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION = "__MES_DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION__";

export function createDirectoryComponentTypesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Directory Component Types React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: DIRECTORY_COMPONENT_TYPES_REACT_TARGET,
    renderTarget: '<div class="mes-react-directory-component-types-island" data-react-directory-component-types-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.activeSection !== "componentTypes") return "unsupported-scope";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/component-types.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland.mountComponentTypesReactIsland(target, payload, {
        onError,
        onReady,
        onRequestLegacy: () => onRequestLegacy("operations"),
      })
    ),
  });
}
