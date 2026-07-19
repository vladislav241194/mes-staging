import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureResponsibilityPoliciesScenario } from "./modules/structure-responsibility-policies/StructureResponsibilityPoliciesScenario";
export interface StructureResponsibilityPoliciesIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountStructureResponsibilityPoliciesReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureResponsibilityPoliciesIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureResponsibilityPoliciesScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
