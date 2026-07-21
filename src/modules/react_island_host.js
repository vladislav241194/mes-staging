function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizeTelemetryText(value, maximumLength = 96) {
  return String(value || "").slice(0, maximumLength);
}

function renderReactRuntimeError(target, reason) {
  if (!(target instanceof HTMLElement)) return;
  const section = document.createElement("section");
  section.className = "mes-react-runtime-error";
  section.setAttribute("role", "alert");
  const title = document.createElement("strong");
  title.textContent = "React-модуль временно недоступен";
  const description = document.createElement("p");
  description.textContent = `Код ошибки: ${String(reason || "render-error")}`;
  section.append(title, description);
  target.replaceChildren(section);
  target.dataset.reactIslandState = "error";
  target.dataset.reactIslandFailure = String(reason || "render-error");
  target.setAttribute("aria-busy", "false");
}

function resolveRenderTarget(renderTarget, context) {
  return String(typeof renderTarget === "function" ? renderTarget(context) : renderTarget || "");
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
  canFallbackToLegacy = () => true,
  getShellState = () => null,
  getTelemetryContext = () => ({}),
  reportTelemetry = null,
  reportError = (error) => console.error("[MES] React island failed", error),
} = {}) {
  let island = null;
  let loadRevision = 0;
  let fallbackReason = "";
  let failureReason = "";
  let lastShellTelemetryKey = "";

  const emitTelemetry = ({ activation = {}, durationMs = null, reason = "", revision = null, scope = "", stage = "runtime", state }) => {
    const context = getTelemetryContext?.(activation) || {};
    const event = Object.freeze({
      surfaceId: normalizeTelemetryText(context.surfaceId),
      runtimeMode: normalizeTelemetryText(context.runtimeMode || activation.runtimeMode),
      policyId: normalizeTelemetryText(context.policyId),
      releaseVersion: normalizeTelemetryText(context.releaseVersion || globalThis.window?.__MES_DEPLOY_VERSION__ || "dev"),
      state: normalizeTelemetryText(state, 24),
      stage: normalizeTelemetryText(stage, 24),
      reason: normalizeTelemetryText(reason),
      scope: normalizeTelemetryText(scope),
      revision: revision !== null && Number.isFinite(Number(revision)) ? Number(revision) : null,
      durationMs: durationMs !== null && Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : null,
    });
    try {
      if (typeof reportTelemetry === "function") {
        reportTelemetry(event);
        return;
      }
      if (event.surfaceId && typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
        globalThis.dispatchEvent(new globalThis.CustomEvent("mes:react-island-telemetry", { detail: event }));
      }
    } catch {
      // Telemetry must never alter the selected renderer or its rollback path.
    }
  };

  const dispose = () => {
    loadRevision += 1;
    const mountedIsland = island;
    island = null;
    mountedIsland?.unmount?.();
  };

  const requestFallback = (reason, error = null, scope = "", target = null) => {
    if (fallbackReason || failureReason) return;
    const normalizedReason = String(reason || "render-error");
    const activation = getActivation?.() || {};
    if (error) reportError(normalizeError(error));
    if (!canFallbackToLegacy(activation)) {
      failureReason = normalizedReason;
      dispose();
      renderReactRuntimeError(target, normalizedReason);
      emitTelemetry({ activation, state: "error", stage: normalizedReason === "mount-error" ? "mount" : normalizedReason === "render-error" ? "render" : "runtime", reason: normalizedReason, scope });
      return;
    }
    fallbackReason = normalizedReason;
    dispose();
    emitTelemetry({ activation, state: "legacy-fallback", stage: normalizedReason === "mount-error" ? "mount" : normalizedReason === "render-error" ? "render" : "runtime", reason: normalizedReason, scope });
    queueMicrotask(() => requestLegacyRender?.(fallbackReason, String(scope || "")));
  };

  const getDecision = () => {
    if (fallbackReason) return { activateReact: false, reason: fallbackReason };
    if (failureReason) return { activateReact: true, reason: failureReason };
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
      const activation = getActivation?.() || {};
      const shellState = failureReason
        ? { state: "error", stage: "runtime", reason: failureReason }
        : getShellState?.(activation) || null;
      if (shellState) {
        const telemetryKey = [shellState.state, shellState.stage, shellState.reason].map((value) => String(value || "")).join(":");
        if (telemetryKey && telemetryKey !== lastShellTelemetryKey) {
          lastShellTelemetryKey = telemetryKey;
          emitTelemetry({ activation, state: shellState.state, stage: shellState.stage, reason: shellState.reason });
        }
      }
      return resolveRenderTarget(renderTarget, { activation, failureReason, shellState });
    },
    isReactEligible() {
      return getDecision().activateReact;
    },
    async mount() {
      const decision = getDecision();
      if (!decision.activateReact) return false;
      if (failureReason) return false;
      const activation = getActivation?.() || {};
      if (getShellState?.(activation)) return false;
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
          onError: (error) => requestFallback("render-error", error, "", target),
          onReady: ({ revision: readyRevision }) => {
            const readyAt = globalThis.performance?.now?.() ?? Date.now();
            const durationMs = Math.max(0, readyAt - mountStartedAt);
            target.dataset.reactIslandState = "ready";
            target.dataset.reactIslandRevision = String(readyRevision);
            target.dataset.reactIslandCommitMs = durationMs.toFixed(2);
            target.setAttribute("aria-busy", "false");
            lastShellTelemetryKey = "ready";
            emitTelemetry({ activation, state: "ready", stage: "commit", revision: readyRevision, durationMs });
          },
          onRequestLegacy: (scope) => requestFallback("unsupported-scope", null, scope, target),
        });
        return true;
      } catch (error) {
        if (revision === loadRevision) requestFallback("mount-error", error, "", target);
        return false;
      }
    },
    dispose,
    getFallbackReason: () => fallbackReason,
    getFailureReason: () => failureReason,
  });
}
