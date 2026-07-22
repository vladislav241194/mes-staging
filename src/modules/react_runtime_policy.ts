import { MES_RUNTIME_CONFIG } from "../app_constants.js";

export type ReactRuntimeMode = "legacy" | "evaluation" | "react";
export type ReactRuntimeAccessMode = "legacy" | "read-only-evaluation" | "react";

export interface ReactRuntimeConfig {
  MES_REACT_RUNTIME_POLICY?: {
    surfaces?: Record<string, unknown> | null;
  } | null;
}

export interface ReactRuntimeActivation {
  readonly runtimeMode: ReactRuntimeMode;
  readonly featureFlagEnabled: boolean;
  readonly accessMode: ReactRuntimeAccessMode;
}

export interface ResolveReactRuntimeActivationOptions {
  surfaceId?: string;
  runtimeConfig?: ReactRuntimeConfig | null;
  evaluationFeatureEnabled?: unknown;
  evaluationRequested?: unknown;
  localQaEnabled?: unknown;
}

const MODES: ReadonlySet<string> = new Set(["legacy", "evaluation", "react"]);

export function getReactRuntimeMode(
  surfaceId?: string,
  runtimeConfig: ReactRuntimeConfig | null = MES_RUNTIME_CONFIG as ReactRuntimeConfig,
): ReactRuntimeMode {
  const mode = String(runtimeConfig?.MES_REACT_RUNTIME_POLICY?.surfaces?.[surfaceId as string] || "legacy");
  return MODES.has(mode) ? mode as ReactRuntimeMode : "legacy";
}

export function resolveReactRuntimeActivation({
  surfaceId,
  runtimeConfig = MES_RUNTIME_CONFIG as ReactRuntimeConfig,
  evaluationFeatureEnabled = false,
  evaluationRequested = false,
  localQaEnabled = false,
}: ResolveReactRuntimeActivationOptions = {}): Readonly<ReactRuntimeActivation> {
  const runtimeMode = getReactRuntimeMode(surfaceId, runtimeConfig);
  if (runtimeMode === "react") {
    return Object.freeze({ runtimeMode, featureFlagEnabled: true, accessMode: "react" });
  }
  if (runtimeMode !== "evaluation") {
    return Object.freeze({ runtimeMode: "legacy", featureFlagEnabled: false, accessMode: "legacy" });
  }
  const evaluationActive = Boolean((evaluationFeatureEnabled && evaluationRequested) || localQaEnabled);
  return Object.freeze({
    runtimeMode,
    featureFlagEnabled: evaluationActive,
    accessMode: evaluationActive ? "read-only-evaluation" : "legacy",
  });
}
