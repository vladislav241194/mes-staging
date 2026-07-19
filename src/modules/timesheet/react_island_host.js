import { createReactIslandHost } from "../react_island_host.js";

const TIMESHEET_REACT_TARGET = "[data-react-timesheet-island]";
const TIMESHEET_REACT_BUNDLE_VERSION = "__MES_TIMESHEET_REACT_BUNDLE_VERSION__";

export function createTimesheetReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, reportError = (error) => console.error("[MES] Timesheet React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: TIMESHEET_REACT_TARGET,
    renderTarget: '<div class="mes-react-timesheet-island" data-react-timesheet-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/timesheet.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = TIMESHEET_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : TIMESHEET_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountTimesheetReactIsland(target, payload, { onError, onReady, onRequestLegacy, onCommand: (command) => executeCommand?.(command) }),
  });
}
