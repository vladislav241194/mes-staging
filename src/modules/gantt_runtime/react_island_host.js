import { createReactIslandHost } from "../react_island_host.js";

const GANTT_REACT_TARGET = "[data-react-gantt-island]";
const GANTT_REACT_BUNDLE_VERSION = "__MES_GANTT_REACT_BUNDLE_VERSION__";

export function createGanttReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, navigate, reportError = (error) => console.error("[MES] Gantt React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: GANTT_REACT_TARGET,
    renderTarget: '<div class="mes-react-gantt-island" data-react-gantt-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.runtimeReady) return "runtime-not-ready";
      if (!activation.postgresProjectionReady) return "postgres-projection-not-ready";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/gantt.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = GANTT_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : GANTT_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountGanttReactIsland(target, payload, { onError, onReady, onRequestLegacy, onCommand: executeCommand ? (command) => executeCommand(command) : undefined, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined }),
  });
}
