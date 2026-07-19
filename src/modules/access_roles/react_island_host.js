import { createReactIslandHost } from "../react_island_host.js";

const ROLES_REACT_TARGET = "[data-react-roles-island]";
const ROLES_REACT_BUNDLE_VERSION = "__MES_ROLES_REACT_BUNDLE_VERSION__";

export function createRolesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  executeCommand,
  reportError = (error) => console.error("[MES] Roles React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: ROLES_REACT_TARGET,
    renderTarget: '<div class="mes-react-roles-island" data-react-roles-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/roles.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = ROLES_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : ROLES_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland.mountRolesReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined })
    ),
  });
}
