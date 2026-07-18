function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

export function createReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  getIneligibilityReason,
  targetSelector,
  renderTarget,
  loadIsland,
  mountIsland,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] React island failed", error),
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
    if (fallbackReason) return { activateReact: false, reason: fallbackReason };
    const reason = String(getIneligibilityReason?.(getActivation?.() || {}) || "");
    return reason
      ? { activateReact: false, reason }
      : { activateReact: true, reason: "eligible" };
  };

  return Object.freeze({
    prepareRender() {
      dispose();
      return getDecision();
    },
    renderTarget() {
      return String(renderTarget || "");
    },
    isReactEligible() {
      return getDecision().activateReact;
    },
    async mount() {
      const decision = getDecision();
      if (!decision.activateReact) return false;
      const root = getTargetRoot?.();
      const target = root?.querySelector?.(targetSelector);
      if (!(target instanceof HTMLElement)) return false;
      const revision = ++loadRevision;
      const mountStartedAt = globalThis.performance?.now?.() ?? Date.now();
      try {
        const loadedIsland = await loadIsland?.();
        if (revision !== loadRevision || !getDecision().activateReact || !target.isConnected) return false;
        island = mountIsland?.({
          loadedIsland,
          target,
          payload: getPayload?.(),
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
