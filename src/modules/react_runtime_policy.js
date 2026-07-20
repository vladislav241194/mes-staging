import { MES_RUNTIME_CONFIG } from "../app_constants.js";

const MODES = new Set(["legacy", "evaluation", "react"]);

export function getReactRuntimeMode(surfaceId, runtimeConfig = MES_RUNTIME_CONFIG) {
  const mode = String(runtimeConfig?.MES_REACT_RUNTIME_POLICY?.surfaces?.[surfaceId] || "legacy");
  return MODES.has(mode) ? mode : "legacy";
}

export function resolveReactRuntimeActivation({
  surfaceId,
  runtimeConfig = MES_RUNTIME_CONFIG,
  evaluationFeatureEnabled = false,
  evaluationRequested = false,
  localQaEnabled = false,
} = {}) {
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
