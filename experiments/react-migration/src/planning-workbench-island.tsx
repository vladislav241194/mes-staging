import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { PlanningWorkbenchScenario } from "./modules/planning-workbench/PlanningWorkbenchScenario";
export interface PlanningWorkbenchIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountPlanningWorkbenchReactIsland(target: HTMLElement, initialPayload: unknown, options: PlanningWorkbenchIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <PlanningWorkbenchScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
