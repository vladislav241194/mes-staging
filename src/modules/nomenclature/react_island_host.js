const NOMENCLATURE_REACT_TARGET = "[data-react-nomenclature-island]";

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createNomenclatureReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Nomenclature React island failed", error),
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

  const requestFallback = (reason, error = null) => {
    if (fallbackReason) return;
    fallbackReason = String(reason || "render-error");
    if (error) reportError(normalizeError(error));
    dispose();
    queueMicrotask(() => requestLegacyRender?.(fallbackReason));
  };

  const getDecision = () => {
    const activation = getActivation?.() || {};
    if (fallbackReason) return { activateReact: false, reason: fallbackReason };
    if (!activation.featureFlagEnabled) return { activateReact: false, reason: "disabled" };
    if (activation.activePane !== "items") return { activateReact: false, reason: "unsupported-scope" };
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
      return '<div class="mes-react-nomenclature-island" data-react-nomenclature-island data-react-island-state="loading" aria-live="polite"></div>';
    },
    isReactEligible() {
      return getDecision().activateReact;
    },
    async mount() {
      const decision = getDecision();
      if (!decision.activateReact) return false;
      const root = getTargetRoot?.();
      const target = root?.querySelector?.(NOMENCLATURE_REACT_TARGET);
      if (!(target instanceof HTMLElement)) return false;
      const revision = ++loadRevision;
      try {
        const islandUrl = new URL("./react-islands/nomenclature.js", import.meta.url);
        const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
        islandUrl.searchParams.set("v", deployVersion);
        const { mountNomenclatureReactIsland } = await import(islandUrl.href);
        if (revision !== loadRevision || !getDecision().activateReact || !target.isConnected) return false;
        island = mountNomenclatureReactIsland(target, getPayload?.(), {
          onError: (error) => requestFallback("render-error", error),
          onReady: ({ revision: readyRevision }) => {
            target.dataset.reactIslandState = "ready";
            target.dataset.reactIslandRevision = String(readyRevision);
          },
          onRequestLegacy: () => requestFallback("unsupported-scope"),
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
