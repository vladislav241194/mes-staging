const STRUCTURE_EMPLOYEES_REACT_TARGET = "[data-react-structure-employees-island]";
const STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION__";

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createStructureEmployeesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Structure Employees React island failed", error),
} = {}) {
  let island = null;
  let loadRevision = 0;
  let fallbackReason = "";

  const dispose = () => {
    loadRevision += 1;
    const mountedIsland = island;
    island = null;
    mountedIsland?.unmount?.();
  };

  const requestFallback = (reason, error = null, scope = "") => {
    if (fallbackReason) return;
    fallbackReason = String(reason || "render-error");
    if (error) reportError(normalizeError(error));
    dispose();
    queueMicrotask(() => requestLegacyRender?.(fallbackReason, String(scope || "")));
  };

  const getDecision = () => {
    const activation = getActivation?.() || {};
    if (fallbackReason) return { activateReact: false, reason: fallbackReason };
    if (!activation.featureFlagEnabled) return { activateReact: false, reason: "disabled" };
    if (!activation.serverReadReady) return { activateReact: false, reason: "server-read-pending" };
    if (activation.accessMode !== "read-only-evaluation") {
      return { activateReact: false, reason: "write-parity-incomplete" };
    }
    return { activateReact: true, reason: "eligible" };
  };

  return Object.freeze({
    prepareRender() {
      dispose();
      return getDecision();
    },
    renderTarget() {
      return '<div class="mes-react-structure-employees-island" data-react-structure-employees-island data-react-island-state="loading" aria-live="polite"></div>';
    },
    isReactEligible() {
      return getDecision().activateReact;
    },
    async mount() {
      const decision = getDecision();
      if (!decision.activateReact) return false;
      const root = getTargetRoot?.();
      const target = root?.querySelector?.(STRUCTURE_EMPLOYEES_REACT_TARGET);
      if (!(target instanceof HTMLElement)) return false;
      const revision = ++loadRevision;
      const mountStartedAt = globalThis.performance?.now?.() ?? Date.now();
      try {
        const islandUrl = new URL("./react-islands/structure-employees.js", import.meta.url);
        const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
        const bundleVersion = STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION.startsWith("__MES_")
          ? deployVersion
          : STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION;
        islandUrl.searchParams.set("v", bundleVersion);
        const { mountStructureEmployeesReactIsland } = await import(islandUrl.href);
        if (revision !== loadRevision || !getDecision().activateReact || !target.isConnected) return false;
        island = mountStructureEmployeesReactIsland(target, getPayload?.(), {
          onError: (error) => requestFallback("render-error", error),
          onReady: ({ revision: readyRevision }) => {
            const readyAt = globalThis.performance?.now?.() ?? Date.now();
            target.dataset.reactIslandState = "ready";
            target.dataset.reactIslandRevision = String(readyRevision);
            target.dataset.reactIslandCommitMs = Math.max(0, readyAt - mountStartedAt).toFixed(2);
          },
          onRequestLegacy: (scope) => requestFallback("unsupported-scope", null, scope),
        });
        return true;
      } catch (error) {
        if (revision === loadRevision) requestFallback("mount-error", error);
        return false;
      }
    },
    dispose,
    getFallbackReason: () => fallbackReason,
  });
}
