declare global {
  interface Window {
    __MES_DEPLOY_VERSION__?: unknown;
  }
}

export interface ReactIslandHandle<TPayload> {
  unmount?: () => void;
  update?: (payload: TPayload | undefined) => void;
}

export interface ReactIslandShellState {
  state: unknown;
  stage?: unknown;
  reason?: unknown;
}

export interface ReactIslandTelemetryContext {
  surfaceId?: unknown;
  runtimeMode?: unknown;
  policyId?: unknown;
  releaseVersion?: unknown;
}

export interface ReactIslandTelemetryEvent {
  readonly surfaceId: string;
  readonly runtimeMode: string;
  readonly policyId: string;
  readonly releaseVersion: string;
  readonly state: string;
  readonly stage: string;
  readonly reason: string;
  readonly scope: string;
  readonly revision: number | null;
  readonly durationMs: number | null;
}

export interface ReactIslandRenderContext<TActivation extends object> {
  activation: TActivation;
  failureReason: string;
  shellState: ReactIslandShellState | null;
}

export interface ReactIslandMountContext<TLoaded, TPayload> {
  loadedIsland: Awaited<TLoaded> | undefined;
  target: HTMLElement;
  payload: TPayload | undefined;
  onError: (error: unknown) => void;
  onReady: (result: { revision: unknown }) => void;
  onRequestLegacy: (scope: unknown) => void;
}

export interface ReactIslandTargetRoot {
  querySelector?(selector: string): unknown;
}

export interface ReactIslandHostOptions<
  TActivation extends object = Record<string, unknown>,
  TPayload = unknown,
  TLoaded = unknown,
> {
  getActivation?: () => TActivation;
  getPayload?: () => TPayload;
  getTargetRoot?: () => ReactIslandTargetRoot | null | undefined;
  getIneligibilityReason?: (activation: TActivation) => unknown;
  targetSelector?: string;
  renderTarget?: string | ((context: ReactIslandRenderContext<TActivation>) => unknown);
  loadIsland?: () => TLoaded | Promise<TLoaded>;
  mountIsland?: (context: ReactIslandMountContext<TLoaded, TPayload>) => ReactIslandHandle<TPayload> | null | undefined;
  requestLegacyRender?: (reason: string, scope: string) => void;
  canFallbackToLegacy?: (activation: TActivation) => boolean;
  getShellState?: (activation: TActivation) => ReactIslandShellState | null | undefined;
  getTelemetryContext?: (activation: TActivation) => ReactIslandTelemetryContext | null | undefined;
  reportTelemetry?: ((event: Readonly<ReactIslandTelemetryEvent>) => void) | null;
  reportError?: (error: Error) => void;
}

export interface ReactIslandHost {
  prepareRender(): ReactIslandDecision;
  renderTarget(): string;
  isReactEligible(): boolean;
  mount(): Promise<boolean>;
  update(): boolean;
  dispose(): void;
  getFallbackReason(): string;
  getFailureReason(): string;
}

export interface ReactIslandDecision {
  activateReact: boolean;
  reason: string;
}

interface ReactIslandTelemetryInput<TActivation extends object> {
  activation?: TActivation;
  durationMs?: unknown;
  reason?: unknown;
  revision?: unknown;
  scope?: unknown;
  stage?: unknown;
  state: unknown;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizeTelemetryText(value: unknown, maximumLength = 96): string {
  return String(value || "").slice(0, maximumLength);
}

function renderReactRuntimeError(target: unknown, reason: unknown): void {
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

function resolveRenderTarget<TActivation extends object>(
  renderTarget: ReactIslandHostOptions<TActivation>["renderTarget"],
  context: ReactIslandRenderContext<TActivation>,
): string {
  return String(typeof renderTarget === "function" ? renderTarget(context) : renderTarget || "");
}

export function createReactIslandHost<
  TActivation extends object = Record<string, unknown>,
  TPayload = unknown,
  TLoaded = unknown,
>({
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
}: ReactIslandHostOptions<TActivation, TPayload, TLoaded> = {}): Readonly<ReactIslandHost> {
  let island: ReactIslandHandle<TPayload> | null | undefined = null;
  let loadRevision = 0;
  let fallbackReason = "";
  let failureReason = "";
  let lastShellTelemetryKey = "";

  const emitTelemetry = ({ activation = {} as TActivation, durationMs = null, reason = "", revision = null, scope = "", stage = "runtime", state }: ReactIslandTelemetryInput<TActivation>): void => {
    const context: ReactIslandTelemetryContext = getTelemetryContext?.(activation) || {};
    const event: Readonly<ReactIslandTelemetryEvent> = Object.freeze({
      surfaceId: normalizeTelemetryText(context.surfaceId),
      runtimeMode: normalizeTelemetryText(context.runtimeMode || (activation as { runtimeMode?: unknown }).runtimeMode),
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

  const dispose = (): void => {
    loadRevision += 1;
    const mountedIsland = island;
    island = null;
    mountedIsland?.unmount?.();
  };

  const requestFallback = (reason: unknown, error: unknown = null, scope: unknown = "", target: unknown = null): void => {
    if (fallbackReason || failureReason) return;
    const normalizedReason = String(reason || "render-error");
    const activation = (getActivation?.() || {}) as TActivation;
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

  const getDecision = (): ReactIslandDecision => {
    if (fallbackReason) return { activateReact: false, reason: fallbackReason };
    if (failureReason) return { activateReact: true, reason: failureReason };
    const reason = String(getIneligibilityReason?.((getActivation?.() || {}) as TActivation) || "");
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
      const activation = (getActivation?.() || {}) as TActivation;
      const shellState: ReactIslandShellState | null = failureReason
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
      const activation = (getActivation?.() || {}) as TActivation;
      if (getShellState?.(activation)) return false;
      const root = getTargetRoot?.();
      const target = root?.querySelector?.(targetSelector as string);
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
    update() {
      const activation = (getActivation?.() || {}) as TActivation;
      if (!island || !getDecision().activateReact || getShellState?.(activation)) return false;
      const root = getTargetRoot?.();
      const target = root?.querySelector?.(targetSelector as string);
      if (!(target instanceof HTMLElement) || !target.isConnected) return false;
      try {
        island.update?.(getPayload?.());
        return true;
      } catch (error) {
        requestFallback("render-error", error, "", target);
        return false;
      }
    },
    dispose,
    getFallbackReason: () => fallbackReason,
    getFailureReason: () => failureReason,
  });
}
