import { createReactIslandHost } from "../react_island_host.js";

const NOMENCLATURE_REACT_TARGET = "[data-react-nomenclature-island]";
const NOMENCLATURE_REACT_BUNDLE_VERSION = "__MES_NOMENCLATURE_REACT_BUNDLE_VERSION__";

export function createNomenclatureReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  executeCommand,
  reportError = (error) => console.error("[MES] Nomenclature React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: NOMENCLATURE_REACT_TARGET,
    renderTarget: '<div class="mes-react-nomenclature-island" data-react-nomenclature-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.activePane !== "items") return "unsupported-scope";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") {
        return "write-parity-incomplete";
      }
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/nomenclature.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = NOMENCLATURE_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : NOMENCLATURE_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland.mountNomenclatureReactIsland(target, payload, {
        onError,
        onReady,
        onRequestLegacy: (scope) => onRequestLegacy(scope),
        onCommand: (command) => executeCommand?.(command),
      })
    ),
  });
}
