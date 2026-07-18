export interface ReactIslandHandle {
  update(payload: unknown): void;
  unmount(): void;
}

export type ReactIslandFeatureState = "idle" | "react" | "legacy" | "disposed";
export type LegacyFallbackReason = "disabled" | "mount-error" | "render-error" | "unsupported-scope";

export interface LegacyFallbackContext {
  reason: LegacyFallbackReason;
  error?: Error;
}

export interface ReactIslandFeatureGateOptions<TTarget> {
  enabled: boolean;
  target: TTarget;
  mount(target: TTarget, payload: unknown, onError: (error: Error) => void): ReactIslandHandle;
  renderLegacy(context: LegacyFallbackContext): void;
  schedule?(task: () => void): void;
}

export interface ReactIslandFeatureGate {
  activate(payload: unknown): ReactIslandFeatureState;
  update(payload: unknown): boolean;
  requestLegacy(reason: "unsupported-scope"): boolean;
  dispose(): void;
  getState(): ReactIslandFeatureState;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function createReactIslandFeatureGate<TTarget>(options: ReactIslandFeatureGateOptions<TTarget>): ReactIslandFeatureGate {
  const schedule = options.schedule ?? queueMicrotask;
  let state: ReactIslandFeatureState = "idle";
  let island: ReactIslandHandle | null = null;
  let fallbackScheduled = false;

  const renderLegacy = (context: LegacyFallbackContext) => {
    if (state === "disposed" || state === "legacy") return;
    const mountedIsland = island;
    island = null;
    fallbackScheduled = false;
    try {
      mountedIsland?.unmount();
    } finally {
      state = "legacy";
      options.renderLegacy(context);
    }
  };

  const scheduleRenderFallback = (error: unknown) => {
    if (state === "disposed" || state === "legacy" || fallbackScheduled) return;
    fallbackScheduled = true;
    schedule(() => {
      if (state === "disposed") return;
      renderLegacy({ reason: "render-error", error: normalizeError(error) });
    });
  };

  return {
    activate(payload) {
      if (state === "disposed") throw new Error("React island feature gate is disposed");
      if (!options.enabled) {
        renderLegacy({ reason: "disabled" });
        return state;
      }
      try {
        island = options.mount(options.target, payload, scheduleRenderFallback);
        state = "react";
      } catch (error) {
        renderLegacy({ reason: "mount-error", error: normalizeError(error) });
      }
      return state;
    },
    update(payload) {
      if (state !== "react" || !island) return false;
      try {
        island.update(payload);
        return true;
      } catch (error) {
        scheduleRenderFallback(error);
        return false;
      }
    },
    requestLegacy(reason) {
      if (state !== "react") return false;
      renderLegacy({ reason });
      return true;
    },
    dispose() {
      if (state === "disposed") return;
      state = "disposed";
      fallbackScheduled = false;
      const mountedIsland = island;
      island = null;
      mountedIsland?.unmount();
    },
    getState() {
      return state;
    },
  };
}
