export type ReadOnlyAccessMode = "read-only-evaluation" | "editor";
export type NomenclaturePane = "items" | "boards";
export type ReadOnlyActivationReason = "eligible" | "disabled" | "unsupported-scope" | "write-parity-incomplete";

export interface NomenclatureActivationContext {
  featureFlagEnabled: boolean;
  activePane: NomenclaturePane;
  accessMode: ReadOnlyAccessMode;
}

export interface ReadOnlyActivationDecision {
  activateReact: boolean;
  reason: ReadOnlyActivationReason;
}

export function resolveReadOnlyScenarioActivation(context: { featureFlagEnabled: boolean; accessMode: ReadOnlyAccessMode; supportedScope?: boolean }): ReadOnlyActivationDecision {
  if (!context.featureFlagEnabled) return { activateReact: false, reason: "disabled" };
  if (context.supportedScope === false) return { activateReact: false, reason: "unsupported-scope" };
  if (context.accessMode !== "read-only-evaluation") return { activateReact: false, reason: "write-parity-incomplete" };
  return { activateReact: true, reason: "eligible" };
}

export function resolveNomenclatureActivation(context: NomenclatureActivationContext): ReadOnlyActivationDecision {
  return resolveReadOnlyScenarioActivation({ ...context, supportedScope: context.activePane === "items" });
}
