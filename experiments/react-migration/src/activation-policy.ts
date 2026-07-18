export type NomenclatureAccessMode = "read-only-evaluation" | "editor";
export type NomenclaturePane = "items" | "boards";
export type NomenclatureActivationReason = "eligible" | "disabled" | "unsupported-scope" | "write-parity-incomplete";

export interface NomenclatureActivationContext {
  featureFlagEnabled: boolean;
  activePane: NomenclaturePane;
  accessMode: NomenclatureAccessMode;
}

export interface NomenclatureActivationDecision {
  activateReact: boolean;
  reason: NomenclatureActivationReason;
}

export function resolveNomenclatureActivation(context: NomenclatureActivationContext): NomenclatureActivationDecision {
  if (!context.featureFlagEnabled) return { activateReact: false, reason: "disabled" };
  if (context.activePane !== "items") return { activateReact: false, reason: "unsupported-scope" };
  if (context.accessMode !== "read-only-evaluation") return { activateReact: false, reason: "write-parity-incomplete" };
  return { activateReact: true, reason: "eligible" };
}
