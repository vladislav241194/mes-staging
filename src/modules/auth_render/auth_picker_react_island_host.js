import { createReactIslandHost } from "../react_island_host.js";

const AUTH_PICKER_TARGET = "[data-react-auth-picker-island]";
const AUTH_PICKER_BUNDLE_VERSION = "__MES_AUTH_PICKER_REACT_BUNDLE_VERSION__";

export function createAuthPickerReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, reportError = (error) => console.error("[MES] Authorization picker React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: AUTH_PICKER_TARGET,
    renderTarget: '<div class="mes-react-auth-picker-island" data-react-auth-picker-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.moduleReady) return "module-not-ready";
      if (!activation.systemDomainsReady) return "postgres-system-domains-not-ready";
      if (!activation.authGateReady) return "auth-gate-not-locked";
      if (!activation.pickerReady) return "pin-step-owned-by-legacy";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") return "security-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/auth-picker.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = AUTH_PICKER_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : AUTH_PICKER_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountAuthPickerReactIsland(target, payload, { onError, onReady, onRequestLegacy, onCommand: (command) => executeCommand?.(command) }),
  });
}
